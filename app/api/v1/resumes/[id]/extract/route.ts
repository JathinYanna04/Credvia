import { fail, handleApiError, ok } from '@/lib/api';
import { captureServerEvent } from '@/lib/analytics/capture-server-event';
import { getResumeById } from '@/lib/career-match/queries';
import {
  prepareResumeForAnalysis,
  prepareResumeFromExternalExtraction,
  type ExternalExtractionPayload,
} from '@/lib/resume/analyze';
import { ResumeExtractionError } from '@/lib/resume/extract';
import {
  ResumePersistenceError,
  resumePersistenceErrorDetails,
} from '@/lib/resume/persistence-error';
import { resolveResumeOrchestrationClient } from '@/lib/resume/orchestration-client';
import { ResumeExtractSchema } from '@/lib/schemas/career-match';
import {
  normalizeResumeLifecycleStatus,
  RESUME_LIFECYCLE_STATUSES,
  shouldAllowExtractionRetry,
} from '@/lib/resume/lifecycle';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ResumeExtractionErrorDetails } from '@/lib/types';
import { logError, logInfo } from '@/lib/utils/logger';
import { ZodError } from 'zod';

export const runtime = 'nodejs';

async function parseExtractRequest(request: Request) {
  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return {};
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ZodError([
      { code: 'custom', message: 'Request body must be valid JSON.', path: [] },
    ]);
  }

  try {
    const parsed = ResumeExtractSchema.parse(JSON.parse(rawBody));
    const normalizedForceOcr = parsed.forceOCR ?? parsed.forceOcr;

    if (normalizedForceOcr === undefined) {
      return parsed;
    }

    return {
      ...parsed,
      forceOCR: normalizedForceOcr,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ZodError([
        { code: 'custom', message: 'Request body must be valid JSON.', path: [] },
      ]);
    }

    throw error;
  }
}

function normalizeExtractionFailure(error: ResumeExtractionError): {
  code:
    | 'EXTRACTION_FAILED'
    | 'IMAGE_BASED_PDF'
    | 'LOW_TEXT_CONFIDENCE'
    | 'OCR_UNAVAILABLE'
    | 'OCR_FAILED'
    | 'EMPTY_EXTRACTED_TEXT';
  message: string;
  details: ResumeExtractionErrorDetails;
  suggestedAction?: string;
} {
  const details: ResumeExtractionErrorDetails = {
    reason: error.diagnostics?.reason ?? error.quality?.reason ?? error.message,
    attemptedMethods: error.attemptedMethods,
    method: error.method,
    usedOcr: error.diagnostics?.usedOcr ?? false,
    ocrAttempted:
      error.diagnostics?.ocrAttempted ?? error.attemptedMethods.includes('pdf-ocr'),
    ocrImprovedQuality: error.diagnostics?.ocrImprovedQuality ?? null,
    ocrConfidence: error.diagnostics?.ocrConfidence ?? null,
    ocrAvailable: error.diagnostics?.ocrAvailable ?? true,
    ocrUnavailableReason: error.diagnostics?.ocrUnavailableReason ?? null,
    textLength: error.diagnostics?.textLength ?? 0,
    wordCount: error.diagnostics?.wordCount ?? 0,
    readiness: error.diagnostics?.readiness ?? 'failed',
    confidenceScore: error.diagnostics?.confidenceScore ?? 0,
    confidenceTier: error.diagnostics?.confidenceTier ?? 'low',
    detectedSectionCount: error.diagnostics?.detectedSectionCount ?? 0,
    junkRatio: error.diagnostics?.junkRatio ?? 1,
    likelyScannedPdf: error.diagnostics?.likelyScannedPdf ?? false,
    contaminationScore: error.diagnostics?.contaminationScore ?? 0,
    cleanedTextLength: error.diagnostics?.cleanedTextLength ?? 0,
    salvageScore: error.diagnostics?.salvageScore ?? 0,
    cleaningActions: error.diagnostics?.cleaningActions ?? [],
  };

  if (error.failureCode === 'IMAGE_BASED_PDF') {
    return {
      code: 'IMAGE_BASED_PDF',
      message:
        'This PDF appears image-based and could not be parsed reliably. Retry with Force OCR or upload DOCX/TXT.',
      details,
      suggestedAction: 'Retry extraction with Force OCR enabled.',
    };
  }

  if (error.failureCode === 'LOW_TEXT_CONFIDENCE') {
    return {
      code: 'LOW_TEXT_CONFIDENCE',
      message:
        'Text was extracted but quality is too low for reliable parsing and analysis.',
      details,
      suggestedAction: 'Upload a cleaner resume or force OCR for scanned documents.',
    };
  }

  if (error.failureCode === 'OCR_FAILED') {
    return {
      code: 'OCR_FAILED',
      message: 'OCR fallback was attempted but failed to recover enough usable text.',
      details,
      suggestedAction: 'Upload a clearer file, ideally DOCX or TXT, then retry.',
    };
  }

  if (error.failureCode === 'OCR_UNAVAILABLE') {
    return {
      code: 'OCR_UNAVAILABLE',
      message:
        'OCR fallback is unavailable in this runtime. Extraction could not recover enough reliable text.',
      details,
      suggestedAction:
        'Install OCR runtime dependencies or upload a cleaner text-based PDF/DOCX and retry.',
    };
  }

  if (error.failureCode === 'EMPTY_EXTRACTED_TEXT') {
    return {
      code: 'EMPTY_EXTRACTED_TEXT',
      message: 'No readable text could be extracted from this resume.',
      details,
      suggestedAction: 'Upload a text-based PDF, DOCX, TXT, or a clearer image.',
    };
  }

  return {
    code: 'EXTRACTION_FAILED',
    message: 'Resume extraction failed.',
    details,
    suggestedAction: 'Retry extraction or upload a different file format.',
  };
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseExtractRequest(request);
    const limit = await enforceRateLimit('resume_analyze', user.id);

    if (!limit.success) {
      return fail(
        'RATE_LIMITED',
        'Too many resume extraction attempts. Try again shortly.',
        429,
        { rateLimitKey: 'resume_analyze' },
      );
    }

    const resume = await getResumeById(supabase, params.id);

    if (!resume) {
      return fail('NOT_FOUND', 'Resume not found.', 404, { resumeId: params.id });
    }

    if (resume.user_id !== user.id) {
      return fail(
        'FORBIDDEN',
        'You do not have access to this resume.',
        403,
        { resumeId: params.id },
      );
    }

    const normalizedStatus = normalizeResumeLifecycleStatus(resume.parse_status);

    if (!shouldAllowExtractionRetry(resume.parse_status)) {
      return fail(
        'ANALYSIS_IN_PROGRESS',
        'Resume processing is currently running.',
        409,
        { parseStatus: normalizedStatus ?? resume.parse_status },
      );
    }

    const download = await supabase.storage.from('resumes').download(resume.file_path);

    if (download.error || !download.data) {
      return fail(
        'RESUME_FILE_MISSING',
        'Upload a resume file before extraction.',
        422,
        {
          filePath: resume.file_path,
          storageError: download.error?.message ?? null,
        },
        'Re-upload this resume file and try again.',
      );
    }

    const orchestrationClient = resolveResumeOrchestrationClient({
      resumeId: resume.id,
    });
    const buffer = Buffer.from(await download.data.arrayBuffer());
    const extractorUrl = process.env.RESUME_EXTRACTOR_URL ?? null;
    let preparation;

    if (extractorUrl) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      try {
        const form = new FormData();
        form.set('file', new Blob([buffer]), resume.file_name);
        form.set('mime_type', resume.mime_type);
        form.set('filename', resume.file_name);

        const response = await fetch(`${extractorUrl.replace(/\/$/, '')}/extract`, {
          method: 'POST',
          body: form,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Extractor service failed (${response.status}).`);
        }

        const payload = (await response.json()) as ExternalExtractionPayload;
        preparation = await prepareResumeFromExternalExtraction(orchestrationClient, resume, payload);
      } finally {
        clearTimeout(timeout);
      }
    } else {
      preparation = await prepareResumeForAnalysis(orchestrationClient, resume, buffer, {
        forceOCR: body.forceOCR ?? body.forceOcr,
      });
    }

    await captureServerEvent({
      event: 'resume_extraction_completed',
      distinctId: user.id,
      properties: {
        resumeId: resume.id,
        method: preparation.extraction.method,
        usedOcr: preparation.extraction.usedOcr,
        confidenceTier: preparation.extraction.quality.confidenceTier,
      },
    });

    logInfo('resume-extract', 'Extraction completed', {
      userId: user.id,
      resumeId: resume.id,
      status: RESUME_LIFECYCLE_STATUSES.READY,
      method: preparation.extraction.method,
      usedOcr: preparation.extraction.usedOcr,
      confidenceTier: preparation.extraction.quality.confidenceTier,
    });

    return ok({
      extracted: true,
      resumeId: resume.id,
      status: RESUME_LIFECYCLE_STATUSES.READY,
      warning: preparation.extraction.warningMessage,
      extraction: {
        method: preparation.extraction.method,
        attemptedMethods: preparation.extraction.attemptedMethods,
        usedOcr: preparation.extraction.usedOcr,
        ocrAttempted: preparation.extraction.ocrAttempted,
        ocrImprovedQuality: preparation.extraction.ocrImprovedQuality,
        ocrConfidence: preparation.extraction.ocrConfidence,
        ocrAvailable: preparation.extraction.ocrAvailable,
        ocrUnavailableReason: preparation.extraction.ocrUnavailableReason,
        acceptedWithWarnings: preparation.extraction.acceptedWithWarnings,
        warningCode: preparation.extraction.warningCode,
        warningMessage: preparation.extraction.warningMessage,
        textLength: preparation.extraction.textLength,
        cleanedTextLength: preparation.extraction.cleanedTextLength,
        contaminationScore: preparation.extraction.contaminationScore,
        salvageScore: preparation.extraction.salvageScore,
        cleaningActions: preparation.extraction.cleaningActions,
        readiness: preparation.extraction.readiness,
        quality: preparation.extraction.quality,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail(
        'UNAUTHORIZED',
        'You need to sign in.',
        401,
        undefined,
        'Sign in again and retry your request.',
      );
    }

    if (error instanceof ResumePersistenceError) {
      const details = resumePersistenceErrorDetails(error);
      const isOrchestrationUnavailable =
        details.operation === 'resolve-orchestration-client' ||
        details.dbCode === 'CONFIG_MISSING';
      const isRlsBlocked =
        details.table === 'resume_analysis_runs' &&
        error.isRlsViolation;
      const isSchemaMismatch = error.isConstraintViolation;

      logError('resume-extract', 'Lifecycle persistence failed', details);

      if (isOrchestrationUnavailable) {
        return fail(
          'ANALYSIS_SERVICE_UNAVAILABLE',
          'Resume orchestration service is unavailable.',
          503,
          details,
          'Set SUPABASE_SERVICE_ROLE_KEY and retry extraction.',
        );
      }

      if (isRlsBlocked) {
        return fail(
          'RESUME_ANALYSIS_RUNS_RLS_BLOCKED',
          'The system could not persist extraction tracking for this resume.',
          500,
          details,
          'Verify database policies or internal service-role configuration.',
        );
      }

      return fail(
        'INTERNAL_ERROR',
        isSchemaMismatch
          ? 'Resume lifecycle storage is out of sync with the deployed schema.'
          : 'Could not persist resume extraction state.',
        500,
        details,
        isSchemaMismatch
          ? 'Apply the latest resume lifecycle migration and retry extraction.'
          : 'Retry extraction. If this persists, contact support with the error code.',
      );
    }

    if (error instanceof ResumeExtractionError) {
      const normalizedFailure = normalizeExtractionFailure(error);
      return fail(
        normalizedFailure.code,
        normalizedFailure.message,
        422,
        normalizedFailure.details,
        normalizedFailure.suggestedAction,
      );
    }

    if (error instanceof ZodError) {
      return fail(
        'VALIDATION_ERROR',
        error.issues[0]?.message ?? 'Validation error.',
        400,
        { issues: error.issues },
      );
    }

    logError('resume-extract', 'Unhandled extraction error', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    return handleApiError(error);
  }
}
