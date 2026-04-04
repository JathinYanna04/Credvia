import { fail, handleApiError, ok } from '@/lib/api';
import { captureServerEvent } from '@/lib/analytics/capture-server-event';
import { getJobCardsByIds, getOwnedResume } from '@/lib/career-match/queries';
import type { CareerMatch, CareerResumeProfile } from '@/components/career-match/types';
import { getResumeAnalysisReadiness } from '@/lib/resume/analysis-readiness';
import { assessResumeTextQuality } from '@/lib/resume/extract';
import {
  buildResumeAtsAnalysis,
  buildResumeVersionSummaries,
  getEffectiveStructuredProfile,
} from '@/lib/resume/intelligence';
import { ResumeUpdateSchema } from '@/lib/schemas/career-match';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';
import { logError } from '@/lib/utils/logger';
import { ZodError } from 'zod';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const resume = await getOwnedResume(supabase, user.id, params.id);

    if (!resume) {
      return fail('NOT_FOUND', 'Resume not found.', 404, { resumeId: params.id });
    }

    const [profileResult, skillsResult, analysesResult, matchesResult] = await Promise.all([
      supabase.from('resume_profiles').select('*').eq('resume_id', resume.id).maybeSingle(),
      supabase
        .from('resume_skills')
        .select('source_type, confidence, skill_slug, skill_name')
        .eq('resume_id', resume.id),
      supabase
        .from('resume_analysis_runs')
        .select('*')
        .eq('resume_id', resume.id)
        .order('started_at', { ascending: false })
        .limit(10),
      supabase
        .from('job_matches')
        .select('*')
        .eq('resume_id', resume.id)
        .eq('user_id', user.id)
        .order('overall_score', { ascending: false })
        .limit(10),
    ]);

    if (profileResult.error) throw new Error(profileResult.error.message);
    if (skillsResult.error) throw new Error(skillsResult.error.message);
    if (analysesResult.error) throw new Error(analysesResult.error.message);
    if (matchesResult.error) throw new Error(matchesResult.error.message);
    const versionsResult = await supabase
      .from('resumes')
      .select('id, file_name, is_active, parse_status, uploaded_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(12);

    if (versionsResult.error) throw new Error(versionsResult.error.message);

    const profileRow = (profileResult.data ?? null) as CareerResumeProfile | null;
    const hasCanonicalStructuredProfile = Boolean(profileRow?.raw_sections?.__structured);
    const profileLooksValid = Boolean(
      hasCanonicalStructuredProfile ||
        (profileRow?.parsed_text && assessResumeTextQuality(profileRow.parsed_text).isAcceptable),
    );

    const jobs = await getJobCardsByIds(
      supabase,
      profileLooksValid ? (matchesResult.data ?? []).map((match) => match.job_id) : [],
    );
    const jobLookup = new Map(jobs.map((job) => [job.id, job]));
    const latestRun = analysesResult.data?.[0] ?? null;
    const profile = profileLooksValid ? profileRow : null;
    const topMatches = ((profileLooksValid ? matchesResult.data ?? [] : []) as CareerMatch[]).map((match) => ({
      ...match,
      job: (jobLookup.get(match.job_id) ?? null) as CareerMatch['job'],
    })) as CareerMatch[];
    const effectiveProfile = getEffectiveStructuredProfile(profile);
    const atsAnalysis = buildResumeAtsAnalysis({
      profile,
      effectiveProfile,
      topMatches,
    });

    return ok({
      resume,
      analysisReadiness: getResumeAnalysisReadiness(resume, latestRun),
      profile,
      effectiveProfile,
      manualOverrides: profile?.raw_sections?.__manual ?? null,
      atsAnalysis,
      versions: buildResumeVersionSummaries({
        resumes: (versionsResult.data ?? []).map((entry) => ({
          ...entry,
          profile: entry.id === resume.id ? profile : null,
        })),
        activeDetailAnalysis: atsAnalysis,
      }),
      skills: (profileLooksValid ? skillsResult.data ?? [] : []).map((row) => ({
        source: row.source_type,
        confidence: row.confidence,
        skill: { id: row.skill_slug, slug: row.skill_slug, name: row.skill_name },
      })),
      analysisRuns: analysesResult.data ?? [],
      topMatches,
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

    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = ResumeUpdateSchema.parse(await request.json());
    const resume = await getOwnedResume(supabase, user.id, params.id);

    if (!resume) {
      return fail(
        'NOT_FOUND',
        'Resume not found.',
        404,
        { resumeId: params.id },
      );
    }

    if (body.manualOverrides) {
      const profileResult = await supabase
        .from('resume_profiles')
        .select('raw_sections')
        .eq('resume_id', resume.id)
        .maybeSingle();

      if (profileResult.error) {
        throw new Error(profileResult.error.message);
      }

      if (!profileResult.data) {
        return fail(
          'RESUME_NOT_READY',
          'Resume profile is not available for manual review yet.',
          422,
          { resumeId: resume.id },
          'Run extraction first so Credvia can build the structured profile.',
        );
      }

      const currentSections =
        profileResult.data.raw_sections && typeof profileResult.data.raw_sections === 'object'
          ? (profileResult.data.raw_sections as Record<string, unknown>)
          : {};
      const updatedSections = {
        ...currentSections,
        __manual: {
          ...(currentSections.__manual && typeof currentSections.__manual === 'object'
            ? (currentSections.__manual as Record<string, unknown>)
            : {}),
          ...body.manualOverrides,
          updated_at: new Date().toISOString(),
        },
      } as Json;

      const updateProfile = await supabase
        .from('resume_profiles')
        .update({ raw_sections: updatedSections })
        .eq('resume_id', resume.id);

      if (updateProfile.error) {
        throw new Error(updateProfile.error.message);
      }

      await captureServerEvent({
        event: 'resume_manual_overrides_saved',
        distinctId: user.id,
        properties: {
          resumeId: resume.id,
          sections: Object.keys(body.manualOverrides),
        },
      });

      return ok({
        updated: true,
        resumeId: resume.id,
        manualOverridesSaved: true,
      });
    }

    if (body.isActive !== true) {
      return fail(
        'VALIDATION_ERROR',
        'Only setting a resume as active or saving manual overrides is currently supported.',
        400,
        { received: body },
      );
    }

    const deactivate = await supabase
      .from('resumes')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (deactivate.error) {
      throw new Error(deactivate.error.message);
    }

    const activate = await supabase
      .from('resumes')
      .update({ is_active: true })
      .eq('id', resume.id);

    if (activate.error) {
      throw new Error(activate.error.message);
    }

    await captureServerEvent({
      event: 'resume_set_active',
      distinctId: user.id,
      properties: {
        resumeId: resume.id,
      },
    });

    return ok({
      updated: true,
      resumeId: resume.id,
      isActive: true,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (error instanceof ZodError) {
      return fail(
        'VALIDATION_ERROR',
        error.issues[0]?.message ?? 'Validation error.',
        400,
        { issues: error.issues },
      );
    }

    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const resume = await getOwnedResume(supabase, user.id, params.id);

    if (!resume) {
      return fail(
        'NOT_FOUND',
        'Resume not found.',
        404,
        { resumeId: params.id },
      );
    }

    const storageDelete = await supabase.storage.from('resumes').remove([resume.file_path]);
    if (storageDelete.error) {
      logError('resume-delete', 'Storage delete failed', {
        userId: user.id,
        resumeId: resume.id,
        filePath: resume.file_path,
        message: storageDelete.error.message,
      });
    }

    const deleteResult = await supabase.from('resumes').delete().eq('id', resume.id);
    if (deleteResult.error) {
      throw new Error(deleteResult.error.message);
    }

    if (resume.is_active) {
      const nextResume = await supabase
        .from('resumes')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (nextResume.error) {
        throw new Error(nextResume.error.message);
      }

      if (nextResume.data) {
        const activateNext = await supabase
          .from('resumes')
          .update({ is_active: true })
          .eq('id', nextResume.data.id);

        if (activateNext.error) {
          throw new Error(activateNext.error.message);
        }
      }
    }

    await captureServerEvent({
      event: 'resume_deleted',
      distinctId: user.id,
      properties: {
        resumeId: resume.id,
      },
    });

    return ok({ deleted: true, resumeId: resume.id });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
