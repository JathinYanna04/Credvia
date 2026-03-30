import type { Database, Json } from '@/lib/supabase/types';

type ResumeProfileRow = Database['public']['Tables']['resume_profiles']['Row'];

export interface JobSkillInput {
  slug: string;
  name: string;
  required: boolean;
  weight: number;
}

export interface MatchComputation {
  overallScore: number;
  skillScore: number;
  titleScore: number;
  experienceScore: number;
  locationScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  warnings: string[];
  explanation: Json;
}

const ROLE_FAMILIES: Record<string, string[]> = {
  engineering: ['engineer', 'developer', 'backend', 'frontend', 'full stack', 'software', 'platform', 'devops', 'ml'],
  product: ['product', 'pm'],
  design: ['designer', 'design', 'ux', 'ui'],
  sales: ['sales', 'account executive', 'growth'],
  marketing: ['marketing', 'growth marketing'],
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function inferRoleFamily(text: string) {
  const normalized = text.toLowerCase();
  for (const [family, keywords] of Object.entries(ROLE_FAMILIES)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return family;
    }
  }
  return 'generalist';
}

function scoreLocation(
  resumeProfile: ResumeProfileRow | null,
  job: Database['public']['Tables']['startup_jobs']['Row'],
) {
  const jobPolicy = job.remote_policy ?? 'unknown';
  const resumeLocation = (resumeProfile?.location ?? '').toLowerCase();
  const jobLocation = (job.location ?? '').toLowerCase();

  if (jobPolicy === 'remote') {
    return { score: 100, warnings: [] as string[] };
  }

  if (resumeLocation && jobLocation && (resumeLocation.includes(jobLocation) || jobLocation.includes(resumeLocation))) {
    return { score: 95, warnings: [] as string[] };
  }

  return { score: 65, warnings: jobLocation ? [`Location fit is uncertain for ${job.location}.`] : [] };
}

export function computeJobMatch(params: {
  resumeTitleText: string;
  resumeProfile: ResumeProfileRow | null;
  resumeSkillSlugs: string[];
  job: Database['public']['Tables']['startup_jobs']['Row'];
  jobSkills: JobSkillInput[];
}) {
  const resumeSkillSet = new Set(params.resumeSkillSlugs);
  const matchedSkills = params.jobSkills.filter((skill) => resumeSkillSet.has(skill.slug));
  const missingSkills = params.jobSkills.filter((skill) => skill.required && !resumeSkillSet.has(skill.slug));

  const totalWeight = params.jobSkills.reduce((sum, skill) => sum + (skill.required ? skill.weight * 1.5 : skill.weight), 0) || 1;
  const matchedWeight = matchedSkills.reduce((sum, skill) => sum + (skill.required ? skill.weight * 1.5 : skill.weight), 0);
  const skillScore = clamp((matchedWeight / totalWeight) * 100);

  const resumeFamily = inferRoleFamily(params.resumeTitleText);
  const jobFamily = inferRoleFamily(`${params.job.title} ${params.job.description_clean ?? params.job.description_raw ?? ''}`);
  const titleScore = resumeFamily === 'generalist' || jobFamily === 'generalist'
    ? 60
    : resumeFamily === jobFamily
      ? 100
      : 35;

  const experienceYears = params.resumeProfile?.years_experience ?? null;
  let experienceScore = 70;
  const warnings: string[] = [];

  const minExperience = (() => {
    const seniority = (params.job.seniority ?? '').toLowerCase();
    if (seniority.includes('senior') || seniority.includes('staff')) return 5;
    if (seniority.includes('mid')) return 3;
    if (seniority.includes('junior') || seniority.includes('entry')) return 1;
    return null;
  })();

  if (experienceYears !== null && minExperience !== null) {
    if (experienceYears >= minExperience) {
      experienceScore = 100;
    } else {
      const delta = minExperience - experienceYears;
      experienceScore = clamp(100 - delta * 20, 25, 100);
      warnings.push(`Role expects about ${minExperience}+ years of experience.`);
    }
  }

  const location = scoreLocation(params.resumeProfile, params.job);
  warnings.push(...location.warnings);

  const overallScore = clamp(
    skillScore * 0.55 +
      titleScore * 0.2 +
      experienceScore * 0.15 +
      location.score * 0.1,
  );

  const strengths = [
    ...(matchedSkills.length > 0 ? [`Matched ${matchedSkills.length} job skill${matchedSkills.length === 1 ? '' : 's'}.`] : []),
    ...(titleScore >= 90 ? ['Role family aligns closely with your resume.'] : []),
    ...(experienceScore >= 90 ? ['Your experience level fits this role.'] : []),
  ];

  return {
    overallScore,
    skillScore,
    titleScore,
    experienceScore,
    locationScore: location.score,
    matchedSkills: matchedSkills.map((skill) => skill.name),
    missingSkills: missingSkills.map((skill) => skill.name),
    strengths,
    warnings,
    explanation: {
      fitEstimateLabel: 'Career Match is a fit estimate based on explicit skills and structured role signals.',
      roleFamily: {
        resume: resumeFamily,
        job: jobFamily,
      },
      matchedSkillCount: matchedSkills.length,
      missingSkillCount: missingSkills.length,
    },
  } satisfies MatchComputation;
}
