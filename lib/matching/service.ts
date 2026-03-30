import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { computeJobMatch } from '@/lib/matching/score';

type TypedSupabaseClient = SupabaseClient<Database>;

export async function recomputeMatchesForResume(
  supabase: TypedSupabaseClient,
  userId: string,
  resumeId: string,
) {
  const [resumeProfileResult, resumeSkillsResult, jobsResult, jobSkillsResult, companiesResult] = await Promise.all([
    supabase.from('resume_profiles').select('*').eq('resume_id', resumeId).maybeSingle(),
    supabase.from('resume_skills').select('skill_slug').eq('resume_id', resumeId),
    supabase.from('startup_jobs').select('*').eq('is_active', true).order('posted_at', { ascending: false }).limit(200),
    supabase.from('job_skills').select('job_id, skill_slug, skill_name, requirement_level, confidence'),
    supabase.from('startup_companies').select('id, company_name').eq('is_hiring', true),
  ]);

  if (resumeProfileResult.error) throw new Error(resumeProfileResult.error.message);
  if (resumeSkillsResult.error) throw new Error(resumeSkillsResult.error.message);
  if (jobsResult.error) throw new Error(jobsResult.error.message);
  if (jobSkillsResult.error) throw new Error(jobSkillsResult.error.message);
  if (companiesResult.error) throw new Error(companiesResult.error.message);

  const resumeSkillSlugs = (resumeSkillsResult.data ?? [])
    .map((row) => row.skill_slug ?? null)
    .filter(Boolean) as string[];

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
      resumeTitleText: `${resumeProfileResult.data?.current_title ?? ''} ${resumeProfileResult.data?.summary ?? ''} ${resumeProfileResult.data?.experience ? JSON.stringify(resumeProfileResult.data.experience) : ''}`,
      resumeProfile: resumeProfileResult.data,
      resumeSkillSlugs,
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
      throw new Error(upsert.error.message);
    }
  }

  return rows.length;
}
