import { handleApiError, ok, parseJson, fail } from '@/lib/api';
import { captureServerEvent } from '@/lib/analytics/capture-server-event';
import { buildProfileCompletionChecklist } from '@/lib/profile-completion';
import {
  getStarterRecommendations,
  mergeProfileMetadata,
  normalizePersonaSlug,
} from '@/lib/personas';
import { buildProfileCompletionState, requiresPersonaOnboarding } from '@/lib/profile-state';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensureProfileRecord, getRequiredUser, isRecoverableSupabaseReadError } from '@/lib/supabase/helpers';
import { UpdateProfileSchema } from '@/lib/schemas/profile';
import { logError, logInfo } from '@/lib/utils/logger';
import { slugify } from '@/lib/utils/format';

const verboseLogging = process.env.NODE_ENV !== 'production';

async function readOptionalTable<T>(
  queryLabel: string,
  userId: string,
  query: PromiseLike<{ data: T; error: { message?: string; code?: string } | null }>,
  fallback: T,
) {
  const result = await query;

  if (result.error) {
    if (isRecoverableSupabaseReadError(result.error)) {
      if (verboseLogging) {
        logInfo('api-users-me', 'Recoverable optional table read failure', {
          userId,
          queryLabel,
          error: result.error.message ?? 'Unknown optional table error',
        });
      }

      return fallback;
    }

    throw new Error(result.error.message);
  }

  return result.data ?? fallback;
}

function buildFallbackProfile(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
  const emailBase = user.email?.split('@')[0] ?? `user-${user.id.slice(0, 8)}`;
  const username = slugify(emailBase).replace(/-/g, '_').slice(0, 20) || `user_${user.id.slice(0, 8)}`;

  return {
    user_id: user.id,
    username,
    full_name:
      typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null,
    headline: null,
    bio: null,
    primary_persona:
      typeof user.user_metadata?.account_type === 'string'
        ? normalizePersonaSlug(user.user_metadata.account_type)
        : null,
    profile_intent: [] as string[],
    open_to: [] as string[],
    interest_tags: [] as string[],
    expertise_tags: [] as string[],
    onboarding_complete: false,
  };
}

export async function GET() {
  let authUserId: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    authUserId = user.id;

    if (verboseLogging) {
      logInfo('api-users-me', 'users/me request received', {
        userId: user.id,
      });
    }

    let profile = null;

    try {
      profile = await ensureProfileRecord(supabase, user);
    } catch (profileError) {
      const profileErrorForClassification =
        profileError instanceof Error
          ? profileError
          : typeof profileError === 'object' && profileError !== null
            ? (profileError as { message?: string; code?: string })
            : undefined;

      if (isRecoverableSupabaseReadError(profileErrorForClassification)) {
        if (verboseLogging) {
          logInfo('api-users-me', 'Recoverable profile bootstrap/read failure, using fallback profile', {
            userId: user.id,
            error:
              profileError instanceof Error
                ? profileError.message
                : 'Unknown recoverable profile error',
          });
        }
      } else {
        logError('api-users-me', 'Unexpected profile bootstrap failure, using fallback profile', {
          userId: user.id,
          error:
            profileError instanceof Error
              ? profileError.message
              : 'Unknown profile bootstrap error',
        });
      }

      profile = buildFallbackProfile(user);
    }

    const [availableSkills, selectedSkillRows, membershipRows, detailRecord, availableTopics, followedTopicRows, contributionStats] = await Promise.all([
      readOptionalTable(
        'skills',
        user.id,
        supabase.from('skills').select('id, name').order('name', { ascending: true }),
        [] as Array<{ id: string; name: string }>,
      ),
      readOptionalTable(
        'user_skills',
        user.id,
        supabase.from('user_skills').select('skill_id').eq('user_id', user.id),
        [] as Array<{ skill_id: string }>,
      ),
      readOptionalTable(
        'community_memberships',
        user.id,
        supabase.from('community_memberships').select('community_id').eq('user_id', user.id),
        [] as Array<{ community_id: string }>,
      ),
      readOptionalTable(
        'profile_persona_details',
        user.id,
        supabase.from('profile_persona_details').select('*').eq('user_id', user.id).maybeSingle(),
        null,
      ),
      readOptionalTable(
        'topics',
        user.id,
        supabase.from('topics').select('id, slug, label, description').order('label', { ascending: true }),
        [] as Array<{ id: string; slug: string; label: string; description?: string | null }>,
      ),
      readOptionalTable(
        'user_topic_follows',
        user.id,
        supabase.from('user_topic_follows').select('topic_id').eq('user_id', user.id),
        [] as Array<{ topic_id: string }>,
      ),
      readOptionalTable(
        'user_contribution_stats',
        user.id,
        supabase.from('user_contribution_stats').select('*').eq('user_id', user.id).maybeSingle(),
        null,
      ),
    ]);

    const profileCompletion = buildProfileCompletionChecklist({
      profile,
      detailRecord: detailRecord ?? undefined,
      joinedCommunityIds: (membershipRows ?? []).map((item) => item.community_id),
      selectedSkillIds: (selectedSkillRows ?? []).map((item) => item.skill_id),
      contributionStats: contributionStats ?? undefined,
    });

    return ok({
      user: {
        id: user.id,
        email: user.email ?? null,
      },
      profile,
      requires_onboarding: requiresPersonaOnboarding(profile),
      availableSkills,
      selectedSkillIds: (selectedSkillRows ?? []).map((item) => item.skill_id),
      joinedCommunityIds: (membershipRows ?? []).map((item) => item.community_id),
      detailRecord,
      availableTopics,
      followedTopicIds: (followedTopicRows ?? []).map((item) => item.topic_id),
      contributionStats,
      profileCompletion,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    logError('api-users-me', 'users/me GET failed', {
      userId: authUserId,
      error: error instanceof Error ? error.message : 'Unknown users/me GET error',
    });

    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, UpdateProfileSchema);

    const profile = await ensureProfileRecord(supabase, user);
    const primaryPersona = normalizePersonaSlug(body.primary_persona ?? profile.primary_persona);
    const metadata =
      primaryPersona && body.persona_details
        ? mergeProfileMetadata({
            current: body.metadata ?? profile.metadata,
            primaryPersona,
            personaDetails: body.persona_details[primaryPersona] ?? null,
            starterRecommendations: getStarterRecommendations({
              primaryPersona,
              profileIntent: body.profile_intent ?? profile.profile_intent ?? [],
              openTo: body.open_to ?? profile.open_to ?? [],
              interestTags: body.interest_tags ?? profile.interest_tags ?? [],
            }),
          })
        : body.metadata;
    const rest = { ...body };
    delete rest.persona_details;
    delete rest.detail_record;

    const nextProfileSnapshot = {
      ...profile,
      ...rest,
      primary_persona: primaryPersona ?? null,
      metadata: metadata ?? profile.metadata,
    };
    const [userSkillsResult, membershipResult, topicFollowResult] = await Promise.all([
      supabase.from('user_skills').select('skill_id').eq('user_id', user.id),
      supabase.from('community_memberships').select('community_id').eq('user_id', user.id),
      supabase.from('user_topic_follows').select('topic_id').eq('user_id', user.id),
    ]);

    if (userSkillsResult.error) {
      throw new Error(userSkillsResult.error.message);
    }

    if (membershipResult.error) {
      throw new Error(membershipResult.error.message);
    }

    if (topicFollowResult.error) {
      throw new Error(topicFollowResult.error.message);
    }

    const normalizedInterestTags = [...new Set((nextProfileSnapshot.interest_tags ?? []) as string[])];
    const completionScore = buildProfileCompletionState({
      profile: {
        primary_persona: nextProfileSnapshot.primary_persona,
        full_name: nextProfileSnapshot.full_name,
        headline: nextProfileSnapshot.headline,
        bio: nextProfileSnapshot.bio,
        secondary_personas: nextProfileSnapshot.secondary_personas ?? [],
        profile_intent: nextProfileSnapshot.profile_intent ?? [],
        open_to: nextProfileSnapshot.open_to ?? [],
        interest_tags: normalizedInterestTags,
        expertise_tags: nextProfileSnapshot.expertise_tags ?? [],
      },
      joinedCommunityIds: (membershipResult.data ?? []).map((item) => item.community_id),
      selectedSkillIds: (userSkillsResult.data ?? []).map((item) => item.skill_id),
      detailRecord: body.detail_record ?? undefined,
    });
    const updatePayload = {
      ...rest,
      ...(metadata ? { metadata } : {}),
      persona_completion_score: completionScore,
      ...(body.onboarding_complete ? { onboarding_completed_at: new Date().toISOString() } : {}),
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (body.detail_record) {
      const detailUpsert = await supabase
        .from('profile_persona_details')
        .upsert({
          user_id: user.id,
          ...body.detail_record,
        });

      if (detailUpsert.error) {
        throw new Error(detailUpsert.error.message);
      }
    }

    const starterRecommendations = getStarterRecommendations({
      primaryPersona,
      profileIntent: data.profile_intent ?? [],
      openTo: data.open_to ?? [],
      interestTags: normalizedInterestTags,
    });

    if (starterRecommendations.actions.length > 0 || starterRecommendations.topics.length > 0) {
      await supabase
        .from('profiles')
        .update({
          metadata: mergeProfileMetadata({
            current: data.metadata,
            starterRecommendations,
          }),
        })
        .eq('user_id', user.id);
    }

    await captureServerEvent({
      event: 'profile_updated',
      distinctId: user.id,
      properties: {
        updatedFields: Object.keys(updatePayload),
      },
    });

    if (primaryPersona) {
      await supabase
        .from('users')
        .update({ account_type: primaryPersona })
        .eq('id', user.id);
    }

    return ok({
      ...data,
      followedTopicIds: (topicFollowResult.data ?? []).map((item) => item.topic_id),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
