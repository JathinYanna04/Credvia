import { fail, handleApiError, ok } from '@/lib/api';
import { getJobCardsByIds } from '@/lib/career-match/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const [matchResult, savedResult] = await Promise.all([
      supabase.from('job_matches').select('*').eq('id', params.id).eq('user_id', user.id).maybeSingle(),
      supabase.from('saved_job_matches').select('match_id').eq('user_id', user.id).eq('match_id', params.id).maybeSingle(),
    ]);

    if (matchResult.error) throw new Error(matchResult.error.message);
    if (savedResult.error) throw new Error(savedResult.error.message);
    if (!matchResult.data) {
      return fail('NOT_FOUND', 'Match not found.', 404);
    }

    const [job] = await getJobCardsByIds(supabase, [matchResult.data.job_id]);
    return ok({
      ...matchResult.data,
      saved: Boolean(savedResult.data),
      job: job ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
