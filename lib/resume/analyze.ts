import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/types';
import type { AnalyzeResumeRequest } from '@/lib/types';
import { recomputeMatchesForResume } from '@/lib/matching/service';
import { extractResumeText, ResumeExtractionError } from '@/lib/resume/extract';
import { RESUME_LIFECYCLE_STATUSES } from '@/lib/resume/lifecycle';
import {
  ResumePersistenceError,
  toResumePersistenceError,
} from '@/lib/resume/persistence-error';
import { parseResumeText } from '@/lib/resume/parse';
import { getSkillEntryBySlug } from '@/lib/resume/skill-taxonomy';
import { logError, logInfo } from '@/lib/utils/logger';

type TypedSupabaseClient = SupabaseClient<Database>;

type ResumeRow = Database['public']['Tables']['resumes']['Row'];

interface ResumePreparationResult {
  extraction: Awaited<ReturnType<typeof extractResumeText>>;
  parsed: ReturnType<typeof parseResumeText>;
  matchedSkillRows: Array<{
    skill: { slug: string; name: string };
    source: 'direct' | 'inferred';
    confidence: number;
  }>;
}

function toErrorMessage(error: unknown) {
  if (error instanceof ResumeExtractionError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Resume processing failed.';
}

function resolvePreparationFailureStatus(error: unknown) {
  if (error instanceof ResumeExtractionError) {
    if (error.failureCode === 'LOW_TEXT_CONFIDENCE') {
      return RESUME_LIFECYCLE_STATUSES.EXTRACTED_WITH_WARNINGS;
    }

    return RESUME_LIFECYCLE_STATUSES.EXTRACTION_FAILED;
  }

  return RESUME_LIFECYCLE_STATUSES.PARSING_FAILED;
}

async function updateResumeLifecycleStatus(
  supabase: TypedSupabaseClient,
  resumeId: string,
  parseStatus: string,
) {
  const update = await supabase.from('resumes').update({ parse_status: parseStatus }).eq('id', resumeId);

  if (update.error) {
    throw toResumePersistenceError(
      'Failed to persist resume lifecycle status.',
      {
        operation: 'update-parse-status',
        table: 'resumes',
        resumeId,
        targetStatus: parseStatus,
      },
      update.error,
    );
  }
}

async function createAnalysisRun(
  supabase: TypedSupabaseClient,
  resume: ResumeRow,
  status: string,
  parserVersion: string,
) {
  const insert = await supabase
    .from('resume_analysis_runs')
    .insert({
      resume_id: resume.id,
      user_id: resume.user_id,
      status,
      started_at: new Date().toISOString(),
      parser_version: parserVersion,
    })
    .select('id')
    .single();

  if (insert.error || !insert.data) {
    throw toResumePersistenceError(
      insert.error?.message ?? 'Could not create resume analysis run.',
      {
        operation: 'insert-analysis-run',
        table: 'resume_analysis_runs',
        resumeId: resume.id,
        targetStatus: status,
      },
      {
        message: insert.error?.message ?? 'Could not create resume analysis run.',
        code: insert.error?.code,
        details: insert.error?.details,
        hint: insert.error?.hint,
      },
    );
  }

  return insert.data.id;
}

async function completeRun(
  supabase: TypedSupabaseClient,
  runId: string,
  patch: {
    status: string;
    parserVersion?: string | null;
    errorMessage?: string | null;
  },
) {
  const update = await supabase
    .from('resume_analysis_runs')
    .update({
      status: patch.status,
      completed_at: new Date().toISOString(),
      parser_version: patch.parserVersion ?? null,
      error_message: patch.errorMessage ?? null,
    })
    .eq('id', runId);

  if (update.error) {
    throw toResumePersistenceError(
      'Failed to finalize resume analysis run.',
      {
        operation: 'update-analysis-run',
        table: 'resume_analysis_runs',
        runId,
        targetStatus: patch.status,
      },
      update.error,
    );
  }
}

async function persistParsedResume(
  supabase: TypedSupabaseClient,
  resume: ResumeRow,
  rawText: string,
  parsed: ReturnType<typeof parseResumeText>,
) {
  const matchedSkillRows = [
    ...parsed.directSkillSlugs.map((slug) => ({
      slug,
      source: 'direct' as const,
      confidence: 1,
    })),
    ...parsed.inferredSkillSlugs.map((slug) => ({
      slug,
      source: 'inferred' as const,
      confidence: 0.7,
    })),
  ]
    .map((entry) => {
      const skill = getSkillEntryBySlug(entry.slug);
      return skill ? { skill, source: entry.source, confidence: entry.confidence } : null;
    })
    .filter(Boolean) as ResumePreparationResult['matchedSkillRows'];

  const [profileUpsert, deleteSkills] = await Promise.all([
    supabase.from('resume_profiles').upsert(
      {
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
      },
      { onConflict: 'resume_id' },
    ),
    supabase.from('resume_skills').delete().eq('resume_id', resume.id),
  ]);

  if (profileUpsert.error) {
    throw toResumePersistenceError(
      'Failed to upsert parsed resume profile.',
      {
        operation: 'upsert-resume-profile',
        table: 'resume_profiles',
        resumeId: resume.id,
      },
      profileUpsert.error,
    );
  }

  if (deleteSkills.error) {
    throw toResumePersistenceError(
      'Failed to clear existing resume skills.',
      {
        operation: 'delete-resume-skills',
        table: 'resume_skills',
        resumeId: resume.id,
      },
      deleteSkills.error,
    );
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
      throw toResumePersistenceError(
        'Failed to store normalized resume skills.',
        {
          operation: 'insert-resume-skills',
          table: 'resume_skills',
          resumeId: resume.id,
        },
        skillInsert.error,
      );
    }
  }

  return matchedSkillRows;
}

export async function prepareResumeForAnalysis(
  supabase: TypedSupabaseClient,
  resume: ResumeRow,
  fileBuffer: Buffer,
  requestBody: AnalyzeResumeRequest = {},
): Promise<ResumePreparationResult> {
  const runId = await createAnalysisRun(
    supabase,
    resume,
    'extracting',
    'deterministic-v3:prepare',
  );

  try {
    await updateResumeLifecycleStatus(
      supabase,
      resume.id,
      RESUME_LIFECYCLE_STATUSES.EXTRACTING,
    );

    const extraction = await extractResumeText(fileBuffer, resume.mime_type, resume.file_name, {
      forceOcr: requestBody.forceOCR ?? requestBody.forceOcr,
    });
    const rawText = extraction.text.trim();

    logInfo('resume-preparation', 'Extraction completed', {
      resumeId: resume.id,
      method: extraction.method,
      attemptedMethods: extraction.attemptedMethods,
      textLength: rawText.length,
      wordCount: extraction.quality.wordCount,
      confidenceScore: extraction.quality.confidenceScore,
      confidenceTier: extraction.quality.confidenceTier,
      detectedSectionCount: extraction.quality.detectedSectionCount,
      junkRatio: extraction.quality.junkRatio,
      usedOcr: extraction.usedOcr,
      ocrConfidence: extraction.ocrConfidence,
    });

    await updateResumeLifecycleStatus(
      supabase,
      resume.id,
      extraction.acceptedWithWarnings || extraction.quality.confidenceTier === 'low'
        ? RESUME_LIFECYCLE_STATUSES.EXTRACTED_WITH_WARNINGS
        : RESUME_LIFECYCLE_STATUSES.EXTRACTED,
    );

    let parsed: ReturnType<typeof parseResumeText>;
    try {
      parsed = parseResumeText(rawText, {
        extractionMethod: extraction.method,
        attemptedMethods: extraction.attemptedMethods,
        extractionQuality: extraction.quality as unknown as Record<string, unknown>,
        usedOcr: extraction.usedOcr,
        ocrAttempted: extraction.ocrAttempted,
        ocrImprovedQuality: extraction.ocrImprovedQuality,
        ocrConfidence: extraction.ocrConfidence,
        ocrAvailable: extraction.ocrAvailable,
        ocrUnavailableReason: extraction.ocrUnavailableReason,
        acceptedWithWarnings: extraction.acceptedWithWarnings,
        warningCode: extraction.warningCode,
        warningMessage: extraction.warningMessage,
        textLength: extraction.textLength,
        readiness: extraction.readiness,
      });
    } catch (parseError) {
      await updateResumeLifecycleStatus(
        supabase,
        resume.id,
        RESUME_LIFECYCLE_STATUSES.PARSING_FAILED,
      );
      throw parseError;
    }

    await updateResumeLifecycleStatus(supabase, resume.id, RESUME_LIFECYCLE_STATUSES.PARSED);
    const matchedSkillRows = await persistParsedResume(supabase, resume, rawText, parsed);
    await updateResumeLifecycleStatus(supabase, resume.id, RESUME_LIFECYCLE_STATUSES.READY);

    await completeRun(supabase, runId, {
      status: 'completed',
      parserVersion: `deterministic-v3:${extraction.method}${extraction.usedOcr ? ':ocr' : ''}`,
      errorMessage: null,
    });

    return {
      extraction,
      parsed,
      matchedSkillRows,
    };
  } catch (error) {
    const lifecycleStatus = resolvePreparationFailureStatus(error);

    if (error instanceof ResumeExtractionError) {
      logError('resume-preparation', 'Extraction failed', {
        resumeId: resume.id,
        method: error.method,
        attemptedMethods: error.attemptedMethods,
        failureCode: error.failureCode,
        reason: error.message,
        quality: error.quality,
        diagnostics: error.diagnostics,
      });
    } else {
      logError('resume-preparation', 'Preparation failed', {
        resumeId: resume.id,
        message: toErrorMessage(error),
      });
    }

    let finalizePersistenceError: ResumePersistenceError | null = null;

    try {
      await updateResumeLifecycleStatus(supabase, resume.id, lifecycleStatus);
    } catch (finalizeError) {
      if (finalizeError instanceof ResumePersistenceError) {
        finalizePersistenceError = finalizeError;
      } else {
        throw finalizeError;
      }
    }

    try {
      await completeRun(supabase, runId, {
        status: 'failed',
        parserVersion: 'deterministic-v3:prepare',
        errorMessage: toErrorMessage(error),
      });
    } catch (finalizeError) {
      if (finalizeError instanceof ResumePersistenceError) {
        finalizePersistenceError ??= finalizeError;
      } else {
        throw finalizeError;
      }
    }

    if (error instanceof ResumePersistenceError) {
      throw error;
    }

    if (finalizePersistenceError) {
      logError('resume-preparation', 'Finalize persistence failed', {
        resumeId: resume.id,
        operation: finalizePersistenceError.context.operation,
        dbCode: finalizePersistenceError.sourceError.code ?? null,
      });
    }

    throw error;
  }
}

export async function runResumeAnalysis(
  supabase: TypedSupabaseClient,
  resume: ResumeRow,
) {
  const runId = await createAnalysisRun(supabase, resume, 'analyzing', 'analysis-v1');

  try {
    await updateResumeLifecycleStatus(
      supabase,
      resume.id,
      RESUME_LIFECYCLE_STATUSES.ANALYZING,
    );

    const profileResult = await supabase
      .from('resume_profiles')
      .select('resume_id')
      .eq('resume_id', resume.id)
      .maybeSingle();

    if (profileResult.error) {
      throw new Error(profileResult.error.message);
    }

    if (!profileResult.data) {
      throw new Error('Resume is not prepared for analysis yet.');
    }

    const matchCount = await recomputeMatchesForResume(supabase, resume.user_id, resume.id);

    await updateResumeLifecycleStatus(supabase, resume.id, RESUME_LIFECYCLE_STATUSES.ANALYZED);
    await completeRun(supabase, runId, {
      status: 'completed',
      parserVersion: 'analysis-v1',
      errorMessage: null,
    });

    return { matchCount };
  } catch (error) {
    let finalizePersistenceError: ResumePersistenceError | null = null;

    try {
      await updateResumeLifecycleStatus(
        supabase,
        resume.id,
        RESUME_LIFECYCLE_STATUSES.ANALYSIS_FAILED,
      );
    } catch (finalizeError) {
      if (finalizeError instanceof ResumePersistenceError) {
        finalizePersistenceError = finalizeError;
      } else {
        throw finalizeError;
      }
    }

    try {
      await completeRun(supabase, runId, {
        status: 'failed',
        parserVersion: 'analysis-v1',
        errorMessage: toErrorMessage(error),
      });
    } catch (finalizeError) {
      if (finalizeError instanceof ResumePersistenceError) {
        finalizePersistenceError ??= finalizeError;
      } else {
        throw finalizeError;
      }
    }

    if (error instanceof ResumePersistenceError) {
      throw error;
    }

    if (finalizePersistenceError) {
      logError('resume-analysis', 'Finalize persistence failed', {
        resumeId: resume.id,
        operation: finalizePersistenceError.context.operation,
        dbCode: finalizePersistenceError.sourceError.code ?? null,
      });
    }

    throw error;
  }
}

// Backward compatibility for any existing callers that still use the old name.
export async function analyzeStoredResume(
  supabase: TypedSupabaseClient,
  resume: ResumeRow,
  fileBuffer: Buffer,
  requestBody: AnalyzeResumeRequest = {},
) {
  return prepareResumeForAnalysis(supabase, resume, fileBuffer, requestBody);
}
