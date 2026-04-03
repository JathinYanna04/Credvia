import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/types';
import type { AnalyzeResumeRequest } from '@/lib/types';
import { recomputeMatchesForResume } from '@/lib/matching/service';
import {
  assessResumeTextQuality,
  extractResumeText,
  ResumeExtractionError,
  type ResumeExtractionMethod,
} from '@/lib/resume/extract';
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

function normalizeExternalString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') {
    return null;
  }
  return trimmed;
}

function formatExperienceLines(experience: ExternalExtractionPayload['sections'] extends { experience?: infer T }
  ? T
  : Array<Record<string, unknown>> = []) {
  return (experience ?? []).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const title = normalizeExternalString((entry as Record<string, unknown>).title);
    const company = normalizeExternalString((entry as Record<string, unknown>).company);
    const start = normalizeExternalString((entry as Record<string, unknown>).start_date);
    const end = normalizeExternalString((entry as Record<string, unknown>).end_date);
    const bullets = Array.isArray((entry as Record<string, unknown>).bullets)
      ? ((entry as Record<string, unknown>).bullets as string[]).filter(Boolean)
      : [];
    const header = [title, company].filter(Boolean).join(' — ');
    const dates = [start, end].filter(Boolean).join(' - ');
    const lines = [header, dates].filter(Boolean);
    return [...lines, ...bullets];
  });
}

function formatProjectLines(projects: ExternalExtractionPayload['sections'] extends { projects?: infer T }
  ? T
  : Array<Record<string, unknown>> = []) {
  return (projects ?? []).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const name = normalizeExternalString((entry as Record<string, unknown>).name);
    const description = normalizeExternalString((entry as Record<string, unknown>).description);
    const bullets = Array.isArray((entry as Record<string, unknown>).bullets)
      ? ((entry as Record<string, unknown>).bullets as string[]).filter(Boolean)
      : [];
    const lines = [name, description].filter(Boolean);
    return [...lines, ...bullets];
  });
}

function formatEducationLines(education: ExternalExtractionPayload['sections'] extends { education?: infer T }
  ? T
  : Array<Record<string, unknown>> = []) {
  return (education ?? []).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const degree = normalizeExternalString((entry as Record<string, unknown>).degree);
    const institution = normalizeExternalString((entry as Record<string, unknown>).institution);
    const start = normalizeExternalString((entry as Record<string, unknown>).start_date);
    const end = normalizeExternalString((entry as Record<string, unknown>).end_date);
    const description = normalizeExternalString((entry as Record<string, unknown>).description);
    const header = [degree, institution].filter(Boolean).join(' — ');
    const dates = [start, end].filter(Boolean).join(' - ');
    const lines = [header, dates, description].filter(Boolean);
    return lines;
  });
}

interface ResumePreparationResult {
  extraction: Awaited<ReturnType<typeof extractResumeText>>;
  parsed: ReturnType<typeof parseResumeText>;
  matchedSkillRows: Array<{
    skill: { slug: string; name: string };
    source: 'direct' | 'inferred';
    confidence: number;
  }>;
}

export interface ExternalExtractionPayload {
  schema_version?: string;
  parser_version?: string;
  request?: {
    request_id?: string;
    filename?: string;
    mime_type?: string;
    file_size_bytes?: number;
    parsed_at?: string;
  };
  status?: {
    success?: boolean;
    processing_mode?: string;
    warnings?: string[];
    errors?: string[];
    confidence_overall?: number;
  };
  raw?: {
    raw_text?: string | null;
    cleaned_text?: string | null;
    page_count?: number;
  };
  candidate?: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedin?: string | null;
    github?: string | null;
    portfolio?: string | null;
    location?: string | null;
    summary?: string | null;
  };
  sections?: {
    skills?: {
      languages?: string[];
      frameworks?: string[];
      tools?: string[];
      databases?: string[];
      cloud?: string[];
      others?: string[];
    };
    education?: Array<Record<string, unknown>>;
    experience?: Array<Record<string, unknown>>;
    projects?: Array<Record<string, unknown>>;
  };
  diagnostics?: {
    method_used?: string;
    page_methods?: Array<Record<string, unknown>>;
    contamination_score?: number;
    salvage_score?: number;
    cleaning_actions?: string[];
    final_source?: 'llm' | 'heuristic_fallback' | 'merged';
    llm_status?: 'success' | 'invalid_json' | 'timeout' | 'error' | 'skipped';
    llm_error?: string | null;
    llm_raw_present?: boolean;
  };
  normalized_resume?: {
    text?: string | null;
    sections?: Record<string, string[]>;
  };
  // Backward compatibility for legacy fields
  raw_text?: string | null;
  cleaned_text?: string | null;
  reconstructed_text?: string | null;
  structured_profile?: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    summary?: string | null;
    skills?: string[] | null;
    projects?: string[] | null;
    experience?: string[] | null;
    education?: string[] | null;
  };
  page_methods?: Array<Record<string, unknown>>;
  contamination_score?: number;
  salvage_score?: number;
  accepted_with_warnings?: boolean;
  warnings?: string[];
  method_used?: string;
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
    const rawText = extraction.rawText ?? '';
    const cleanedText = extraction.text.trim();

    if (
      extraction.contaminationScore >= 90 &&
      extraction.salvageScore < 20 &&
      cleanedText.length < 200 &&
      extraction.quality.humanReadableRatio < 0.18
    ) {
      throw new ResumeExtractionError(
        'Cleaned text is still dominated by PDF internals and cannot be parsed reliably.',
        extraction.quality,
        extraction.method,
        extraction.attemptedMethods,
        'LOW_TEXT_CONFIDENCE',
        {
          reason: extraction.quality.reason,
          attemptedMethods: extraction.attemptedMethods,
          method: extraction.method,
          usedOcr: extraction.usedOcr,
          ocrAttempted: extraction.ocrAttempted,
          ocrImprovedQuality: extraction.ocrImprovedQuality,
          ocrConfidence: extraction.ocrConfidence,
          textLength: extraction.textLength,
          cleanedTextLength: extraction.cleanedTextLength,
          wordCount: extraction.quality.wordCount,
          readiness: extraction.readiness,
          confidenceScore: extraction.quality.confidenceScore,
          confidenceTier: extraction.quality.confidenceTier,
          detectedSectionCount: extraction.quality.detectedSectionCount,
          junkRatio: extraction.quality.junkRatio,
          likelyScannedPdf: extraction.quality.likelyScannedPdf,
          contaminationScore: extraction.contaminationScore,
          salvageScore: extraction.salvageScore,
          cleaningActions: extraction.cleaningActions,
        },
      );
    }

    logInfo('resume-preparation', 'Extraction completed', {
      resumeId: resume.id,
      method: extraction.method,
      attemptedMethods: extraction.attemptedMethods,
      textLength: cleanedText.length,
      cleanedTextLength: extraction.cleanedTextLength,
      contaminationScore: extraction.contaminationScore,
      salvageScore: extraction.salvageScore,
      cleaningActions: extraction.cleaningActions,
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
      parsed = parseResumeText(cleanedText, {
        extractionMethod: extraction.method,
        attemptedMethods: extraction.attemptedMethods,
        extractionQuality: {
          ...extraction.quality,
          contaminationScore: extraction.contaminationScore,
          salvageScore: extraction.salvageScore,
        } as unknown as Record<string, unknown>,
        contaminationScore: extraction.contaminationScore,
        salvageScore: extraction.salvageScore,
        cleaningActions: extraction.cleaningActions,
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
        cleanedTextLength: extraction.cleanedTextLength,
        readiness: extraction.readiness,
        rawText,
        cleanedText,
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
    const matchedSkillRows = await persistParsedResume(
      supabase,
      resume,
      cleanedText,
      parsed,
    );
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

export async function prepareResumeFromExternalExtraction(
  supabase: TypedSupabaseClient,
  resume: ResumeRow,
  external: ExternalExtractionPayload,
): Promise<ResumePreparationResult> {
  const runId = await createAnalysisRun(
    supabase,
    resume,
    'extracting',
    'fastapi-v1:prepare',
  );

  try {
    await updateResumeLifecycleStatus(
      supabase,
      resume.id,
      RESUME_LIFECYCLE_STATUSES.EXTRACTING,
    );

    const rawText = external.raw?.raw_text ?? external.raw_text ?? '';
    const cleanedText = external.raw?.cleaned_text ?? external.cleaned_text ?? '';
    const reconstructedText =
      external.normalized_resume?.text ?? external.reconstructed_text ?? cleanedText;
    const warnings = external.status?.warnings ?? external.warnings ?? [];
    const acceptedWithWarnings =
      external.accepted_with_warnings ?? (warnings.length > 0 ? true : false);
    const contaminationScore =
      external.diagnostics?.contamination_score ?? external.contamination_score ?? 0;
    const salvageScore =
      external.diagnostics?.salvage_score ?? external.salvage_score ?? 0;
    const methodUsed =
      external.diagnostics?.method_used ?? external.method_used ?? 'fastapi';
    const llmStatus = external.diagnostics?.llm_status ?? null;
    const llmFinalSource = external.diagnostics?.final_source ?? null;
    const llmError = external.diagnostics?.llm_error ?? null;
    const llmRawPresent = external.diagnostics?.llm_raw_present ?? null;
    const quality = assessResumeTextQuality(cleanedText);
    const parsed = parseResumeText(reconstructedText, {
      extractionMethod: methodUsed,
      attemptedMethods: [],
      extractionQuality: {
        contaminationScore,
        salvageScore,
        confidenceScore: quality.confidenceScore,
        confidenceTier: quality.confidenceTier,
        humanReadableRatio: quality.humanReadableRatio,
        resumeHintCount: quality.resumeHintCount,
      },
      acceptedWithWarnings,
      warningCode: acceptedWithWarnings ? 'SALVAGED_FROM_NOISE' : null,
      warningMessage: warnings[0] ?? null,
      rawText,
      cleanedText,
      finalSource: llmFinalSource ?? undefined,
      llmStatus: llmStatus ?? undefined,
      llmError,
      llmRawPresent,
    });

    if (external.sections) {
      const externalExperience = formatExperienceLines(external.sections.experience);
      const externalProjects = formatProjectLines(external.sections.projects);
      const externalEducation = formatEducationLines(external.sections.education);

      if (externalExperience.length > 0) {
        parsed.experience = externalExperience;
      }
      if (externalProjects.length > 0) {
        parsed.projects = externalProjects;
      }
      if (externalEducation.length > 0) {
        parsed.education = externalEducation;
      }
    }

    if (external.candidate) {
      parsed.fullName = normalizeExternalString(external.candidate.full_name) ?? parsed.fullName;
      parsed.email = normalizeExternalString(external.candidate.email) ?? parsed.email;
      parsed.phone = normalizeExternalString(external.candidate.phone) ?? parsed.phone;
      parsed.summary = normalizeExternalString(external.candidate.summary) ?? parsed.summary;
      parsed.locationText =
        normalizeExternalString(external.candidate.location) ?? parsed.locationText;
    }

    if (external.sections?.experience && external.sections.experience.length > 0) {
      const firstExp = external.sections.experience[0] as Record<string, unknown>;
      const title = normalizeExternalString(firstExp.title);
      if (title) {
        parsed.currentTitle = title;
      }
    }

    if (external.normalized_resume?.sections) {
      parsed.parsedSections = {
        ...parsed.parsedSections,
        ...external.normalized_resume.sections,
      };
    }

    const cleanedTextLength = cleanedText.length;
    logInfo('resume-preparation', 'External extraction completed', {
      resumeId: resume.id,
      method: methodUsed,
      cleanedTextLength,
      contaminationScore,
      salvageScore,
      llmStatus,
      llmFinalSource,
      llmError,
    });

    await updateResumeLifecycleStatus(
      supabase,
      resume.id,
      acceptedWithWarnings
        ? RESUME_LIFECYCLE_STATUSES.EXTRACTED_WITH_WARNINGS
        : RESUME_LIFECYCLE_STATUSES.EXTRACTED,
    );

    await updateResumeLifecycleStatus(supabase, resume.id, RESUME_LIFECYCLE_STATUSES.PARSED);
    const matchedSkillRows = await persistParsedResume(supabase, resume, cleanedText, parsed);
    await updateResumeLifecycleStatus(supabase, resume.id, RESUME_LIFECYCLE_STATUSES.READY);

    const parserVersion = `render-extractor:${llmFinalSource ?? 'heuristic_fallback'}`;
    await completeRun(supabase, runId, {
      status: 'completed',
      parserVersion,
      errorMessage: null,
    });

    return {
      extraction: {
        text: cleanedText,
        rawText,
        method: (methodUsed as ResumeExtractionMethod) ?? 'pdfjs-text',
        usedOcr: false,
        ocrAttempted: false,
        ocrImprovedQuality: null,
        ocrConfidence: null,
        ocrAvailable: true,
        ocrUnavailableReason: null,
        acceptedWithWarnings,
        warningCode: acceptedWithWarnings ? 'SALVAGED_FROM_NOISE' : null,
        warningMessage: warnings[0] ?? null,
        attemptedMethods: [],
        textLength: cleanedText.length,
        cleanedTextLength: cleanedText.length,
        contaminationScore,
        salvageScore,
        cleaningActions: external.diagnostics?.cleaning_actions ?? [],
        readiness: quality.isAcceptable ? 'partial' : 'poor',
        quality,
      },
      parsed,
      matchedSkillRows,
    };
  } catch (error) {
    const lifecycleStatus = resolvePreparationFailureStatus(error);

    try {
      await updateResumeLifecycleStatus(supabase, resume.id, lifecycleStatus);
    } catch (finalizeError) {
      if (finalizeError instanceof ResumePersistenceError) {
        logError('resume-preparation', 'Finalize persistence failed', {
          resumeId: resume.id,
          operation: finalizeError.context.operation,
          dbCode: finalizeError.sourceError.code ?? null,
        });
      } else {
        throw finalizeError;
      }
    }

    try {
      await completeRun(supabase, runId, {
        status: 'failed',
        parserVersion: 'fastapi-v1:prepare',
        errorMessage: toErrorMessage(error),
      });
    } catch (finalizeError) {
      if (finalizeError instanceof ResumePersistenceError) {
        logError('resume-preparation', 'Finalize persistence failed', {
          resumeId: resume.id,
          operation: finalizeError.context.operation,
          dbCode: finalizeError.sourceError.code ?? null,
        });
      } else {
        throw finalizeError;
      }
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
