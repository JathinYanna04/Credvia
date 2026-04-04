import type { SupabaseClient } from '@supabase/supabase-js';
import type { CareerResumeProfile } from '@/components/career-match/types';
import type { Database } from '@/lib/supabase/types';
import { computeJobMatch } from '@/lib/matching/score';
import { ResumeAnalysisExecutionError } from '@/lib/resume/analysis-error';
import { getEffectiveStructuredProfile } from '@/lib/resume/intelligence';
import { logError, logInfo } from '@/lib/utils/logger';

type TypedSupabaseClient = SupabaseClient<Database>;

export async function recomputeMatchesForResume(
  supabase: TypedSupabaseClient,
  userId: string,
  resumeId: string,
) {
  logInfo('resume-matching', 'Recompute matches started', {
    userId,
    resumeId,
  });

  const [resumeProfileResult, resumeSkillsResult, jobsResult, jobSkillsResult, companiesResult] = await Promise.all([
    supabase.from('resume_profiles').select('*').eq('resume_id', resumeId).maybeSingle(),
    supabase.from('resume_skills').select('skill_slug').eq('resume_id', resumeId),
    supabase.from('startup_jobs').select('*').eq('is_active', true).order('posted_at', { ascending: false }).limit(200),
    supabase.from('job_skills').select('job_id, skill_slug, skill_name, requirement_level, confidence'),
    supabase.from('startup_companies').select('id, company_name').eq('is_hiring', true),
  ]);

  if (resumeProfileResult.error) {
    logError('resume-matching', 'Resume profile query failed', {
      userId,
      resumeId,
      table: 'resume_profiles',
      message: resumeProfileResult.error.message,
      code: resumeProfileResult.error.code ?? null,
    });
    throw new ResumeAnalysisExecutionError({
      code: 'PROFILE_FETCH_FAILED',
      operation: 'load-resume-profile',
      table: 'resume_profiles',
      resumeId,
      userId,
      message: resumeProfileResult.error.message,
      details: resumeProfileResult.error.details ?? null,
      hint: resumeProfileResult.error.hint ?? null,
    });
  }
  if (resumeSkillsResult.error) {
    logError('resume-matching', 'Resume skills query failed', {
      userId,
      resumeId,
      table: 'resume_skills',
      message: resumeSkillsResult.error.message,
      code: resumeSkillsResult.error.code ?? null,
    });
    throw new ResumeAnalysisExecutionError({
      code: 'SKILLS_FETCH_FAILED',
      operation: 'load-resume-skills',
      table: 'resume_skills',
      resumeId,
      userId,
      message: resumeSkillsResult.error.message,
      details: resumeSkillsResult.error.details ?? null,
      hint: resumeSkillsResult.error.hint ?? null,
    });
  }
  if (jobsResult.error) {
    logError('resume-matching', 'Job source query failed', {
      userId,
      resumeId,
      table: 'startup_jobs',
      message: jobsResult.error.message,
      code: jobsResult.error.code ?? null,
    });
    throw new ResumeAnalysisExecutionError({
      code: 'JOBS_FETCH_FAILED',
      operation: 'load-startup-jobs',
      table: 'startup_jobs',
      resumeId,
      userId,
      message: jobsResult.error.message,
      details: jobsResult.error.details ?? null,
      hint: jobsResult.error.hint ?? null,
    });
  }
  if (jobSkillsResult.error) {
    logError('resume-matching', 'Job skills query failed', {
      userId,
      resumeId,
      table: 'job_skills',
      message: jobSkillsResult.error.message,
      code: jobSkillsResult.error.code ?? null,
    });
    throw new ResumeAnalysisExecutionError({
      code: 'JOB_SKILLS_FETCH_FAILED',
      operation: 'load-job-skills',
      table: 'job_skills',
      resumeId,
      userId,
      message: jobSkillsResult.error.message,
      details: jobSkillsResult.error.details ?? null,
      hint: jobSkillsResult.error.hint ?? null,
    });
  }
  if (companiesResult.error) {
    logError('resume-matching', 'Startup companies query failed', {
      userId,
      resumeId,
      table: 'startup_companies',
      message: companiesResult.error.message,
      code: companiesResult.error.code ?? null,
    });
    throw new ResumeAnalysisExecutionError({
      code: 'COMPANIES_FETCH_FAILED',
      operation: 'load-startup-companies',
      table: 'startup_companies',
      resumeId,
      userId,
      message: companiesResult.error.message,
      details: companiesResult.error.details ?? null,
      hint: companiesResult.error.hint ?? null,
    });
  }

  const structuredProfile = getEffectiveStructuredProfile(
    (resumeProfileResult.data ?? null) as CareerResumeProfile | null,
  );

  if (!structuredProfile) {
    throw new ResumeAnalysisExecutionError({
      code: 'PROFILE_MISSING',
      operation: 'load-effective-structured-profile',
      table: 'resume_profiles',
      resumeId,
      userId,
      message: 'Canonical structured profile is missing for job matching.',
      details: 'effective structured profile resolved to null',
      hint: 'Retry extraction so ATS and job matching can rebuild the canonical profile.',
    });
  }

  const jobSkillMap = new Map<string, Array<{ slug: string; name: string; required: boolean; weight: number }>>();
  for (const row of jobSkillsResult.data ?? []) {
    const current = jobSkillMap.get(row.job_id) ?? [];
    current.push({
      slug: row.skill_slug,
      name: row.skill_name,
      required: row.requirement_level === 'required',
      weight: row.requirement_level === 'required' ? 1.5 : row.requirement_level === 'preferred' ? 1 : 0.5,
    });
    jobSkillMap.set(row.job_id, current);
  }

  const companyLookup = new Map((companiesResult.data ?? []).map((company) => [company.id, company.company_name]));
  const rows = (jobsResult.data ?? []).map((job) => {
    const match = computeJobMatch({
      structuredProfile,
      job,
      jobSkills: jobSkillMap.get(job.id) ?? [],
    });

    const warningSet = new Set(match.warnings);
    if (!companyLookup.has(job.startup_company_id)) {
      warningSet.add('Company details are partially unavailable.');
    }

    return {
      user_id: userId,
      resume_id: resumeId,
      job_id: job.id,
      overall_score: match.overallScore,
      skill_match_score: match.skillScore,
      title_fit_score: match.titleScore,
      experience_score: match.experienceScore,
      location_fit_score: match.locationScore,
      matched_skills: match.matchedSkills,
      missing_skills: match.missingSkills,
      strengths: match.strengths,
      warnings: [...warningSet],
      explanation: match.explanation,
      computed_at: new Date().toISOString(),
    };
  });

  if (rows.length > 0) {
    const upsert = await supabase.from('job_matches').upsert(rows, {
      onConflict: 'user_id,resume_id,job_id',
    });

    if (upsert.error) {
      logError('resume-matching', 'Job match upsert failed', {
        userId,
        resumeId,
        table: 'job_matches',
        message: upsert.error.message,
        code: upsert.error.code ?? null,
      });
      throw new ResumeAnalysisExecutionError({
        code: 'MATCH_UPSERT_FAILED',
        operation: 'upsert-job-matches',
        table: 'job_matches',
        resumeId,
        userId,
        message: upsert.error.message,
        details: upsert.error.details ?? null,
        hint: upsert.error.hint ?? null,
      });
    }
  }

  logInfo('resume-matching', 'Recompute matches completed', {
    userId,
    resumeId,
    matchCount: rows.length,
  });

  return rows.length;
}
