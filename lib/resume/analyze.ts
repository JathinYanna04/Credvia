import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { getSkillEntryBySlug } from '@/lib/resume/skill-taxonomy';
import { extractResumeText } from '@/lib/resume/extract';
import { parseResumeText } from '@/lib/resume/parse';

type TypedSupabaseClient = SupabaseClient<Database>;

export async function analyzeStoredResume(
  supabase: TypedSupabaseClient,
  resume: Database['public']['Tables']['resumes']['Row'],
  fileBuffer: Buffer,
) {
  const insertAnalysisRun = await supabase
    .from('resume_analysis_runs')
    .insert({
      resume_id: resume.id,
      user_id: resume.user_id,
      status: 'running',
      started_at: new Date().toISOString(),
      parser_version: 'deterministic-v1',
    })
    .select('id')
    .single();

  if (insertAnalysisRun.error || !insertAnalysisRun.data) {
    throw new Error(insertAnalysisRun.error?.message ?? 'Could not create resume analysis run.');
  }

  try {
    const rawText = (await extractResumeText(fileBuffer, resume.mime_type, resume.file_name)).trim();

    if (!rawText) {
      throw new Error('Could not extract text from this resume.');
    }

    const parsed = parseResumeText(rawText);
    const matchedSkillRows = [
      ...parsed.directSkillSlugs.map((slug) => ({ slug, source: 'direct' as const, confidence: 1 })),
      ...parsed.inferredSkillSlugs.map((slug) => ({ slug, source: 'inferred' as const, confidence: 0.7 })),
    ]
      .map((entry) => {
        const skill = getSkillEntryBySlug(entry.slug);
        return skill ? { skill, source: entry.source, confidence: entry.confidence } : null;
      })
      .filter(Boolean) as Array<{ skill: { slug: string; name: string }; source: 'direct' | 'inferred'; confidence: number }>;

    const [profileUpsert, deleteSkills] = await Promise.all([
      supabase.from('resume_profiles').upsert({
        resume_id: resume.id,
        user_id: resume.user_id,
        summary: parsed.summary,
        location: parsed.locationText,
        years_experience: parsed.experienceYears,
        projects: parsed.projects,
        experience: parsed.experience,
        education: parsed.education,
        raw_sections: parsed.parsedSections,
        parsed_text: rawText,
        parsed_at: new Date().toISOString(),
      }),
      supabase.from('resume_skills').delete().eq('resume_id', resume.id),
    ]);

    if (profileUpsert.error) {
      throw new Error(profileUpsert.error.message);
    }

    if (deleteSkills.error) {
      throw new Error(deleteSkills.error.message);
    }

    if (matchedSkillRows.length > 0) {
      const skillInsert = await supabase.from('resume_skills').insert(
        matchedSkillRows.map((entry) => ({
          resume_id: resume.id,
          user_id: resume.user_id,
          skill_slug: entry.skill.slug,
          skill_name: entry.skill.name,
          source_type: entry.source === 'direct' ? 'explicit' : 'experience_inferred',
          evidence: entry.skill.name,
          confidence: entry.confidence,
        })),
      );

      if (skillInsert.error) {
        throw new Error(skillInsert.error.message);
      }
    }

    const completeRun = await supabase
      .from('resume_analysis_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', insertAnalysisRun.data.id);

    if (completeRun.error) {
      throw new Error(completeRun.error.message);
    }

    const resumeUpdate = await supabase
      .from('resumes')
      .update({
        parse_status: 'parsed',
      })
      .eq('id', resume.id);

    if (resumeUpdate.error) {
      throw new Error(resumeUpdate.error.message);
    }

    return {
      parsed,
      matchedSkillRows,
    };
  } catch (error) {
    await supabase
      .from('resume_analysis_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Resume analysis failed.',
      })
      .eq('id', insertAnalysisRun.data.id);
    throw error;
  }
}
