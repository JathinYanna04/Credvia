import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

type TypedSupabaseClient = SupabaseClient<Database>;

export async function getOwnedResume(
  supabase: TypedSupabaseClient,
  userId: string,
  resumeId: string,
) {
  const result = await supabase.from('resumes').select('*').eq('id', resumeId).eq('user_id', userId).maybeSingle();
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data;
}

export async function getResumeById(
  supabase: TypedSupabaseClient,
  resumeId: string,
) {
  const result = await supabase.from('resumes').select('*').eq('id', resumeId).maybeSingle();
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data;
}

export async function getActiveResume(
  supabase: TypedSupabaseClient,
  userId: string,
) {
  const result = await supabase
    .from('resumes')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}

export async function getJobCardsByIds(
  supabase: TypedSupabaseClient,
  jobIds: string[],
) {
  if (jobIds.length === 0) {
    return [];
  }

  const [jobsResult, jobSkillsResult, companiesResult] = await Promise.all([
    supabase.from('startup_jobs').select('*').in('id', jobIds),
    supabase.from('job_skills').select('job_id, skill_slug, skill_name, requirement_level, confidence').in('job_id', jobIds),
    supabase.from('startup_companies').select('*'),
  ]);

  if (jobsResult.error) throw new Error(jobsResult.error.message);
  if (jobSkillsResult.error) throw new Error(jobSkillsResult.error.message);
  if (companiesResult.error) throw new Error(companiesResult.error.message);

  const companyLookup = new Map((companiesResult.data ?? []).map((company) => [company.id, company]));
  const skillLookup = new Map<string, Array<{ name: string; slug: string; required: boolean; weight: number }>>();

  for (const row of jobSkillsResult.data ?? []) {
    const current = skillLookup.get(row.job_id) ?? [];
    current.push({
      name: row.skill_name,
      slug: row.skill_slug,
      required: row.requirement_level === 'required',
      weight: row.requirement_level === 'required' ? 1.5 : row.requirement_level === 'preferred' ? 1 : 0.5,
    });
    skillLookup.set(row.job_id, current);
  }

  return (jobsResult.data ?? []).map((job) => ({
    ...job,
    company: companyLookup.get(job.startup_company_id) ?? null,
    skills: skillLookup.get(job.id) ?? [],
  }));
}
