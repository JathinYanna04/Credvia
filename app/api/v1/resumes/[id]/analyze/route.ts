import { fail, handleApiError, ok } from '@/lib/api';
import { captureServerEvent } from '@/lib/analytics/capture-server-event';
import { getActiveResume, getResumeById } from '@/lib/career-match/queries';
import { sendResumeAnalysisEmail } from '@/lib/email/send-resume-analysis-email';
import { recomputeMatchesForResume } from '@/lib/matching/service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getResumeAnalysisReadiness } from '@/lib/resume/analysis-readiness';
import { analyzeStoredResume } from '@/lib/resume/analyze';
import { ResumeExtractionError } from '@/lib/resume/extract';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logError, logInfo } from '@/lib/utils/logger';
import type {
  AnalyzeResumeRequest,
  AnalyzeResumeResponse,
  ResumeExtractionErrorDetails,
} from '@/lib/types';
import { z, ZodError } from 'zod';

const AnalyzeResumeRequestSchema = z
  .object({
    rerun: z.boolean().optional(),
    targetRole: z.string().trim().min(1).max(160).optional(),
    jobDescription: z.string().trim().min(1).max(12000).optional(),
    forceOCR: z.boolean().optional(),
    forceOcr: z.boolean().optional(),
  })
  .strict();

async function parseAnalyzeRequest(request: Request): Promise<AnalyzeResumeRequest> {
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
    const parsed = AnalyzeResumeRequestSchema.parse(JSON.parse(rawBody));
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
    | 'OCR_FAILED'
    | 'EMPTY_EXTRACTED_TEXT';
  message: string;
  details: ResumeExtractionErrorDetails;
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
    textLength: error.diagnostics?.textLength ?? 0,
    readiness: error.diagnostics?.readiness ?? 'failed',
    confidenceScore: error.diagnostics?.confidenceScore ?? 0,
    confidenceTier: error.diagnostics?.confidenceTier ?? 'low',
    likelyScannedPdf: error.diagnostics?.likelyScannedPdf ?? false,
  };

  const code = error.failureCode;

  if (code === 'IMAGE_BASED_PDF') {
    return {
      code,
      message:
        'This PDF appears image-based and could not be parsed reliably. Try a clearer text PDF or DOCX.',
      details,
    };
  }

  if (code === 'LOW_TEXT_CONFIDENCE') {
    return {
      code,
      message:
        'We extracted text from your resume, but the structure quality was lower than expected.',
      details,
    };
  }

  if (code === 'OCR_FAILED') {
    return {
      code,
      message:
        'OCR fallback was attempted but did not recover enough usable text. Try a clearer text PDF or DOCX.',
      details,
    };
  }

  if (code === 'EMPTY_EXTRACTED_TEXT') {
    return {
      code,
      message: 'No readable text could be extracted from this resume. Upload a text PDF or DOCX.',
      details,
    };
  }

  return {
    code: 'EXTRACTION_FAILED',
    message: 'This resume could not be read reliably. Try a clearer PDF or DOCX.',
    details,
  };
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseAnalyzeRequest(request);
    const limit = await enforceRateLimit('resume_analyze', user.id);

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many resume analyses. Try again shortly.', 429);
    }

    const resume = await getResumeById(supabase, params.id);

    if (!resume) {
      const existingResume = await supabase
        .from('resumes')
        .select('id, user_id')
        .eq('id', params.id)
        .maybeSingle();

      if (existingResume.error) {
        throw new Error(existingResume.error.message);
      }

      if (!existingResume.data) {
        return fail('NOT_FOUND', 'Resume not found.', 404);
      }

      return fail('FORBIDDEN', 'You do not have access to this resume.', 403);
    }

    if (resume.user_id !== user.id) {
      return fail('FORBIDDEN', 'You do not have access to this resume.', 403);
    }

    const latestRunResult = await supabase
      .from('resume_analysis_runs')
      .select('*')
      .eq('resume_id', resume.id)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRunResult.error) {
      throw new Error(latestRunResult.error.message);
    }

    const readiness = getResumeAnalysisReadiness(resume, latestRunResult.data ?? null);
    if (!readiness.ready) {
      const status = readiness.code === 'ANALYSIS_IN_PROGRESS' ? 409 : 422;
      logInfo('resume-analyze', 'Rejected before analysis', {
        userId: user.id,
        resumeId: resume.id,
        code: readiness.code,
        message: readiness.message,
        parseStatus: resume.parse_status,
        mimeType: resume.mime_type,
        filePath: resume.file_path,
      });
      return fail(
        readiness.code ?? 'VALIDATION_ERROR',
        readiness.message ?? 'Resume is not ready for analysis.',
        status,
      );
    }

    const processingUpdate = await supabase
      .from('resumes')
      .update({ parse_status: 'parsing' })
      .eq('id', resume.id);

    if (processingUpdate.error) {
      throw new Error(processingUpdate.error.message);
    }

    await captureServerEvent({
      event: 'resume_analysis_started',
      distinctId: user.id,
      properties: { resumeId: resume.id },
    });

    const download = await supabase.storage.from('resumes').download(resume.file_path);
    if (download.error || !download.data) {
      await supabase
        .from('resumes')
        .update({ parse_status: 'failed' })
        .eq('id', resume.id);
      logError('resume-analyze', 'Storage download failed', {
        userId: user.id,
        resumeId: resume.id,
        filePath: resume.file_path,
        storageError: download.error?.message ?? null,
      });
      return fail('RESUME_FILE_MISSING', 'Upload a resume file before analysis.', 422);
    }

    const buffer = Buffer.from(await download.data.arrayBuffer());
    logInfo('resume-analyze', 'Download complete', {
      userId: user.id,
      resumeId: resume.id,
      bytes: buffer.byteLength,
      forceOcr: body.forceOCR ?? false,
      rerun: body.rerun ?? false,
      hasTargetRole: Boolean(body.targetRole),
      hasJobDescription: Boolean(body.jobDescription),
    });

    try {
      const analysisClient = createServiceRoleClient() ?? supabase;
      const analysis = await analyzeStoredResume(analysisClient, resume, buffer, body);
      const activeResume = await getActiveResume(supabase, user.id);

      if (activeResume?.id === resume.id) {
        await recomputeMatchesForResume(supabase, user.id, resume.id);
      }

      const extractionMeta = analysis.parsed?.parsedSections?.__meta;

      await captureServerEvent({
        event: 'resume_analysis_completed',
        distinctId: user.id,
        properties: {
          resumeId: resume.id,
          extractedSkills: Array.isArray(analysis.matchedSkillRows)
            ? analysis.matchedSkillRows.length
            : null,
          extractionMethod: extractionMeta?.extractionMethod ?? null,
          usedOcr: extractionMeta?.usedOcr ?? false,
        },
      });

      if (user.email) {
        try {
          const profileResult = await supabase
            .from('profiles')
            .select('full_name')
            .eq('user_id', user.id)
            .maybeSingle();

          if (profileResult.error) {
            throw new Error(profileResult.error.message);
          }

          await sendResumeAnalysisEmail({
            to: user.email,
            name:
              profileResult.data?.full_name ??
              (typeof user.user_metadata?.full_name === 'string'
                ? user.user_metadata.full_name
                : null),
          });
        } catch (emailError) {
          logError('email', 'Resume analysis email failed', {
            userId: user.id,
            resumeId: resume.id,
            message:
              emailError instanceof Error ? emailError.message : 'Unknown email error',
          });
        }
      }

      const response: AnalyzeResumeResponse = {
        analyzed: true,
        resumeId: resume.id,
        extraction: {
          method: analysis.extraction.method,
          attemptedMethods: analysis.extraction.attemptedMethods,
          usedOcr: analysis.extraction.usedOcr,
          ocrAttempted: analysis.extraction.ocrAttempted,
          ocrImprovedQuality: analysis.extraction.ocrImprovedQuality,
          ocrConfidence: analysis.extraction.ocrConfidence,
          textLength: analysis.extraction.textLength,
          readiness: analysis.extraction.readiness,
          quality: {
            confidenceScore: analysis.extraction.quality.confidenceScore,
            confidenceTier: analysis.extraction.quality.confidenceTier,
            likelyScannedPdf: analysis.extraction.quality.likelyScannedPdf,
            humanReadableRatio: analysis.extraction.quality.humanReadableRatio,
            suspiciousTokenCount: analysis.extraction.quality.suspiciousTokenCount,
            resumeHintCount: analysis.extraction.quality.resumeHintCount,
          },
        },
        warning:
          analysis.extraction.quality.confidenceTier === 'high'
            ? null
            : 'We analyzed your resume, but the text quality was limited. For best results, upload a text-based PDF.',
      };

      return ok(response);
    } catch (analysisError) {
      const errorMessage =
        analysisError instanceof ResumeExtractionError
          ? analysisError.message
          : analysisError instanceof Error
            ? analysisError.message
            : 'Resume analysis failed.';

      await supabase
        .from('resumes')
        .update({ parse_status: 'failed' })
        .eq('id', resume.id);

      await captureServerEvent({
        event: 'resume_analysis_failed',
        distinctId: user.id,
        properties: {
          resumeId: resume.id,
          message: errorMessage,
        },
      });

      logError('resume-analyze', 'Analysis failed', {
        userId: user.id,
        resumeId: resume.id,
        parseStatus: resume.parse_status,
        mimeType: resume.mime_type,
        message: errorMessage,
        errorName: analysisError instanceof Error ? analysisError.name : 'UnknownError',
        forceOcrRequested: body.forceOCR ?? false,
        extractionFailureCode:
          analysisError instanceof ResumeExtractionError
            ? analysisError.failureCode
            : null,
        extractionDiagnostics:
          analysisError instanceof ResumeExtractionError
            ? analysisError.diagnostics
            : null,
      });

      if (analysisError instanceof ResumeExtractionError) {
        const extractionFailure = normalizeExtractionFailure(analysisError);
        return fail(
          extractionFailure.code,
          extractionFailure.message,
          422,
          extractionFailure.details,
        );
      }

      throw analysisError;
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (error instanceof ZodError) {
      return fail(
        'VALIDATION_ERROR',
        error.issues[0]?.message ?? 'Validation error.',
        400,
      );
    }

    return handleApiError(error);
  }
}
