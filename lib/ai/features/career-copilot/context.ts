import type { SupabaseClient } from '@supabase/supabase-js';
import { getActiveResume, getJobCardsByIds, getOwnedResume } from '@/lib/career-match/queries';
import { AiRuntimeError } from '@/lib/ai/errors';
import type { Database } from '@/lib/supabase/types';

export interface CareerCopilotContextSnapshot {
  resumeId: string;
  resumeUpdatedAt: string;
  profileUpdatedAt: string | null;
  matchId: string | null;
  matchUpdatedAt: string | null;
  mode: string;
}

export interface CareerCopilotPromptContext extends CareerCopilotContextSnapshot {
  resumeFileName: string;
  profileSummary: string;
  currentTitle: string | null;
  yearsExperience: number | null;
  skills: string[];
  experienceHighlights: string[];
  educationHighlights: string[];
  jobTitle: string | null;
  companyName: string | null;
  jobLocation: string | null;
  jobDescription: string | null;
  matchedSkills: string[];
  missingSkills: string[];
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export async function buildCareerCopilotContext(args: {
  supabase: SupabaseClient<Database>;
  userId: string;
  mode: string;
  resumeId?: string;
  matchId?: string;
}): Promise<CareerCopilotPromptContext> {
  const resume = args.resumeId
    ? await getOwnedResume(args.supabase, args.userId, args.resumeId)
    : await getActiveResume(args.supabase, args.userId);

  if (!resume) {
    throw new AiRuntimeError('NOT_FOUND', 'Resume not found. Upload or activate a resume first.', 404);
  }

  const [profileResult, skillsResult, matchResult] = await Promise.all([
    args.supabase
      .from('resume_profiles')
      .select('summary, current_title, years_experience, experience, education, updated_at')
      .eq('resume_id', resume.id)
      .eq('user_id', args.userId)
      .maybeSingle(),
    args.supabase
      .from('resume_skills')
      .select('skill_name, confidence')
      .eq('resume_id', resume.id)
      .eq('user_id', args.userId)
      .order('confidence', { ascending: false })
      .limit(40),
    args.matchId
      ? args.supabase
          .from('job_matches')
          .select('*')
          .eq('id', args.matchId)
          .eq('user_id', args.userId)
          .eq('resume_id', resume.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  if (skillsResult.error) {
    throw new Error(skillsResult.error.message);
  }

  if (matchResult.error) {
    throw new Error(matchResult.error.message);
  }

  const profile = profileResult.data;
  const match = matchResult.data;

  const job = match
    ? (await getJobCardsByIds(args.supabase, [match.job_id]))[0] ?? null
    : null;

  const topSkills = (skillsResult.data ?? [])
    .map((skill) => skill.skill_name)
    .filter((value, index, source) => value && source.indexOf(value) === index)
    .slice(0, 20);

  return {
    resumeId: resume.id,
    resumeUpdatedAt: resume.updated_at,
    profileUpdatedAt: profile?.updated_at ?? null,
    matchId: match?.id ?? null,
    matchUpdatedAt: match?.updated_at ?? null,
    mode: args.mode,
    resumeFileName: resume.file_name,
    profileSummary: profile?.summary?.trim() || 'No profile summary available.',
    currentTitle: profile?.current_title ?? null,
    yearsExperience: profile?.years_experience ?? null,
    skills: topSkills,
    experienceHighlights: toStringArray(profile?.experience).slice(0, 8),
    educationHighlights: toStringArray(profile?.education).slice(0, 6),
    jobTitle: job?.title ?? null,
    companyName: job?.company?.company_name ?? null,
    jobLocation: job?.location ?? null,
    jobDescription: job?.description_clean ?? job?.description_raw ?? null,
    matchedSkills: Array.isArray(match?.matched_skills)
      ? (match?.matched_skills as string[]).slice(0, 12)
      : [],
    missingSkills: Array.isArray(match?.missing_skills)
      ? (match?.missing_skills as string[]).slice(0, 12)
      : [],
  };
}
