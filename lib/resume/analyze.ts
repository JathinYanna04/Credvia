import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import type { Json } from '@/lib/supabase/types';
import type { AnalyzeResumeRequest } from '@/lib/types';
import { getSkillEntryBySlug } from '@/lib/resume/skill-taxonomy';
import { extractResumeText, ResumeExtractionError } from '@/lib/resume/extract';
import { parseResumeText } from '@/lib/resume/parse';
import { logError, logInfo } from '@/lib/utils/logger';

type TypedSupabaseClient = SupabaseClient<Database>;

export async function analyzeStoredResume(
  supabase: TypedSupabaseClient,
  resume: Database['public']['Tables']['resumes']['Row'],
  fileBuffer: Buffer,
  requestBody: AnalyzeResumeRequest = {},
) {
  const insertAnalysisRun = await supabase
    .from('resume_analysis_runs')
    .insert({
      resume_id: resume.id,
      user_id: resume.user_id,
      status: 'running',
      started_at: new Date().toISOString(),
      parser_version: 'deterministic-v2',
    })
    .select('id')
    .single();

  if (insertAnalysisRun.error || !insertAnalysisRun.data) {
    throw new Error(insertAnalysisRun.error?.message ?? 'Could not create resume analysis run.');
  }

  try {
    const extraction = await extractResumeText(
      fileBuffer,
      resume.mime_type,
      resume.file_name,
      { forceOcr: requestBody.forceOCR ?? requestBody.forceOcr },
    );
    const rawText = extraction.text.trim();
    logInfo('resume-analyze', 'Extraction completed', {
      resumeId: resume.id,
      method: extraction.method,
      attemptedMethods: extraction.attemptedMethods,
      textLength: rawText.length,
      usedOcr: extraction.usedOcr,
      ocrConfidence: extraction.ocrConfidence,
      confidenceScore: extraction.quality.confidenceScore,
      confidenceTier: extraction.quality.confidenceTier,
      likelyScannedPdf: extraction.quality.likelyScannedPdf,
    });
    const parsed = parseResumeText(rawText, {
      extractionMethod: extraction.method,
      attemptedMethods: extraction.attemptedMethods,
      extractionQuality: extraction.quality as unknown as Record<string, unknown>,
      usedOcr: extraction.usedOcr,
      ocrAttempted: extraction.ocrAttempted,
      ocrImprovedQuality: extraction.ocrImprovedQuality,
      ocrConfidence: extraction.ocrConfidence,
      textLength: extraction.textLength,
      readiness: extraction.readiness,
    });
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
        full_name: parsed.fullName,
        email: parsed.email,
        phone: parsed.phone,
        current_title: parsed.currentTitle,
        summary: parsed.summary,
        location: parsed.locationText,
        years_experience: parsed.experienceYears,
        projects: parsed.projects,
        experience: parsed.experience,
        education: parsed.education,
        raw_sections: parsed.parsedSections as unknown as Json,
        parsed_text: rawText,
        parsed_at: new Date().toISOString(),
      }, { onConflict: 'resume_id' }),
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
        parser_version: `deterministic-v2:${extraction.method}${extraction.usedOcr ? ':ocr' : ''}`,
        error_message: null,
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
      extraction,
    };
  } catch (error) {
    if (error instanceof ResumeExtractionError) {
      logError('resume-analyze', 'Extraction failed', {
        resumeId: resume.id,
        method: error.method,
        attemptedMethods: error.attemptedMethods,
        failureCode: error.failureCode,
        reason: error.message,
        quality: error.quality,
        diagnostics: error.diagnostics,
      });
    }
    await supabase
      .from('resume_analysis_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message:
          error instanceof ResumeExtractionError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Resume analysis failed.',
      })
      .eq('id', insertAnalysisRun.data.id);
    throw error;
  }
}
