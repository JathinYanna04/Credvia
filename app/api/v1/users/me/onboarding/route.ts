import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { captureServerEvent } from '@/lib/analytics/capture-server-event';
import {
  getStarterRecommendations,
  mergeProfileMetadata,
  normalizePersonaSlug,
} from '@/lib/personas';
import {
  buildProfileCompletionState,
  hasBasicOnboardingIdentity,
  requiresPersonaOnboarding,
} from '@/lib/profile-state';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensureProfileRecord, getRequiredUser, isSchemaCompatibilityError } from '@/lib/supabase/helpers';
import { OnboardingSubmissionSchema } from '@/lib/schemas/profile';

function getLegacyProfileUpdatePayload(input: Record<string, unknown>) {
  const legacyPayload: Record<string, unknown> = {};

  for (const key of [
    'username',
    'full_name',
    'avatar_url',
    'headline',
    'bio',
    'location',
    'onboarding_complete',
    'onboarding_completed_at',
  ]) {
    if (key in input) {
      legacyPayload[key] = input[key];
    }
  }

  return legacyPayload;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, OnboardingSubmissionSchema);

    const profile = await ensureProfileRecord(supabase, user);

    const normalizedSkills = body.skills ? [...new Set(body.skills)] as string[] : null;
    const normalizedCommunities = body.communityIds ? [...new Set(body.communityIds)] as string[] : null;
    const normalizedTopics = body.topicIds ? [...new Set(body.topicIds)] as string[] : null;
    const primaryPersona = normalizePersonaSlug(
      body.profile.primary_persona ?? profile.primary_persona,
    );
    const starterRecommendations = getStarterRecommendations({
      primaryPersona,
      profileIntent: body.profile.profile_intent ?? profile.profile_intent ?? [],
      openTo: body.profile.open_to ?? profile.open_to ?? [],
      interestTags: body.profile.interest_tags ?? profile.interest_tags ?? [],
    });
    const metadata =
      primaryPersona && body.profile.persona_details
        ? mergeProfileMetadata({
            current: body.profile.metadata ?? profile.metadata,
            primaryPersona,
            personaDetails: body.profile.persona_details[primaryPersona] ?? null,
            starterRecommendations,
          })
        : mergeProfileMetadata({
            current: body.profile.metadata ?? profile.metadata,
            starterRecommendations,
          });
    const profileFields = { ...body.profile };
    delete profileFields.persona_details;
    delete profileFields.detail_record;
    const completionScore = buildProfileCompletionState({
      profile: {
        primary_persona: primaryPersona,
        full_name: body.profile.full_name ?? profile.full_name,
        headline: body.profile.headline ?? profile.headline,
        bio: body.profile.bio ?? profile.bio,
        secondary_personas: body.profile.secondary_personas ?? profile.secondary_personas ?? [],
        profile_intent: body.profile.profile_intent ?? profile.profile_intent ?? [],
        open_to: body.profile.open_to ?? profile.open_to ?? [],
        interest_tags: body.profile.interest_tags ?? profile.interest_tags ?? [],
        expertise_tags: body.profile.expertise_tags ?? profile.expertise_tags ?? [],
      },
      joinedCommunityIds: normalizedCommunities ?? [],
      selectedSkillIds: normalizedSkills ?? [],
      detailRecord: body.profile.detail_record ?? undefined,
    });
    const onboardingComplete = body.onboarding_complete && hasBasicOnboardingIdentity({
      primary_persona: primaryPersona,
      username: body.profile.username ?? profile.username ?? '',
      full_name: body.profile.full_name ?? profile.full_name,
    });
    const profileUpdatePayload = {
      ...profileFields,
      ...(metadata ? { metadata } : {}),
      onboarding_complete: onboardingComplete,
      onboarding_completed_at: onboardingComplete ? new Date().toISOString() : null,
      onboarding_version: 2,
      persona_completion_score: completionScore,
    };

    if (Object.keys(body.profile).length > 0 || typeof body.onboarding_complete === 'boolean') {
      const profileUpdate = await supabase
        .from('profiles')
        .update(profileUpdatePayload)
        .eq('user_id', user.id);

      if (profileUpdate.error) {
        if (
          profileUpdate.error.message.includes('duplicate key') &&
          profileUpdate.error.message.includes('username')
        ) {
          return fail('VALIDATION_ERROR', 'That username is already taken.', 409);
        }
        if (isSchemaCompatibilityError(profileUpdate.error)) {
          const legacyUpdate = await supabase
            .from('profiles')
            .update(getLegacyProfileUpdatePayload(profileUpdatePayload) as any)
            .eq('user_id', user.id);

          if (legacyUpdate.error) {
            if (
              legacyUpdate.error.message.includes('duplicate key') &&
              legacyUpdate.error.message.includes('username')
            ) {
              return fail('VALIDATION_ERROR', 'That username is already taken.', 409);
            }
            throw new Error(legacyUpdate.error.message);
          }
        } else {
          throw new Error(profileUpdate.error.message);
        }
      }
    }

    if (normalizedSkills) {
      const deleteSkills = await supabase.from('user_skills').delete().eq('user_id', user.id);

      if (deleteSkills.error) {
        throw new Error(deleteSkills.error.message);
      }

      if (normalizedSkills.length > 0) {
        const skillInsert = await supabase.from('user_skills').insert(
          normalizedSkills.map((skillId) => ({
            user_id: user.id,
            skill_id: skillId,
          })),
        );

        if (skillInsert.error) {
          throw new Error(skillInsert.error.message);
        }
      }
    }

    if (normalizedCommunities) {
      const deleteMemberships = await supabase
        .from('community_memberships')
        .delete()
        .eq('user_id', user.id);

      if (deleteMemberships.error) {
        throw new Error(deleteMemberships.error.message);
      }

      if (normalizedCommunities.length > 0) {
        const membershipInsert = await supabase.from('community_memberships').insert(
          normalizedCommunities.map((communityId) => ({
            user_id: user.id,
            community_id: communityId,
            role: 'member',
          })),
        );

        if (membershipInsert.error) {
          throw new Error(membershipInsert.error.message);
        }
      }
    }

    if (normalizedTopics) {
      const deleteTopicFollows = await supabase
        .from('user_topic_follows')
        .delete()
        .eq('user_id', user.id);

      if (deleteTopicFollows.error) {
        if (!isSchemaCompatibilityError(deleteTopicFollows.error)) {
          throw new Error(deleteTopicFollows.error.message);
        }
      }

      if (normalizedTopics.length > 0 && !deleteTopicFollows.error) {
        const topicInsert = await supabase.from('user_topic_follows').insert(
          normalizedTopics.map((topicId) => ({
            user_id: user.id,
            topic_id: topicId,
          })),
        );

        if (topicInsert.error) {
          if (!isSchemaCompatibilityError(topicInsert.error)) {
            throw new Error(topicInsert.error.message);
          }
        }
      }
    }

    if (body.profile.detail_record) {
      const detailUpsert = await supabase
        .from('profile_persona_details')
        .upsert({
          user_id: user.id,
          ...body.profile.detail_record,
        });

      if (detailUpsert.error) {
        if (!isSchemaCompatibilityError(detailUpsert.error)) {
          throw new Error(detailUpsert.error.message);
        }
      }
    }

    if (primaryPersona) {
      const userUpdate = await supabase
        .from('users')
        .update({ account_type: primaryPersona })
        .eq('id', user.id);

      if (userUpdate.error) {
        throw new Error(userUpdate.error.message);
      }
    }

    const requiresOnboarding = requiresPersonaOnboarding({
      onboarding_complete: onboardingComplete,
      primary_persona: primaryPersona,
      username: body.profile.username ?? profile.username ?? '',
      full_name: body.profile.full_name ?? profile.full_name,
      onboarding_version: 2,
      persona_completion_score: completionScore,
    });

    if (onboardingComplete) {
      await captureServerEvent({
        event: 'onboarding_completed',
        distinctId: user.id,
        properties: {
          primaryPersona,
          skillsCount: normalizedSkills?.length ?? 0,
          communitiesCount: normalizedCommunities?.length ?? 0,
          topicsCount: normalizedTopics?.length ?? 0,
          completionScore,
        },
      });
    }

    return ok({
      saved: true,
      skills: normalizedSkills?.length ?? 0,
      communities: normalizedCommunities?.length ?? 0,
      topics: normalizedTopics?.length ?? 0,
      primary_persona: primaryPersona,
      onboarding_complete: onboardingComplete,
      persona_completion_score: completionScore,
      requires_onboarding: requiresOnboarding,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
