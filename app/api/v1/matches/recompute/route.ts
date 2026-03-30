import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { getActiveResume, getOwnedResume } from '@/lib/career-match/queries';
import { recomputeMatchesForResume } from '@/lib/matching/service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { MatchRecomputeSchema } from '@/lib/schemas/career-match';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, MatchRecomputeSchema);
    const limit = await enforceRateLimit('match_recompute', user.id);

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many match recomputes. Try again shortly.', 429);
    }

    const resume = body.resumeId
      ? await getOwnedResume(supabase, user.id, body.resumeId)
      : await getActiveResume(supabase, user.id);

    if (!resume) {
      return fail('NOT_FOUND', 'No active resume found for matching.', 404);
    }

    const count = await recomputeMatchesForResume(supabase, user.id, resume.id);
    return ok({ recomputed: true, matchCount: count, resumeId: resume.id });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
