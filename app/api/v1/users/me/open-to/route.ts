import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { buildProfileCompletionState } from '@/lib/profile-state';
import { OpenToUpdateSchema } from '@/lib/schemas/profile';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensureProfileRecord, getRequiredUser } from '@/lib/supabase/helpers';

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, OpenToUpdateSchema);
    const profile = await ensureProfileRecord(supabase, user);

    const completionScore = buildProfileCompletionState({
      profile: {
        primary_persona: profile.primary_persona,
        full_name: profile.full_name,
        headline: profile.headline,
        bio: profile.bio,
        secondary_personas: profile.secondary_personas ?? [],
        profile_intent: profile.profile_intent ?? [],
        open_to: body.open_to,
        interest_tags: profile.interest_tags ?? [],
        expertise_tags: profile.expertise_tags ?? [],
      },
    });

    const result = await supabase
      .from('profiles')
      .update({
        open_to: body.open_to,
        open_for_opportunities: body.open_for_opportunities ?? profile.open_for_opportunities,
        open_for_mentorship: body.open_for_mentorship ?? profile.open_for_mentorship,
        open_for_hiring: body.open_for_hiring ?? profile.open_for_hiring,
        persona_completion_score: completionScore,
      })
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (result.error) {
      throw new Error(result.error.message);
    }

    return ok(result.data);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
