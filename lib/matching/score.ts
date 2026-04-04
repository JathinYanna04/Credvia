import type { Database, Json } from '@/lib/supabase/types';
import type {
  CareerStructuredProfile,
  CareerWeightedScoreBreakdown,
} from '@/components/career-match/types';

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
  data: ['data', 'analytics', 'analyst', 'scientist'],
  sales: ['sales', 'account executive', 'growth'],
  marketing: ['marketing', 'growth marketing'],
};

const SKILL_ALIASES: Record<string, string[]> = {
  react: ['next.js', 'frontend', 'javascript'],
  typescript: ['javascript', 'node.js'],
  python: ['fastapi', 'django', 'flask'],
  postgresql: ['sql', 'postgres'],
  docker: ['containers', 'kubernetes'],
  aws: ['cloud', 'serverless'],
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

function flattenProfileSkills(profile: CareerStructuredProfile) {
  return [
    ...profile.skills.languages,
    ...profile.skills.frameworks,
    ...profile.skills.libraries,
    ...profile.skills.tools,
    ...profile.skills.databases,
    ...profile.skills.cloud,
    ...profile.skills.ai_ml,
    ...profile.skills.devops,
    ...profile.skills.platforms,
    ...profile.skills.others,
  ].map((value) => value.toLowerCase());
}

function normalizeJob(job: Database['public']['Tables']['startup_jobs']['Row'], jobSkills: JobSkillInput[]) {
  const combinedText = `${job.title} ${job.description_clean ?? job.description_raw ?? ''}`.toLowerCase();
  const mustHaveSkills = jobSkills.filter((skill) => skill.required);
  const niceToHaveSkills = jobSkills.filter((skill) => !skill.required);
  const responsibilities = (job.description_clean ?? job.description_raw ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 20)
    .slice(0, 12);

  return {
    roleTitle: job.title,
    seniority: job.seniority ?? null,
    mustHaveSkills,
    niceToHaveSkills,
    responsibilities,
    combinedText,
    roleFamily: inferRoleFamily(combinedText),
  };
}

function computeCoreSkillScore(profileSkills: string[], normalizedJob: ReturnType<typeof normalizeJob>) {
  if (normalizedJob.mustHaveSkills.length === 0 && normalizedJob.niceToHaveSkills.length === 0) {
    return { score: 55, matched: [] as string[], missing: [] as string[] };
  }

  const profileSkillSet = new Set(profileSkills);
  const weightedTotal =
    normalizedJob.mustHaveSkills.reduce((sum, skill) => sum + skill.weight * 1.5, 0) +
    normalizedJob.niceToHaveSkills.reduce((sum, skill) => sum + skill.weight, 0);
  const weightedMatched =
    normalizedJob.mustHaveSkills.reduce(
      (sum, skill) => sum + (profileSkillSet.has(skill.slug) ? skill.weight * 1.5 : 0),
      0,
    ) +
    normalizedJob.niceToHaveSkills.reduce(
      (sum, skill) => sum + (profileSkillSet.has(skill.slug) ? skill.weight : 0),
      0,
    );

  return {
    score: clamp((weightedMatched / Math.max(weightedTotal, 1)) * 100),
    matched: normalizedJob.mustHaveSkills
      .concat(normalizedJob.niceToHaveSkills)
      .filter((skill) => profileSkillSet.has(skill.slug))
      .map((skill) => skill.name),
    missing: normalizedJob.mustHaveSkills
      .filter((skill) => !profileSkillSet.has(skill.slug))
      .map((skill) => skill.name),
  };
}

function computeAdjacentSkillScore(profileSkills: string[], normalizedJob: ReturnType<typeof normalizeJob>) {
  const profileSkillSet = new Set(profileSkills);
  const adjacent = normalizedJob.mustHaveSkills.filter((skill) => {
    const aliases = SKILL_ALIASES[skill.slug] ?? [];
    return aliases.some((alias) => profileSkillSet.has(alias));
  });

  return {
    score:
      normalizedJob.mustHaveSkills.length === 0
        ? 50
        : clamp((adjacent.length / normalizedJob.mustHaveSkills.length) * 100),
    adjacentSkills: adjacent.map((skill) => skill.name),
  };
}

function extractEvidence(profile: CareerStructuredProfile) {
  return [
    ...profile.experience.flatMap((entry) =>
      entry.bullets.map((bullet) => ({
        section: 'experience' as const,
        text: `${entry.title ?? 'Experience'}: ${bullet}`,
      })),
    ),
    ...profile.projects.flatMap((entry) =>
      entry.bullets.map((bullet) => ({
        section: 'project' as const,
        text: `${entry.name ?? 'Project'}: ${bullet}`,
      })),
    ),
    ...(profile.candidate.summary
      ? [{ section: 'summary' as const, text: profile.candidate.summary }]
      : []),
  ];
}

function computeEvidenceScore(profile: CareerStructuredProfile, normalizedJob: ReturnType<typeof normalizeJob>) {
  const evidence = extractEvidence(profile);
  if (evidence.length === 0 || normalizedJob.responsibilities.length === 0) {
    return { score: evidence.length > 0 ? 45 : 20, matchedEvidence: [] as Array<{ section: 'experience' | 'project' | 'summary'; text: string; relevance: number }> };
  }

  const matchedEvidence = evidence
    .map((item) => {
      const evidenceText = item.text.toLowerCase();
      const bestResponsibilityHit = normalizedJob.responsibilities.reduce((best, responsibility) => {
        const responsibilityTerms = responsibility
          .toLowerCase()
          .split(/\W+/)
          .filter((term) => term.length > 3);
        const overlap = responsibilityTerms.filter((term) => evidenceText.includes(term)).length;
        return Math.max(best, overlap);
      }, 0);
      return {
        ...item,
        relevance: clamp(bestResponsibilityHit * 20, 0, 100),
      };
    })
    .filter((item) => item.relevance >= 20)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 6);

  const score =
    matchedEvidence.length === 0
      ? 35
      : clamp(matchedEvidence.reduce((sum, item) => sum + item.relevance, 0) / matchedEvidence.length);

  return { score, matchedEvidence };
}

function computeTitleScore(profile: CareerStructuredProfile, normalizedJob: ReturnType<typeof normalizeJob>) {
  const profileTitleText = `${profile.candidate.current_title ?? ''} ${profile.candidate.summary ?? ''}`;
  const resumeFamily = inferRoleFamily(profileTitleText);
  return {
    score:
      resumeFamily === 'generalist' || normalizedJob.roleFamily === 'generalist'
        ? 60
        : resumeFamily === normalizedJob.roleFamily
          ? 100
          : 40,
    resumeFamily,
  };
}

function computeExperienceScore(
  profile: CareerStructuredProfile,
  job: Database['public']['Tables']['startup_jobs']['Row'],
) {
  const evidenceYears = profile.experience.length;
  const seniority = (job.seniority ?? '').toLowerCase();
  const expectedYears =
    seniority.includes('senior') || seniority.includes('staff')
      ? 4
      : seniority.includes('mid')
        ? 2
        : seniority.includes('junior') || seniority.includes('entry')
          ? 0
          : 1;

  if (evidenceYears === 0 && profile.projects.length > 0) {
    return clamp(62 + Math.min(20, profile.projects.length * 6));
  }

  return clamp(50 + Math.min(50, evidenceYears * 18) - Math.max(0, expectedYears - evidenceYears) * 10);
}

function computeLocationScore(
  profile: CareerStructuredProfile,
  job: Database['public']['Tables']['startup_jobs']['Row'],
) {
  const jobPolicy = job.remote_policy ?? 'unknown';
  const resumeLocation = (profile.candidate.location ?? '').toLowerCase();
  const jobLocation = (job.location ?? '').toLowerCase();

  if (jobPolicy === 'remote') {
    return 100;
  }

  if (resumeLocation && jobLocation && (resumeLocation.includes(jobLocation) || jobLocation.includes(resumeLocation))) {
    return 95;
  }

  return 65;
}

function buildBreakdown(items: Array<Omit<CareerWeightedScoreBreakdown, 'weightedScore'>>) {
  return items.map((item) => ({
    ...item,
    weightedScore: Math.round(item.score * item.weight * 100) / 100,
  }));
}

export function computeJobMatch(params: {
  structuredProfile: CareerStructuredProfile;
  job: Database['public']['Tables']['startup_jobs']['Row'];
  jobSkills: JobSkillInput[];
}) {
  const normalizedJob = normalizeJob(params.job, params.jobSkills);
  const profileSkills = flattenProfileSkills(params.structuredProfile);
  const core = computeCoreSkillScore(profileSkills, normalizedJob);
  const adjacent = computeAdjacentSkillScore(profileSkills, normalizedJob);
  const evidence = computeEvidenceScore(params.structuredProfile, normalizedJob);
  const title = computeTitleScore(params.structuredProfile, normalizedJob);
  const experienceScore = computeExperienceScore(params.structuredProfile, params.job);
  const locationScore = computeLocationScore(params.structuredProfile, params.job);
  const educationScore = params.structuredProfile.education.length > 0 ? 75 : 45;
  const responsibilityCoverage = clamp(
    evidence.matchedEvidence.length === 0
      ? 25
      : evidence.matchedEvidence.reduce((sum, item) => sum + item.relevance, 0) /
          evidence.matchedEvidence.length,
  );

  const breakdown = buildBreakdown([
    {
      key: 'core_skill_match',
      label: 'Core skill match',
      score: core.score,
      weight: 0.3,
      rationale: 'Direct overlap between the canonical profile skills and explicit job requirements.',
    },
    {
      key: 'adjacent_skill_match',
      label: 'Adjacent skill match',
      score: adjacent.score,
      weight: 0.15,
      rationale: 'Transferable or alias-based coverage for related tooling and adjacent stacks.',
    },
    {
      key: 'evidence_match',
      label: 'Project and experience evidence',
      score: evidence.score,
      weight: 0.2,
      rationale: 'Scores grounded evidence from bullets and summary against job responsibilities.',
    },
    {
      key: 'role_relevance',
      label: 'Role relevance',
      score: title.score,
      weight: 0.1,
      rationale: 'Role-family fit between the candidate profile and the job title and description.',
    },
    {
      key: 'seniority_fit',
      label: 'Seniority fit',
      score: experienceScore,
      weight: 0.1,
      rationale: 'Treats project depth as meaningful evidence for students and early-career candidates.',
    },
    {
      key: 'education_fit',
      label: 'Education fit',
      score: educationScore,
      weight: 0.05,
      rationale: 'Applies light weighting so missing formal credentials are not overly fatal.',
    },
    {
      key: 'responsibility_coverage',
      label: 'Responsibility coverage',
      score: responsibilityCoverage,
      weight: 0.1,
      rationale: 'Measures whether the resume shows work that aligns with the job responsibilities.',
    },
  ]);

  const overallScore = clamp(breakdown.reduce((sum, item) => sum + item.score * item.weight, 0));
  const missingNiceToHaveSkills = normalizedJob.niceToHaveSkills
    .filter((skill) => !profileSkills.includes(skill.slug))
    .map((skill) => skill.name);
  const warnings = [
    ...(core.missing.length > 0 ? [`Missing must-have skills: ${core.missing.slice(0, 5).join(', ')}.`] : []),
    ...(locationScore < 80 && params.job.location ? [`Location fit is uncertain for ${params.job.location}.`] : []),
  ];
  const strengths = [
    ...(core.matched.length > 0 ? [`Matched ${core.matched.length} direct job skill${core.matched.length === 1 ? '' : 's'}.`] : []),
    ...(adjacent.adjacentSkills.length > 0 ? [`Adjacent strengths include ${adjacent.adjacentSkills.slice(0, 4).join(', ')}.`] : []),
    ...(evidence.matchedEvidence.length > 0 ? ['Resume bullets provide grounded evidence for this role.'] : []),
  ];

  return {
    overallScore,
    skillScore: core.score,
    titleScore: title.score,
    experienceScore,
    locationScore,
    matchedSkills: core.matched,
    missingSkills: core.missing,
    strengths,
    warnings,
    explanation: {
      fitEstimateLabel: 'Career Match is grounded in canonical resume data, explicit job requirements, and evidence from projects and experience.',
      summary: `This match reflects direct skill coverage, adjacent strengths, and grounded evidence from the candidate profile.`,
      roleFamily: {
        resume: title.resumeFamily,
        job: normalizedJob.roleFamily,
      },
      matchedSkillCount: core.matched.length,
      missingSkillCount: core.missing.length,
      breakdown,
      matchedSkills: core.matched,
      adjacentSkills: adjacent.adjacentSkills,
      missingMustHaveSkills: core.missing,
      missingNiceToHaveSkills,
      matchedEvidence: evidence.matchedEvidence,
      riskFlags: warnings,
      recommendations: [
        ...(core.missing.length > 0 ? [`Add evidence for ${core.missing.slice(0, 3).join(', ')}.`] : []),
        ...(missingNiceToHaveSkills.length > 0 ? [`Strengthen optional areas like ${missingNiceToHaveSkills.slice(0, 3).join(', ')}.`] : []),
      ],
    },
  } satisfies MatchComputation;
}
