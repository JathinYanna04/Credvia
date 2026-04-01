import { ZodError } from 'zod';
import { fail, handleApiError, ok } from '@/lib/api';
import { captureServerEvent } from '@/lib/analytics/capture-server-event';
import { getActiveResume, getOwnedResume } from '@/lib/career-match/queries';
import { sendResumeAnalysisEmail } from '@/lib/email/send-resume-analysis-email';
import { recomputeMatchesForResume } from '@/lib/matching/service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getResumeAnalysisReadiness } from '@/lib/resume/analysis-readiness';
import { ResumeExtractionError } from '@/lib/resume/extract';
import { analyzeStoredResume } from '@/lib/resume/analyze';
import { ResumeAnalyzeSchema } from '@/lib/schemas/career-match';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { logError, logInfo } from '@/lib/utils/logger';

async function parseAnalyzeRequest(request: Request) {
  const contentLength = request.headers.get('content-length');
  if (!contentLength || contentLength === '0') {
    return {};
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ZodError([
      {
        code: 'custom',
        message: 'Request body must be valid JSON.',
        path: [],
      },
    ]);
  }

  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return {};
  }

  return ResumeAnalyzeSchema.parse(JSON.parse(rawBody));
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    await parseAnalyzeRequest(request);
    const limit = await enforceRateLimit('resume_analyze', user.id);

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many resume analyses. Try again shortly.', 429);
    }

    const resume = await getOwnedResume(supabase, user.id, params.id);
    if (!resume) {
      return fail('NOT_FOUND', 'Resume not found.', 404);
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
      });
      return fail(readiness.code ?? 'VALIDATION_ERROR', readiness.message ?? 'Resume is not ready for analysis.', status);
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
      properties: {
        resumeId: resume.id,
      },
    });

    const download = await supabase.storage.from('resumes').download(resume.file_path);
    if (download.error || !download.data) {
      logError('resume-analyze', 'Storage download failed', {
        userId: user.id,
        resumeId: resume.id,
        filePath: resume.file_path,
        storageError: download.error?.message ?? null,
      });
      await supabase
        .from('resumes')
        .update({ parse_status: 'failed' })
        .eq('id', resume.id);
      return fail('RESUME_FILE_MISSING', 'Upload a resume file before analysis.', 422);
    }

    const buffer = Buffer.from(await download.data.arrayBuffer());
    logInfo('resume-analyze', 'Download complete', {
      userId: user.id,
      resumeId: resume.id,
      bytes: buffer.byteLength,
    });

    try {
      const analysisClient = createServiceRoleClient() ?? supabase;
      const analysis = await analyzeStoredResume(analysisClient, resume, buffer);
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
          console.error('[email] failed:', emailError);
        }
      }
    } catch (analysisError) {
      const errorMessage =
        analysisError instanceof ResumeExtractionError
          ? analysisError.message
          : analysisError instanceof Error
            ? analysisError.message
            : 'Resume analysis failed.';

      await supabase
        .from('resumes')
        .update({
          parse_status: 'failed',
        })
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
      });

      if (analysisError instanceof ResumeExtractionError) {
        return fail('RESUME_TEXT_MISSING', 'Upload or parse resume content before analysis.', 422);
      }

      throw analysisError;
    }

    return ok({ analyzed: true, resumeId: resume.id });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
