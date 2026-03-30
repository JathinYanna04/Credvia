import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { SaveJobMatchSchema } from '@/lib/schemas/career-match';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, SaveJobMatchSchema);
    const limit = await enforceRateLimit('match_save', user.id);

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many save changes. Try again shortly.', 429);
    }

    const matchResult = await supabase
      .from('job_matches')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (matchResult.error) throw new Error(matchResult.error.message);
    if (!matchResult.data) {
      return fail('NOT_FOUND', 'Match not found.', 404);
    }

    if (body.saved) {
      const insertResult = await supabase
        .from('saved_job_matches')
        .upsert({ user_id: user.id, match_id: params.id });
      if (insertResult.error) throw new Error(insertResult.error.message);
    } else {
      const deleteResult = await supabase
        .from('saved_job_matches')
        .delete()
        .eq('user_id', user.id)
        .eq('match_id', params.id);
      if (deleteResult.error) throw new Error(deleteResult.error.message);
    }

    return ok({ saved: body.saved });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
