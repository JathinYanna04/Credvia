import { fail, handleApiError, ok } from '@/lib/api';
import { getJobCardsByIds, getOwnedResume } from '@/lib/career-match/queries';
import { getResumeAnalysisReadiness } from '@/lib/resume/analysis-readiness';
import { assessResumeTextQuality } from '@/lib/resume/extract';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const resume = await getOwnedResume(supabase, user.id, params.id);

    if (!resume) {
      return fail('NOT_FOUND', 'Resume not found.', 404);
    }

    const [profileResult, skillsResult, analysesResult, matchesResult] = await Promise.all([
      supabase.from('resume_profiles').select('*').eq('resume_id', resume.id).maybeSingle(),
      supabase
        .from('resume_skills')
        .select('source_type, confidence, skill_slug, skill_name')
        .eq('resume_id', resume.id),
      supabase
        .from('resume_analysis_runs')
        .select('*')
        .eq('resume_id', resume.id)
        .order('started_at', { ascending: false })
        .limit(10),
      supabase
        .from('job_matches')
        .select('*')
        .eq('resume_id', resume.id)
        .eq('user_id', user.id)
        .order('overall_score', { ascending: false })
        .limit(10),
    ]);

    if (profileResult.error) throw new Error(profileResult.error.message);
    if (skillsResult.error) throw new Error(skillsResult.error.message);
    if (analysesResult.error) throw new Error(analysesResult.error.message);
    if (matchesResult.error) throw new Error(matchesResult.error.message);

    const profileLooksValid = Boolean(
      profileResult.data?.parsed_text &&
        assessResumeTextQuality(profileResult.data.parsed_text).isAcceptable,
    );

    const jobs = await getJobCardsByIds(
      supabase,
      profileLooksValid ? (matchesResult.data ?? []).map((match) => match.job_id) : [],
    );
    const jobLookup = new Map(jobs.map((job) => [job.id, job]));
    const latestRun = analysesResult.data?.[0] ?? null;

    return ok({
      resume,
      analysisReadiness: getResumeAnalysisReadiness(resume, latestRun),
      profile: profileLooksValid ? profileResult.data ?? null : null,
      skills: (profileLooksValid ? skillsResult.data ?? [] : []).map((row) => ({
        source: row.source_type,
        confidence: row.confidence,
        skill: { id: row.skill_slug, slug: row.skill_slug, name: row.skill_name },
      })),
      analysisRuns: analysesResult.data ?? [],
      topMatches: (profileLooksValid ? matchesResult.data ?? [] : []).map((match) => ({
        ...match,
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
