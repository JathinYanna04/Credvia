import type {
  CareerMatch,
  CareerResumeAtsAnalysis,
  CareerResumeManualOverrides,
  CareerResumeProfile,
  CareerResumeVersionSummary,
  CareerStructuredAdditional,
  CareerStructuredCandidate,
  CareerStructuredDiagnostics,
  CareerStructuredEducation,
  CareerStructuredExperience,
  CareerStructuredProfile,
  CareerStructuredProject,
  CareerStructuredSkills,
} from '@/components/career-match/types';

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toStringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : null))
    .filter((entry): entry is string => Boolean(entry));
}

function buildFallbackStructuredProfile(profile: CareerResumeProfile | null): CareerStructuredProfile | null {
  if (!profile) return null;

  const candidate: CareerStructuredCandidate = {
    full_name: profile.full_name,
    current_title: profile.current_title,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    linkedin: null,
    github: null,
    portfolio: null,
    summary: profile.summary,
  };

  const skills: CareerStructuredSkills = {
    languages: [],
    frameworks: [],
    tools: [],
    databases: [],
    cloud: [],
    others: toStringArray(profile.raw_sections?.skills ?? []),
    spoken_languages: [],
  };

  const experience: CareerStructuredExperience[] = toStringArray(profile.experience).map((line) => ({
    company: null,
    title: line,
    location: null,
    start_date: null,
    end_date: null,
    currently_working: false,
    bullets: [],
    technologies: [],
  }));

  const projects: CareerStructuredProject[] = toStringArray(profile.projects).map((line) => ({
    name: line,
    description: null,
    technologies: [],
    links: [],
    bullets: [],
  }));

  const education: CareerStructuredEducation[] = toStringArray(profile.education).map((line) => ({
    institution: line,
    degree: null,
    field_of_study: null,
    start_date: null,
    end_date: null,
    grade: null,
    location: null,
    description: null,
  }));

  const additional: CareerStructuredAdditional = {
    certifications: [],
    achievements: [],
    hackathons: [],
    leadership: [],
    volunteering: [],
    publications: [],
  };

  const diagnostics: CareerStructuredDiagnostics = {
    finalSource: profile.raw_sections?.__meta?.finalSource ?? null,
    llmStatus: profile.raw_sections?.__meta?.llmStatus ?? null,
    llmError: profile.raw_sections?.__meta?.llmError ?? null,
    llmRawPresent: profile.raw_sections?.__meta?.llmRawPresent ?? null,
    usedOcr: profile.raw_sections?.__meta?.usedOcr ?? false,
    extractionMethod: profile.raw_sections?.__meta?.extractionMethod ?? null,
    attemptedMethods: profile.raw_sections?.__meta?.attemptedMethods ?? [],
  };

  return {
    candidate,
    skills,
    experience,
    projects,
    education,
    additional,
    diagnostics,
    analysis: null,
  };
}

function mergeCandidate(
  base: CareerStructuredCandidate,
  candidate: CareerResumeManualOverrides['candidate'],
) {
  if (!candidate) return base;
  return {
    ...base,
    full_name: candidate.full_name ?? base.full_name,
    current_title: candidate.current_title ?? base.current_title,
    email: candidate.email ?? base.email,
    phone: candidate.phone ?? base.phone,
    location: candidate.location ?? base.location,
    linkedin: candidate.linkedin ?? base.linkedin,
    github: candidate.github ?? base.github,
    portfolio: candidate.portfolio ?? base.portfolio,
    summary: candidate.summary ?? base.summary,
  };
}

function mergeSkills(
  base: CareerStructuredSkills,
  skills: CareerResumeManualOverrides['skills'],
) {
  if (!skills) return base;
  return {
    languages: skills.languages ?? base.languages,
    frameworks: skills.frameworks ?? base.frameworks,
    tools: skills.tools ?? base.tools,
    databases: skills.databases ?? base.databases,
    cloud: skills.cloud ?? base.cloud,
    others: skills.others ?? base.others,
    spoken_languages: skills.spoken_languages ?? base.spoken_languages,
  };
}

function mergeAdditional(
  base: CareerStructuredAdditional,
  additional: CareerResumeManualOverrides['additional'],
) {
  if (!additional) return base;
  return {
    certifications: additional.certifications ?? base.certifications,
    achievements: additional.achievements ?? base.achievements,
    hackathons: additional.hackathons ?? base.hackathons,
    leadership: additional.leadership ?? base.leadership,
    volunteering: additional.volunteering ?? base.volunteering,
    publications: additional.publications ?? base.publications,
  };
}

export function getEffectiveStructuredProfile(
  profile: CareerResumeProfile | null,
): CareerStructuredProfile | null {
  const base = profile?.raw_sections?.__structured ?? buildFallbackStructuredProfile(profile);
  if (!base) return null;

  const manual = profile?.raw_sections?.__manual ?? null;
  if (!manual) {
    return {
      ...base,
      analysis: base.analysis ?? null,
    };
  }

  return {
    ...base,
    candidate: mergeCandidate(base.candidate, manual.candidate),
    skills: mergeSkills(base.skills, manual.skills),
    experience: manual.experience ?? base.experience,
    projects: manual.projects ?? base.projects,
    education: manual.education ?? base.education,
    additional: mergeAdditional(base.additional, manual.additional),
    analysis: base.analysis ?? null,
  };
}

export function buildResumeAtsAnalysis(args: {
  profile: CareerResumeProfile | null;
  effectiveProfile: CareerStructuredProfile | null;
  topMatches: CareerMatch[];
}): CareerResumeAtsAnalysis | null {
  const { profile, effectiveProfile, topMatches } = args;
  if (!profile || !effectiveProfile) return null;

  const candidate = effectiveProfile.candidate;
  const skills = effectiveProfile.skills;
  const extractionMeta = profile.raw_sections?.__meta;
  const confidenceScore =
    typeof extractionMeta?.extractionQuality?.confidenceScore === 'number'
      ? extractionMeta.extractionQuality.confidenceScore
      : typeof effectiveProfile.diagnostics?.confidence === 'number'
        ? effectiveProfile.diagnostics.confidence
        : 65;

  const contactFields = [
    candidate.full_name,
    candidate.email,
    candidate.phone,
    candidate.linkedin,
    candidate.github,
    candidate.portfolio,
    candidate.location,
  ];
  const contactCompleteness = clampScore((contactFields.filter(Boolean).length / contactFields.length) * 100);

  const sectionPresence = [
    Boolean(candidate.summary),
    effectiveProfile.experience.length > 0,
    effectiveProfile.projects.length > 0,
    effectiveProfile.education.length > 0,
    [
      ...skills.languages,
      ...skills.frameworks,
      ...skills.databases,
      ...skills.tools,
      ...skills.cloud,
      ...skills.others,
    ].length > 0,
  ];
  const sectionCompleteness = clampScore((sectionPresence.filter(Boolean).length / sectionPresence.length) * 100);

  const skillCount = [
    ...skills.languages,
    ...skills.frameworks,
    ...skills.databases,
    ...skills.tools,
    ...skills.cloud,
    ...skills.others,
  ].length;
  const skillsCoverage = clampScore(Math.min(100, skillCount * 8));

  const educationQuality = clampScore(
    effectiveProfile.education.length === 0
      ? 20
      : effectiveProfile.education.reduce((score, entry) => {
          let current = 20;
          if (entry.institution) current += 25;
          if (entry.degree) current += 25;
          if (entry.field_of_study) current += 15;
          if (entry.grade) current += 15;
          return score + current;
        }, 0) / effectiveProfile.education.length,
  );

  const experienceDepth = clampScore(
    effectiveProfile.experience.length === 0
      ? 15
      : effectiveProfile.experience.reduce((score, entry) => {
          let current = 20;
          if (entry.title) current += 20;
          if (entry.company) current += 20;
          if (entry.bullets.length > 0) current += Math.min(25, entry.bullets.length * 8);
          if (entry.technologies.length > 0) current += 15;
          return score + current;
        }, 0) / effectiveProfile.experience.length,
  );

  const projectsQuality = clampScore(
    effectiveProfile.projects.length === 0
      ? 15
      : effectiveProfile.projects.reduce((score, entry) => {
          let current = 20;
          if (entry.name) current += 25;
          if (entry.description) current += 20;
          if (entry.bullets.length > 0) current += Math.min(20, entry.bullets.length * 6);
          if (entry.technologies.length > 0) current += 15;
          return score + current;
        }, 0) / effectiveProfile.projects.length,
  );

  const parseConfidence = clampScore(confidenceScore);
  const overallScore = clampScore(
    sectionCompleteness * 0.2 +
      contactCompleteness * 0.15 +
      skillsCoverage * 0.2 +
      educationQuality * 0.1 +
      experienceDepth * 0.2 +
      projectsQuality * 0.1 +
      parseConfidence * 0.05,
  );

  const strengths: string[] = [];
  const warnings: string[] = [];
  const missingEssentials: string[] = [];
  const suggestedActions: CareerResumeAtsAnalysis['suggestedActions'] = [];

  if (contactCompleteness >= 80) {
    strengths.push('Contact details are mostly complete and ATS-readable.');
  } else {
    warnings.push('Contact information is incomplete for a strong ATS profile.');
    missingEssentials.push('Complete core contact fields such as name, email, phone, and location.');
    suggestedActions.push({
      title: 'Complete missing contact details',
      reason: 'Recruiters and match scoring depend on reliable candidate identity fields.',
      impact: 'must_fix',
    });
  }

  if (skillsCoverage >= 70) {
    strengths.push('Skills coverage is broad enough to support role matching.');
  } else {
    warnings.push('The resume does not show enough normalized skills yet.');
    suggestedActions.push({
      title: 'Add or review core skill categories',
      reason: 'Low skill coverage weakens ATS matching and job-fit scoring.',
      impact: 'high',
    });
  }

  if (experienceDepth >= 65) {
    strengths.push('Experience entries provide enough detail for ATS scoring.');
  } else {
    warnings.push('Experience entries need more structure or impact bullets.');
    suggestedActions.push({
      title: 'Strengthen experience bullets',
      reason: 'Roles, companies, and impact bullets improve both ATS scoring and recruiter trust.',
      impact: effectiveProfile.experience.length === 0 ? 'must_fix' : 'high',
    });
  }

  if (projectsQuality >= 60) {
    strengths.push('Projects add useful portfolio signal to the profile.');
  } else {
    warnings.push('Projects are weak or under-detailed.');
    suggestedActions.push({
      title: 'Expand project outcomes and tech stack',
      reason: 'Project descriptions and technologies improve match explainability.',
      impact: 'high',
    });
  }

  if (educationQuality < 55) {
    warnings.push('Education details are incomplete or weakly structured.');
    suggestedActions.push({
      title: 'Fill in degree, institution, and grade details',
      reason: 'Education completeness improves ATS completeness and trust.',
      impact: 'nice_to_have',
    });
  }

  if (!candidate.summary) {
    missingEssentials.push('Add a concise professional summary.');
    suggestedActions.push({
      title: 'Add a focused summary',
      reason: 'A summary improves recruiter context and title-fit scoring.',
      impact: 'nice_to_have',
    });
  }

  const topMatch = topMatches[0] ?? null;
  if (topMatch && topMatch.overall_score >= 70) {
    strengths.push(`Top current match is ${Math.round(topMatch.overall_score)}% fit.`);
  }

  return {
    overallScore,
    parseConfidence,
    sectionCompleteness,
    contactCompleteness,
    skillsCoverage,
    educationQuality,
    experienceDepth,
    projectsQuality,
    strengths,
    warnings,
    missingEssentials,
    suggestedActions,
  };
}

export function buildResumeVersionSummaries(args: {
  resumes: Array<{
    id: string;
    file_name: string;
    is_active: boolean;
    parse_status: string;
    uploaded_at: string;
    updated_at: string;
    profile?: { raw_sections?: { __meta?: { extractionQuality?: { confidenceTier?: 'high' | 'medium' | 'low' } } } } | null;
  }>;
  activeDetailAnalysis: CareerResumeAtsAnalysis | null;
}): CareerResumeVersionSummary[] {
  const { resumes, activeDetailAnalysis } = args;
  return resumes.map((resume) => ({
    id: resume.id,
    file_name: resume.file_name,
    is_active: resume.is_active,
    parse_status: resume.parse_status as CareerResumeVersionSummary['parse_status'],
    uploaded_at: resume.uploaded_at,
    updated_at: resume.updated_at,
    score: resume.is_active ? activeDetailAnalysis?.overallScore ?? null : null,
    confidenceTier: resume.profile?.raw_sections?.__meta?.extractionQuality?.confidenceTier ?? null,
  }));
}

export function buildCandidateManualOverridePayload(input: {
  full_name?: string;
  current_title?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  summary?: string;
}): CareerResumeManualOverrides {
  return {
    candidate: {
      full_name: toStringOrNull(input.full_name),
      current_title: toStringOrNull(input.current_title),
      email: toStringOrNull(input.email),
      phone: toStringOrNull(input.phone),
      location: toStringOrNull(input.location),
      linkedin: toStringOrNull(input.linkedin),
      github: toStringOrNull(input.github),
      portfolio: toStringOrNull(input.portfolio),
      summary: toStringOrNull(input.summary),
    },
    updated_at: new Date().toISOString(),
  };
}
