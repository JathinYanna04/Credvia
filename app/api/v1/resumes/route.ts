import { fail, handleApiError, ok } from '@/lib/api';
import { captureServerEvent } from '@/lib/analytics/capture-server-event';
import { enforceRateLimit } from '@/lib/rate-limit';
import { prepareResumeForAnalysis } from '@/lib/resume/analyze';
import { resolveResumeOrchestrationClient } from '@/lib/resume/orchestration-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { logError, logInfo } from '@/lib/utils/logger';
import {
  getResumeExtension,
  isLegacyDocMimeType,
  isSupportedResumeMimeType,
  RESUME_UPLOAD_LIMIT_BYTES,
} from '@/lib/resume/extract';
import { RESUME_LIFECYCLE_STATUSES } from '@/lib/resume/lifecycle';

export const runtime = 'nodejs';

function resolveResumeContentType(file: File, extension: string) {
  if (file.type) {
    return file.type;
  }

  switch (extension) {
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'txt':
      return 'text/plain';
    case 'rtf':
      return 'application/rtf';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const resumesResult = await supabase
      .from('resumes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (resumesResult.error) throw new Error(resumesResult.error.message);

    const resumeIds = (resumesResult.data ?? []).map((row) => row.id);

    if (resumeIds.length === 0) {
      return ok([]);
    }

    const [profilesResult, skillsResult, analysisRunsResult] = await Promise.all([
      supabase.from('resume_profiles').select('*').in('resume_id', resumeIds),
      supabase
        .from('resume_skills')
        .select('resume_id, skill_slug, skill_name')
        .in('resume_id', resumeIds),
      supabase
        .from('resume_analysis_runs')
        .select('resume_id, status, parser_version, error_message, created_at')
        .in('resume_id', resumeIds)
        .order('created_at', { ascending: false }),
    ]);

    if (profilesResult.error) throw new Error(profilesResult.error.message);
    if (skillsResult.error) throw new Error(skillsResult.error.message);
    if (analysisRunsResult.error) throw new Error(analysisRunsResult.error.message);

    const profileLookup = new Map((profilesResult.data ?? []).map((profile) => [profile.resume_id, profile]));
    const skillsLookup = new Map<string, Array<{ id: string; name: string; slug: string }>>();
    const latestRunLookup = new Map<
      string,
      {
        resume_id: string;
        status: string;
        parser_version: string | null;
        error_message: string | null;
        created_at: string;
      }
    >();
    for (const run of analysisRunsResult.data ?? []) {
      if (!latestRunLookup.has(run.resume_id)) {
        latestRunLookup.set(run.resume_id, run);
      }
    }

    for (const row of skillsResult.data ?? []) {
      const current = skillsLookup.get(row.resume_id) ?? [];
      current.push({
        id: row.skill_slug,
        slug: row.skill_slug,
        name: row.skill_name,
      });
      skillsLookup.set(row.resume_id, current);
    }

    return ok(
      (resumesResult.data ?? []).map((resume) => ({
        ...resume,
        profile: profileLookup.get(resume.id) ?? null,
        skills: skillsLookup.get(resume.id) ?? [],
        latestRun: latestRunLookup.get(resume.id) ?? null,
      })),
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const limit = await enforceRateLimit('resume_upload', user.id);

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many resume uploads. Try again shortly.', 429);
    }

    const formData = await request.formData();
    const file = formData.get('resume');

    if (!(file instanceof File)) {
      return fail(
        'VALIDATION_ERROR',
        'A resume file is required.',
        400,
        { field: 'resume' },
        'Upload a PDF, DOCX, TXT, RTF, PNG, or JPG file.',
      );
    }

    if (file.size > RESUME_UPLOAD_LIMIT_BYTES) {
      return fail(
        'VALIDATION_ERROR',
        'Resume file must be 10 MB or smaller.',
        400,
        { maxBytes: RESUME_UPLOAD_LIMIT_BYTES },
        'Compress the file or upload a smaller version.',
      );
    }

    if (isLegacyDocMimeType(file.type, file.name)) {
      return fail(
        'UNSUPPORTED_RESUME_FORMAT',
        'Legacy DOC files are not supported safely in production.',
        400,
        { mimeType: file.type, fileName: file.name },
        'Convert this file to DOCX, TXT, or PDF and upload again.',
      );
    }

    if (!isSupportedResumeMimeType(file.type, file.name)) {
      return fail(
        'UNSUPPORTED_RESUME_FORMAT',
        'Unsupported resume format.',
        400,
        { mimeType: file.type, fileName: file.name },
        'Supported formats: PDF, DOCX, TXT, RTF, PNG, JPG.',
      );
    }

    const extension = getResumeExtension(file.name);
    if (!extension) {
      return fail('VALIDATION_ERROR', 'Unsupported resume file extension.', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const resumeId = crypto.randomUUID();
    const storagePath = `${user.id}/${resumeId}/original.${extension}`;

    const deactivateExisting = await supabase
      .from('resumes')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (deactivateExisting.error) {
      throw new Error(deactivateExisting.error.message);
    }

    const uploadResult = await supabase.storage
      .from('resumes')
      .upload(storagePath, buffer, {
        contentType: resolveResumeContentType(file, extension),
        upsert: true,
      });

    if (uploadResult.error) {
      throw new Error(uploadResult.error.message);
    }

    const resumeInsert = await supabase
      .from('resumes')
      .insert({
        id: resumeId,
        user_id: user.id,
        file_path: storagePath,
        file_name: file.name,
        mime_type: resolveResumeContentType(file, extension),
        file_size_bytes: buffer.byteLength,
        parse_status: RESUME_LIFECYCLE_STATUSES.UPLOADED,
        source: 'upload',
        is_active: true,
      })
      .select('*')
      .single();

    if (resumeInsert.error) {
      if (resumeInsert.error.code === '23514') {
        return fail(
          'INTERNAL_ERROR',
          'Resume lifecycle storage is out of sync with the deployed schema.',
          500,
          {
            operation: 'insert-resume-row',
            table: 'resumes',
            targetStatus: RESUME_LIFECYCLE_STATUSES.UPLOADED,
            dbCode: resumeInsert.error.code,
            dbHint: resumeInsert.error.hint ?? null,
            dbDetails: resumeInsert.error.details ?? null,
            dbMessage: resumeInsert.error.message,
          },
          'Apply the latest resume lifecycle migration and retry upload.',
        );
      }

      throw new Error(resumeInsert.error.message);
    }

    await captureServerEvent({
      event: 'resume_upload_completed',
      distinctId: user.id,
      properties: {
        resumeId,
        mimeType: resumeInsert.data.mime_type,
        fileExtension: extension,
        fileSizeBytes: buffer.byteLength,
      },
    });
    logInfo('resume-upload', 'Upload completed', {
      userId: user.id,
      resumeId,
      mimeType: resumeInsert.data.mime_type,
      bytes: buffer.byteLength,
    });

    try {
      const orchestrationClient = resolveResumeOrchestrationClient({
        resumeId,
      });
      await prepareResumeForAnalysis(orchestrationClient, resumeInsert.data, buffer, {});
    } catch (preparationError) {
      logError('resume-upload', 'Initial preparation failed', {
        userId: user.id,
        resumeId,
        message:
          preparationError instanceof Error
            ? preparationError.message
            : 'Unknown preparation failure',
      });
    }

    const refreshedResume = await supabase
      .from('resumes')
      .select('*')
      .eq('id', resumeId)
      .single();

    if (refreshedResume.error) {
      throw new Error(refreshedResume.error.message);
    }

    return ok(refreshedResume.data);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
