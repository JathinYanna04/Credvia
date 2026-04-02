import { fail, handleApiError, ok } from '@/lib/api';
import { captureServerEvent } from '@/lib/analytics/capture-server-event';
import { getActiveResume, getResumeById } from '@/lib/career-match/queries';
import { sendResumeAnalysisEmail } from '@/lib/email/send-resume-analysis-email';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getResumeAnalysisReadiness } from '@/lib/resume/analysis-readiness';
import { runResumeAnalysis } from '@/lib/resume/analyze';
import {
  normalizeResumeLifecycleStatus,
  RESUME_LIFECYCLE_STATUSES,
} from '@/lib/resume/lifecycle';
import { ResumeAnalyzeSchema } from '@/lib/schemas/career-match';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logError, logInfo } from '@/lib/utils/logger';
import type { AnalyzeResumeRequest, AnalyzeResumeResponse } from '@/lib/types';
import { ZodError } from 'zod';

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
    const parsed = ResumeAnalyzeSchema.parse(JSON.parse(rawBody));
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
      return fail(
        'RATE_LIMITED',
        'Too many resume analyses. Try again shortly.',
        429,
        { rateLimitKey: 'resume_analyze' },
      );
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
        return fail('NOT_FOUND', 'Resume not found.', 404, { resumeId: params.id });
      }

      return fail(
        'FORBIDDEN',
        'You do not have access to this resume.',
        403,
        { resumeId: params.id },
      );
    }

    if (resume.user_id !== user.id) {
      return fail(
        'FORBIDDEN',
        'You do not have access to this resume.',
        403,
        { resumeId: params.id },
      );
    }

    if (body.forceOCR || body.forceOcr) {
      return fail(
        'RESUME_NOT_READY',
        'Force OCR is only supported on the extraction endpoint.',
        422,
        {
          resumeId: resume.id,
          endpoint: `/api/v1/resumes/${resume.id}/extract`,
        },
        'Use Retry Extraction with Force OCR, then run analysis again.',
      );
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

    const normalizedStatus = normalizeResumeLifecycleStatus(resume.parse_status);

    if (body.rerun && normalizedStatus === RESUME_LIFECYCLE_STATUSES.ANALYZED) {
      const setReadyResult = await supabase
        .from('resumes')
        .update({ parse_status: RESUME_LIFECYCLE_STATUSES.READY })
        .eq('id', resume.id);

      if (setReadyResult.error) {
        throw new Error(setReadyResult.error.message);
      }

      resume.parse_status = RESUME_LIFECYCLE_STATUSES.READY;
    }

    const readiness = getResumeAnalysisReadiness(resume, latestRunResult.data ?? null);
    if (!readiness.ready) {
      const status = readiness.code === 'ANALYSIS_IN_PROGRESS' ? 409 : 422;
      const readinessDetails = {
        parseStatus: resume.parse_status,
        mimeType: resume.mime_type,
        hasFilePath: Boolean(resume.file_path),
        latestRunStatus: latestRunResult.data?.status ?? null,
      };
      logInfo('resume-analyze', 'Rejected before analysis', {
        userId: user.id,
        resumeId: resume.id,
        code: readiness.code,
        message: readiness.message,
        ...readinessDetails,
        filePath: resume.file_path,
      });
      return fail(
        readiness.code ?? 'RESUME_NOT_READY',
        readiness.message ?? 'Resume is not ready for analysis.',
        status,
        status === 422 ? readinessDetails : undefined,
        status === 422
          ? 'Run extraction/retry first and wait until the resume reaches READY status.'
          : undefined,
      );
    }

    await captureServerEvent({
      event: 'resume_analysis_started',
      distinctId: user.id,
      properties: { resumeId: resume.id },
    });

    const analysis = await runResumeAnalysis(supabase, resume);
    const activeResume = await getActiveResume(supabase, user.id);

    await captureServerEvent({
      event: 'resume_analysis_completed',
      distinctId: user.id,
      properties: {
        resumeId: resume.id,
        isActiveResume: activeResume?.id === resume.id,
        matchCount: analysis.matchCount,
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
      status: RESUME_LIFECYCLE_STATUSES.ANALYZED,
      matchCount: analysis.matchCount,
      warning: null,
    };

    return ok(response);
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

    if (error instanceof ZodError) {
      return fail(
        'VALIDATION_ERROR',
        error.issues[0]?.message ?? 'Validation error.',
        400,
      );
    }

    if (error instanceof Error) {
      logError('resume-analyze', 'Analysis failed', {
        message: error.message,
      });
    }

    return handleApiError(error);
  }
}
