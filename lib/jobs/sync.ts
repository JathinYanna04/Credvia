import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/types';
import { fetchYcJobs } from '@/lib/jobs/yc';

type TypedSupabaseClient = SupabaseClient<Database>;

export async function syncYcJobs(
  supabase: TypedSupabaseClient,
  options: { dryRun?: boolean } = {},
) {
  const sourceResult = await supabase
    .from('job_sources')
    .select('id, source_key')
    .eq('source_key', 'yc')
    .single();

  if (sourceResult.error) {
    throw new Error(sourceResult.error.message);
  }

  const jobs = await fetchYcJobs();

  if (options.dryRun) {
    return {
      source: 'yc',
      companyCount: new Set(jobs.map((entry) => entry.company.slug)).size,
      jobCount: jobs.length,
      upsertedJobs: 0,
    };
  }

  const timestamp = new Date().toISOString();
  const seenJobIds = new Set<string>();
  let upsertedJobs = 0;

  for (const entry of jobs) {
    const companyUpsert = await supabase
      .from('startup_companies')
      .upsert({
        source_key: sourceResult.data.source_key,
        source_company_id: entry.company.externalCompanyId,
        company_name: entry.company.name,
        company_slug: entry.company.slug,
        website_url: entry.company.websiteUrl ?? null,
        careers_url: entry.company.careersUrl ?? null,
        location: entry.company.locationText ?? null,
        remote_policy: entry.company.remotePolicy ?? null,
        is_hiring: true,
        metadata: {
          ...entry.company.metadata,
          logoUrl: entry.company.logoUrl ?? null,
        } as Json,
      }, { onConflict: 'source_key,source_company_id' })
      .select('id')
      .single();

    if (companyUpsert.error || !companyUpsert.data) {
      throw new Error(companyUpsert.error?.message ?? 'Could not upsert startup company.');
    }

    const jobUpsert = await supabase
      .from('startup_jobs')
      .upsert({
        startup_company_id: companyUpsert.data.id,
        source_key: sourceResult.data.source_key,
        source_job_id: entry.job.externalJobId,
        title: entry.job.title,
        role_family: entry.job.metadata.prettyRole ? String(entry.job.metadata.prettyRole) : null,
        seniority: entry.job.experienceMinYears && entry.job.experienceMinYears >= 5 ? 'senior' : entry.job.experienceMinYears && entry.job.experienceMinYears >= 3 ? 'mid' : null,
        location: entry.job.locationText ?? null,
        remote_policy: entry.job.remotePolicy ?? null,
        description_raw: entry.job.descriptionText,
        description_clean: entry.job.descriptionText,
        apply_url: entry.job.applyUrl,
        salary_min: null,
        salary_max: null,
        currency: null,
        is_active: true,
        posted_at: entry.job.postedAt ?? null,
        ingested_at: timestamp,
        metadata: {
          ...entry.job.metadata,
          slug: entry.job.slug,
          employmentType: entry.job.employmentType ?? null,
          experienceMinYears: entry.job.experienceMinYears ?? null,
          experienceMaxYears: entry.job.experienceMaxYears ?? null,
        } as Json,
      }, { onConflict: 'source_key,source_job_id' })
      .select('id')
      .single();

    if (jobUpsert.error || !jobUpsert.data) {
      throw new Error(jobUpsert.error?.message ?? 'Could not upsert startup job.');
    }

    seenJobIds.add(jobUpsert.data.id);
    upsertedJobs += 1;

    const deleteSkills = await supabase.from('job_skills').delete().eq('job_id', jobUpsert.data.id);
    if (deleteSkills.error) {
      throw new Error(deleteSkills.error.message);
    }

    if (entry.job.extractedSkills.length > 0) {
      const jobSkillsInsert = await supabase.from('job_skills').insert(
        entry.job.extractedSkills.map((skill) => ({
          job_id: jobUpsert.data.id,
          skill_slug: skill.slug,
          skill_name: skill.evidence,
          requirement_level: skill.required ? 'required' : 'preferred',
          confidence: skill.weight,
        })),
      );

      if (jobSkillsInsert.error) {
        throw new Error(jobSkillsInsert.error.message);
      }
    }
  }

  const staleJobs = await supabase
    .from('startup_jobs')
    .update({ is_active: false })
    .eq('source_key', sourceResult.data.source_key)
    .not('id', 'in', `(${[...seenJobIds].map((id) => `"${id}"`).join(',') || '""'})`);

  if (staleJobs.error) {
    throw new Error(staleJobs.error.message);
  }

  const sourceUpdate = await supabase
    .from('job_sources')
    .update({
      last_synced_at: timestamp,
      metadata: {
        lastCompanyCount: new Set(jobs.map((entry) => entry.company.slug)).size,
        lastJobCount: jobs.length,
      } as Json,
    })
    .eq('id', sourceResult.data.id);

  if (sourceUpdate.error) {
    throw new Error(sourceUpdate.error.message);
  }

  return {
    source: 'yc',
    companyCount: new Set(jobs.map((entry) => entry.company.slug)).size,
    jobCount: jobs.length,
    upsertedJobs,
  };
}
