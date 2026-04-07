import { fail, handleApiError, ok } from '@/lib/api';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensureProfileRecord, getRequiredUser } from '@/lib/supabase/helpers';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const profile = await ensureProfileRecord(supabase, user);
    const statsResult = await supabase
      .from('user_contribution_stats')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (statsResult.error) {
      throw new Error(statsResult.error.message);
    }

    return ok({
      scoreSummary: {
        contribution_score: profile.contribution_score,
        credibility_score: profile.credibility_score,
        helpfulness_score: profile.helpfulness_score,
        expertise_score: profile.expertise_score,
        community_score: profile.community_score,
        persona_completion_score: profile.persona_completion_score,
      },
      contributionStats: statsResult.data ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
