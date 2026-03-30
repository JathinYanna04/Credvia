import { fail, handleApiError, ok } from '@/lib/api';
import { getActiveResume, getJobCardsByIds } from '@/lib/career-match/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const resume = await getActiveResume(supabase, user.id);

    if (!resume) {
      return ok({ resume: null, matches: [] });
    }

    const [matchesResult, savedResult] = await Promise.all([
      supabase.from('job_matches').select('*').eq('user_id', user.id).eq('resume_id', resume.id).order('overall_score', { ascending: false }).limit(100),
      supabase.from('saved_job_matches').select('match_id').eq('user_id', user.id),
    ]);

    if (matchesResult.error) throw new Error(matchesResult.error.message);
    if (savedResult.error) throw new Error(savedResult.error.message);

    const jobs = await getJobCardsByIds(
      supabase,
      (matchesResult.data ?? []).map((match) => match.job_id),
    );
    const jobLookup = new Map(jobs.map((job) => [job.id, job]));
    const savedIds = new Set((savedResult.data ?? []).map((row) => row.match_id));

    return ok({
      resume,
      matches: (matchesResult.data ?? []).map((match) => ({
        ...match,
        saved: savedIds.has(match.id),
        job: jobLookup.get(match.job_id) ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
