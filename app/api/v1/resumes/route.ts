import { fail, handleApiError, ok } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';
import {
  getResumeExtension,
  isSupportedResumeMimeType,
  RESUME_UPLOAD_LIMIT_BYTES,
} from '@/lib/resume/extract';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const [resumesResult, profilesResult, skillsResult] = await Promise.all([
      supabase.from('resumes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('resume_profiles').select('*'),
      supabase.from('resume_skills').select('resume_id, skill_slug, skill_name'),
    ]);

    if (resumesResult.error) throw new Error(resumesResult.error.message);
    if (profilesResult.error) throw new Error(profilesResult.error.message);
    if (skillsResult.error) throw new Error(skillsResult.error.message);

    const profileLookup = new Map((profilesResult.data ?? []).map((profile) => [profile.resume_id, profile]));
    const skillsLookup = new Map<string, Array<{ id: string; name: string; slug: string }>>();

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
      return fail('VALIDATION_ERROR', 'A PDF or DOCX resume file is required.', 400);
    }

    if (file.size > RESUME_UPLOAD_LIMIT_BYTES) {
      return fail('VALIDATION_ERROR', 'Resume file must be 10 MB or smaller.', 400);
    }

    if (!isSupportedResumeMimeType(file.type, file.name)) {
      return fail('VALIDATION_ERROR', 'Only PDF and DOCX resumes are supported.', 400);
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
        contentType: file.type || (extension === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
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
        mime_type: file.type || (extension === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
        file_size_bytes: buffer.byteLength,
        parse_status: 'uploaded',
        source: 'upload',
        is_active: true,
      })
      .select('*')
      .single();

    if (resumeInsert.error) {
      throw new Error(resumeInsert.error.message);
    }

    return ok(resumeInsert.data);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
