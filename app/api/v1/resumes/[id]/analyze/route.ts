import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { getActiveResume, getOwnedResume } from '@/lib/career-match/queries';
import { recomputeMatchesForResume } from '@/lib/matching/service';
import { enforceRateLimit } from '@/lib/rate-limit';
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

    const download = await supabase.storage.from('resumes').download(resume.file_path);
    if (download.error || !download.data) {
      throw new Error(download.error?.message ?? 'Could not download stored resume.');
    }

    const buffer = Buffer.from(await download.data.arrayBuffer());

    try {
      const analysisClient = createServiceRoleClient() ?? supabase;
      await analyzeStoredResume(analysisClient, resume, buffer);
      const activeResume = await getActiveResume(supabase, user.id);
      if (activeResume?.id === resume.id) {
        await recomputeMatchesForResume(supabase, user.id, resume.id);
      }
    } catch (analysisError) {
      await supabase
        .from('resumes')
        .update({
          parse_status: 'failed',
        })
        .eq('id', resume.id);
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
