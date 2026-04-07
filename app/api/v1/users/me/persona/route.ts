import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { buildProfileCompletionState } from '@/lib/profile-state';
import { getStarterRecommendations, mergeProfileMetadata, normalizePersonaSlug } from '@/lib/personas';
import { PersonaPreferencesSchema } from '@/lib/schemas/profile';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensureProfileRecord, getRequiredUser } from '@/lib/supabase/helpers';

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, PersonaPreferencesSchema);
    const profile = await ensureProfileRecord(supabase, user);
    const primaryPersona = normalizePersonaSlug(body.primary_persona ?? profile.primary_persona);
    const [skillsResult, membershipsResult] = await Promise.all([
      supabase.from('user_skills').select('skill_id').eq('user_id', user.id),
      supabase.from('community_memberships').select('community_id').eq('user_id', user.id),
    ]);

    if (skillsResult.error) {
      throw new Error(skillsResult.error.message);
    }

    if (membershipsResult.error) {
      throw new Error(membershipsResult.error.message);
    }

    const completionScore = buildProfileCompletionState({
      profile: {
        primary_persona: primaryPersona,
        full_name: profile.full_name,
        headline: profile.headline,
        bio: profile.bio,
        secondary_personas: body.secondary_personas ?? profile.secondary_personas ?? [],
        profile_intent: body.profile_intent ?? profile.profile_intent ?? [],
        open_to: profile.open_to ?? [],
        interest_tags: body.interest_tags ?? profile.interest_tags ?? [],
        expertise_tags: body.expertise_tags ?? profile.expertise_tags ?? [],
      },
      joinedCommunityIds: (membershipsResult.data ?? []).map((item) => item.community_id),
      selectedSkillIds: (skillsResult.data ?? []).map((item) => item.skill_id),
      detailRecord: body.detail_record ?? undefined,
    });

    const updateResult = await supabase
      .from('profiles')
      .update({
        primary_persona: primaryPersona,
        secondary_personas: body.secondary_personas,
        profile_intent: body.profile_intent,
        expertise_tags: body.expertise_tags,
        interest_tags: body.interest_tags,
        persona_completion_score: completionScore,
        metadata: mergeProfileMetadata({
          current: profile.metadata,
          starterRecommendations: getStarterRecommendations({
            primaryPersona,
            profileIntent: body.profile_intent ?? profile.profile_intent ?? [],
            openTo: profile.open_to ?? [],
            interestTags: body.interest_tags ?? profile.interest_tags ?? [],
          }),
        }),
      })
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    if (body.detail_record) {
      const detailUpsert = await supabase
        .from('profile_persona_details')
        .upsert({ user_id: user.id, ...body.detail_record });

      if (detailUpsert.error) {
        throw new Error(detailUpsert.error.message);
      }
    }

    if (primaryPersona) {
      await supabase.from('users').update({ account_type: primaryPersona }).eq('id', user.id);
    }

    return ok(updateResult.data);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
