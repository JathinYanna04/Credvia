import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { captureServerEvent } from '@/lib/analytics/capture-server-event';
import { getActiveResume, getOwnedResume } from '@/lib/career-match/queries';
import { sendResumeAnalysisEmail } from '@/lib/email/send-resume-analysis-email';
import { recomputeMatchesForResume } from '@/lib/matching/service';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ResumeExtractionError } from '@/lib/resume/extract';
import { analyzeStoredResume } from '@/lib/resume/analyze';
import { ResumeAnalyzeSchema } from '@/lib/schemas/career-match';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    await parseJson(request, ResumeAnalyzeSchema);
    const limit = await enforceRateLimit('resume_analyze', user.id);

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many resume analyses. Try again shortly.', 429);
    }

    const resume = await getOwnedResume(supabase, user.id, params.id);
    if (!resume) {
      return fail('NOT_FOUND', 'Resume not found.', 404);
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
      throw new Error(download.error?.message ?? 'Could not download stored resume.');
    }

    const buffer = Buffer.from(await download.data.arrayBuffer());

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
          message:
            analysisError instanceof Error
              ? analysisError.message
              : 'Resume analysis failed.',
        },
      });
      throw analysisError;
    }

    return ok({ analyzed: true, resumeId: resume.id });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (error instanceof ResumeExtractionError) {
      return fail('VALIDATION_ERROR', error.message, 422);
    }

    return handleApiError(error);
  }
}
