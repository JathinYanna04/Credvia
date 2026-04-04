import type {
  CareerMatch,
  CareerResumeAtsAnalysis,
  CareerResumeManualOverrides,
  CareerResumeProfile,
  CareerResumeVersionSummary,
  CareerStructuredAdditional,
  CareerStructuredCandidate,
  CareerStructuredDiagnostics,
  CareerStructuredProfile,
  CareerStructuredSkills,
  CareerWeightedScoreBreakdown,
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

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))];
}

function normalizeSkillBucket(value: unknown) {
  return unique(toStringArray(value));
}

function readUnknownArray(source: unknown, key: string) {
  if (!source || typeof source !== 'object') return [];
  return normalizeSkillBucket((source as Record<string, unknown>)[key]);
}

function buildFallbackStructuredProfile(profile: CareerResumeProfile | null): CareerStructuredProfile | null {
  if (!profile) return null;

  const diagnostics: CareerStructuredDiagnostics = {
    parserVersion: toStringOrNull(profile.raw_sections?.__meta?.parserVersion),
    schemaVersion: toStringOrNull(profile.raw_sections?.__meta?.schemaVersion),
    requestId: toStringOrNull(profile.raw_sections?.__meta?.requestId),
    finalSource: profile.raw_sections?.__meta?.finalSource ?? null,
    llmStatus: profile.raw_sections?.__meta?.llmStatus ?? null,
    llmError: profile.raw_sections?.__meta?.llmError ?? null,
    llmRawPresent: profile.raw_sections?.__meta?.llmRawPresent ?? null,
    confidence:
      typeof profile.raw_sections?.__meta?.extractionQuality?.confidenceScore === 'number'
        ? profile.raw_sections.__meta.extractionQuality.confidenceScore
        : null,
    usedOcr: profile.raw_sections?.__meta?.usedOcr ?? false,
    extractionMethod: profile.raw_sections?.__meta?.extractionMethod ?? null,
    methodUsed: profile.raw_sections?.__meta?.extractionMethod ?? null,
    attemptedMethods: profile.raw_sections?.__meta?.attemptedMethods ?? [],
    pageCount: profile.raw_sections?.__meta?.pageCount ?? null,
    pageSourceSummary: profile.raw_sections?.__meta?.pageSourceSummary ?? {},
    layoutReconstructionUsed: profile.raw_sections?.__meta?.layoutReconstructionUsed ?? false,
    ocrNeeded: profile.raw_sections?.__meta?.ocrNeeded ?? false,
    ocrStatus: profile.raw_sections?.__meta?.ocrStatus ?? null,
    ocrAttempted: profile.raw_sections?.__meta?.ocrAttempted ?? false,
    ocrImprovedQuality: profile.raw_sections?.__meta?.ocrImprovedQuality ?? null,
    extractionQualityScore:
      typeof profile.raw_sections?.__meta?.extractionQuality?.confidenceScore === 'number'
        ? profile.raw_sections.__meta.extractionQuality.confidenceScore
        : null,
    warnings: profile.raw_sections?.__meta?.warningMessage
      ? [profile.raw_sections.__meta.warningMessage]
      : [],
    nativeTextQuality:
      typeof profile.raw_sections?.__meta?.nativeTextQuality === 'object'
        ? profile.raw_sections.__meta.nativeTextQuality
        : undefined,
  };

  return {
    candidate: {
      full_name: profile.full_name,
      current_title: profile.current_title,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      linkedin: null,
      github: null,
      portfolio: null,
      summary: profile.summary,
    },
    skills: {
      languages: [],
      frameworks: [],
      libraries: [],
      tools: [],
      databases: [],
      cloud: [],
      ai_ml: [],
      devops: [],
      platforms: [],
      others: toStringArray(profile.raw_sections?.skills ?? []),
      spoken_languages: [],
    },
    experience: toStringArray(profile.experience).map((line) => ({
      company: null,
      title: line,
      location: null,
      start_date: null,
      end_date: null,
      currently_working: false,
      bullets: [],
      technologies: [],
    })),
    projects: toStringArray(profile.projects).map((line) => ({
      name: line,
      description: null,
      technologies: [],
      links: [],
      bullets: [],
    })),
    education: toStringArray(profile.education).map((line) => ({
      institution: line,
      degree: null,
      field_of_study: null,
      start_date: null,
      end_date: null,
      grade: null,
      location: null,
      description: null,
    })),
    additional: {
      certifications: [],
      achievements: [],
      hackathons: [],
      leadership: [],
      volunteering: [],
      publications: [],
      positions_of_responsibility: [],
      extracurricular: [],
    },
    provenance: {},
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
  const extra = skills as unknown as Record<string, unknown>;
  return {
    languages: skills.languages ?? base.languages,
    frameworks: skills.frameworks ?? base.frameworks,
    libraries: normalizeSkillBucket(extra.libraries).length > 0 ? normalizeSkillBucket(extra.libraries) : base.libraries,
    tools: skills.tools ?? base.tools,
    databases: skills.databases ?? base.databases,
    cloud: skills.cloud ?? base.cloud,
    ai_ml: normalizeSkillBucket(extra.ai_ml).length > 0 ? normalizeSkillBucket(extra.ai_ml) : base.ai_ml,
    devops: normalizeSkillBucket(extra.devops).length > 0 ? normalizeSkillBucket(extra.devops) : base.devops,
    platforms: normalizeSkillBucket(extra.platforms).length > 0 ? normalizeSkillBucket(extra.platforms) : base.platforms,
    others: skills.others ?? base.others,
    spoken_languages: skills.spoken_languages ?? base.spoken_languages,
  };
}

function mergeAdditional(
  base: CareerStructuredAdditional,
  additional: CareerResumeManualOverrides['additional'],
) {
  if (!additional) return base;
  const record = additional as unknown as Record<string, unknown>;
  return {
    certifications: additional.certifications ?? base.certifications,
    achievements: additional.achievements ?? base.achievements,
    hackathons: additional.hackathons ?? base.hackathons,
    leadership: additional.leadership ?? base.leadership,
    volunteering: additional.volunteering ?? base.volunteering,
    publications: additional.publications ?? base.publications,
    positions_of_responsibility:
      (record.positions_of_responsibility as string[] | undefined) ??
      base.positions_of_responsibility,
    extracurricular: (record.extracurricular as string[] | undefined) ?? base.extracurricular,
  };
}

export function getEffectiveStructuredProfile(
  profile: CareerResumeProfile | null,
): CareerStructuredProfile | null {
  const base = profile?.raw_sections?.__structured ?? buildFallbackStructuredProfile(profile);
  if (!base) return null;

  const normalizedBase: CareerStructuredProfile = {
    candidate: {
      full_name: base.candidate?.full_name ?? null,
      current_title: base.candidate?.current_title ?? null,
      email: base.candidate?.email ?? null,
      phone: base.candidate?.phone ?? null,
      location: base.candidate?.location ?? null,
      linkedin: base.candidate?.linkedin ?? null,
      github: base.candidate?.github ?? null,
      portfolio: base.candidate?.portfolio ?? null,
      summary: base.candidate?.summary ?? null,
    },
    skills: {
      languages: normalizeSkillBucket(base.skills?.languages),
      frameworks: normalizeSkillBucket(base.skills?.frameworks),
      libraries: readUnknownArray(base.skills, 'libraries'),
      tools: normalizeSkillBucket(base.skills?.tools),
      databases: normalizeSkillBucket(base.skills?.databases),
      cloud: normalizeSkillBucket(base.skills?.cloud),
      ai_ml: readUnknownArray(base.skills, 'ai_ml'),
      devops: readUnknownArray(base.skills, 'devops'),
      platforms: readUnknownArray(base.skills, 'platforms'),
      others: normalizeSkillBucket(base.skills?.others),
      spoken_languages: normalizeSkillBucket(base.skills?.spoken_languages),
    },
    experience: Array.isArray(base.experience) ? base.experience : [],
    projects: Array.isArray(base.projects) ? base.projects : [],
    education: Array.isArray(base.education) ? base.education : [],
    additional: {
      certifications: normalizeSkillBucket(base.additional?.certifications),
      achievements: normalizeSkillBucket(base.additional?.achievements),
      hackathons: normalizeSkillBucket(base.additional?.hackathons),
      leadership: normalizeSkillBucket(base.additional?.leadership),
      volunteering: normalizeSkillBucket(base.additional?.volunteering),
      publications: normalizeSkillBucket(base.additional?.publications),
      positions_of_responsibility: readUnknownArray(base.additional, 'positions_of_responsibility'),
      extracurricular: readUnknownArray(base.additional, 'extracurricular'),
    },
    provenance:
      typeof base.provenance === 'object' && base.provenance !== null ? base.provenance : {},
    diagnostics: base.diagnostics ?? undefined,
    analysis: base.analysis ?? null,
  };

  const manual = profile?.raw_sections?.__manual ?? null;
  if (!manual) {
    return normalizedBase;
  }

  const next = {
    ...normalizedBase,
    candidate: mergeCandidate(normalizedBase.candidate, manual.candidate),
    skills: mergeSkills(normalizedBase.skills, manual.skills),
    experience: manual.experience ?? normalizedBase.experience,
    projects: manual.projects ?? normalizedBase.projects,
    education: manual.education ?? normalizedBase.education,
    additional: mergeAdditional(normalizedBase.additional, manual.additional),
  };

  next.provenance = {
    ...(next.provenance ?? {}),
    ...(manual.candidate
      ? Object.fromEntries(
          Object.keys(manual.candidate).map((key) => [
            `candidate.${key}`,
            { source: 'user_override', confidence: 1, path: `candidate.${key}` },
          ]),
        )
      : {}),
  };

  return next;
}

function flattenAllSkills(skills: CareerStructuredSkills) {
  return unique([
    ...skills.languages,
    ...skills.frameworks,
    ...skills.libraries,
    ...skills.tools,
    ...skills.databases,
    ...skills.cloud,
    ...skills.ai_ml,
    ...skills.devops,
    ...skills.platforms,
    ...skills.others,
  ]);
}

function computeImpactScore(lines: string[]) {
  const actionVerbs = /\b(built|designed|implemented|launched|improved|reduced|optimized|automated|created|delivered|scaled|led|owned)\b/i;
  const weakVerbs = /\b(worked on|helped|assisted|involved in|participated in)\b/i;
  const metricHint = /\b\d+%|\b\d+x\b|\b\d+\s*(users|ms|seconds|minutes|hours|days|records|requests|projects)\b/i;

  if (lines.length === 0) {
    return 20;
  }

  const scored = lines.map((line) => {
    let score = 35;
    if (actionVerbs.test(line)) score += 25;
    if (metricHint.test(line)) score += 20;
    if (line.length >= 70) score += 10;
    if (weakVerbs.test(line)) score -= 20;
    return clampScore(score);
  });

  return clampScore(scored.reduce((sum, value) => sum + value, 0) / scored.length);
}

function computeExperienceEvidenceScore(profile: CareerStructuredProfile) {
  const experienceEntries = profile.experience.length;
  const projectEntries = profile.projects.length;

  const experienceScore =
    experienceEntries === 0
      ? 0
      : clampScore(
          profile.experience.reduce((sum, entry) => {
            let score = 30;
            if (entry.title) score += 15;
            if (entry.company) score += 15;
            if (entry.bullets.length > 0) score += Math.min(20, entry.bullets.length * 5);
            if (entry.technologies.length > 0) score += 20;
            return sum + score;
          }, 0) / experienceEntries,
        );

  const projectScore =
    projectEntries === 0
      ? 0
      : clampScore(
          profile.projects.reduce((sum, entry) => {
            let score = 30;
            if (entry.name) score += 15;
            if (entry.description) score += 15;
            if (entry.bullets.length > 0) score += Math.min(20, entry.bullets.length * 5);
            if (entry.technologies.length > 0) score += 20;
            return sum + score;
          }, 0) / projectEntries,
        );

  if (experienceEntries === 0) {
    return clampScore(projectScore);
  }

  if (projectEntries === 0) {
    return clampScore(experienceScore);
  }

  return clampScore(experienceScore * 0.6 + projectScore * 0.4);
}

function computeFormattingScore(profile: CareerStructuredProfile, extractionMeta: CareerResumeProfile['raw_sections']['__meta']) {
  let score = 70;
  if (profile.experience.length > 0) score += 5;
  if (profile.projects.length > 0) score += 5;
  if (profile.education.length > 0) score += 5;
  if (flattenAllSkills(profile.skills).length > 0) score += 5;
  if (extractionMeta?.contaminationScore && extractionMeta.contaminationScore > 35) score -= 15;
  if (extractionMeta?.ocrStatus === 'attempted_no_gain') score -= 10;
  return clampScore(score);
}

function buildWeightedBreakdown(items: Array<Omit<CareerWeightedScoreBreakdown, 'weightedScore'>>) {
  return items.map((item) => ({
    ...item,
    weightedScore: Math.round(item.score * item.weight * 100) / 100,
  }));
}

function computeTargetAlignment(_profile: CareerStructuredProfile, topMatches: CareerMatch[]) {
  const topMatch = topMatches[0] ?? null;
  if (!topMatch) {
    return {
      score: 0,
      missingKeywords: [] as string[],
      strengths: [] as string[],
      risks: ['No target job context is available yet.'],
    };
  }

  const matchedSkills = Array.isArray(topMatch.matched_skills) ? topMatch.matched_skills : [];
  const missingSkills = Array.isArray(topMatch.missing_skills) ? topMatch.missing_skills : [];
  const score = clampScore(topMatch.overall_score);

  return {
    score,
    missingKeywords: missingSkills.slice(0, 8),
    strengths:
      matchedSkills.length > 0
        ? [`Top match currently aligns on ${matchedSkills.slice(0, 5).join(', ')}.`]
        : [],
    risks:
      missingSkills.length > 0
        ? [`Largest current gaps: ${missingSkills.slice(0, 5).join(', ')}.`]
        : [],
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
  const allSkills = flattenAllSkills(skills);
  const contactFields = [
    candidate.full_name,
    candidate.email,
    candidate.phone,
    candidate.location,
    candidate.linkedin,
    candidate.github,
    candidate.portfolio,
  ];

  const extractionReliability = clampScore(
    (typeof extractionMeta?.extractionQuality?.confidenceScore === 'number'
      ? extractionMeta.extractionQuality.confidenceScore
      : typeof effectiveProfile.diagnostics?.confidence === 'number'
        ? effectiveProfile.diagnostics.confidence
        : 55) +
      (effectiveProfile.diagnostics?.finalSource === 'merged' ? 12 : 0) +
      (effectiveProfile.diagnostics?.llmStatus === 'success' ? 6 : 0) -
      (effectiveProfile.diagnostics?.ocrStatus === 'attempted_no_gain' ? 8 : 0),
  );
  const contactCompleteness = clampScore((contactFields.filter(Boolean).length / contactFields.length) * 100);
  const sectionCompleteness = clampScore(
    [
      candidate.summary,
      effectiveProfile.experience.length > 0,
      effectiveProfile.projects.length > 0,
      effectiveProfile.education.length > 0,
      allSkills.length > 0,
    ].filter(Boolean).length * 20,
  );
  const skillsCoverage = clampScore(
    Math.min(
      100,
      allSkills.length * 7 +
        unique(
          Object.keys(skills).filter(
            (bucket) => readUnknownArray(skills as unknown as Record<string, unknown>, bucket).length > 0,
          ),
        ).length * 5,
    ),
  );
  const educationQuality = clampScore(
    effectiveProfile.education.length === 0
      ? 25
      : effectiveProfile.education.reduce((sum, entry) => {
          let score = 25;
          if (entry.institution) score += 20;
          if (entry.degree) score += 20;
          if (entry.field_of_study) score += 10;
          if (entry.grade) score += 10;
          if (entry.start_date || entry.end_date) score += 15;
          return sum + score;
        }, 0) / effectiveProfile.education.length,
  );
  const experienceDepth = computeExperienceEvidenceScore(effectiveProfile);
  const impactLanguage = clampScore(
    computeImpactScore(effectiveProfile.experience.flatMap((entry) => entry.bullets)) * 0.55 +
      computeImpactScore(effectiveProfile.projects.flatMap((entry) => entry.bullets)) * 0.45,
  );
  const formattingReadiness = computeFormattingScore(effectiveProfile, extractionMeta);
  const targetAlignment = computeTargetAlignment(effectiveProfile, topMatches);

  const hasTarget = topMatches.length > 0;
  const breakdown = buildWeightedBreakdown(
    hasTarget
      ? [
          {
            key: 'extraction_reliability',
            label: 'Extraction reliability',
            score: extractionReliability,
            weight: 0.15,
            rationale: 'Rewards merged, high-confidence extraction and penalizes unstable OCR fallbacks.',
          },
          {
            key: 'contact_completeness',
            label: 'Candidate details',
            score: contactCompleteness,
            weight: 0.1,
            rationale: 'Strong ATS profiles need reliable contact and identity fields.',
          },
          {
            key: 'skills_coverage',
            label: 'Skills coverage',
            score: skillsCoverage,
            weight: 0.15,
            rationale: 'Measures normalized skill breadth, categorization, and de-duplication.',
          },
          {
            key: 'education_completeness',
            label: 'Education completeness',
            score: educationQuality,
            weight: 0.1,
            rationale: 'Rewards complete institution, degree, field, and timeline details.',
          },
          {
            key: 'evidence_quality',
            label: 'Experience and project evidence',
            score: experienceDepth,
            weight: 0.2,
            rationale: 'Projects get real credit for students and freshers when work experience is sparse.',
          },
          {
            key: 'impact_language',
            label: 'Impact language',
            score: impactLanguage,
            weight: 0.1,
            rationale: 'Looks for action-oriented, specific, evidence-backed bullets over vague phrasing.',
          },
          {
            key: 'formatting_readiness',
            label: 'ATS formatting readiness',
            score: formattingReadiness,
            weight: 0.1,
            rationale: 'Penalizes noisy or structurally weak resumes while avoiding layout-based over-penalties.',
          },
          {
            key: 'job_target_alignment',
            label: 'Job target alignment',
            score: targetAlignment.score,
            weight: 0.1,
            rationale: 'Uses current job-match evidence to reflect role targeting when job context exists.',
          },
        ]
      : [
          {
            key: 'extraction_reliability',
            label: 'Extraction reliability',
            score: extractionReliability,
            weight: 0.17,
            rationale: 'Rewards merged, high-confidence extraction and penalizes unstable OCR fallbacks.',
          },
          {
            key: 'contact_completeness',
            label: 'Candidate details',
            score: contactCompleteness,
            weight: 0.11,
            rationale: 'Strong ATS profiles need reliable contact and identity fields.',
          },
          {
            key: 'skills_coverage',
            label: 'Skills coverage',
            score: skillsCoverage,
            weight: 0.17,
            rationale: 'Measures normalized skill breadth, categorization, and de-duplication.',
          },
          {
            key: 'education_completeness',
            label: 'Education completeness',
            score: educationQuality,
            weight: 0.11,
            rationale: 'Rewards complete institution, degree, field, and timeline details.',
          },
          {
            key: 'evidence_quality',
            label: 'Experience and project evidence',
            score: experienceDepth,
            weight: 0.22,
            rationale: 'Projects get real credit for students and freshers when work experience is sparse.',
          },
          {
            key: 'impact_language',
            label: 'Impact language',
            score: impactLanguage,
            weight: 0.11,
            rationale: 'Looks for action-oriented, specific, evidence-backed bullets over vague phrasing.',
          },
          {
            key: 'formatting_readiness',
            label: 'ATS formatting readiness',
            score: formattingReadiness,
            weight: 0.11,
            rationale: 'Penalizes noisy or structurally weak resumes while avoiding layout-based over-penalties.',
          },
        ],
  );

  const overallScore = clampScore(
    breakdown.reduce((sum, item) => sum + item.score * item.weight, 0),
  );

  const strengths = unique([
    ...(effectiveProfile.diagnostics?.finalSource === 'merged'
      ? ['Final profile is using merged deterministic plus LLM extraction.']
      : []),
    ...(contactCompleteness >= 70 ? ['Core contact details are mostly complete and ATS-readable.'] : []),
    ...(skillsCoverage >= 65 ? ['Normalized skills coverage is strong enough to support role matching.'] : []),
    ...(experienceDepth >= 65
      ? ['Projects and experience provide concrete supporting evidence.']
      : []),
    ...targetAlignment.strengths,
  ]);

  const warnings = unique([
    ...(effectiveProfile.diagnostics?.llmStatus && effectiveProfile.diagnostics.llmStatus !== 'success'
      ? [`LLM refinement ${effectiveProfile.diagnostics.llmStatus}, so deterministic fallback is carrying more of the profile.`]
      : []),
    ...(effectiveProfile.experience.length === 0
      ? ['Experience section not found. Project evidence is carrying more of the score.']
      : []),
    ...(effectiveProfile.projects.length === 0
      ? ['Projects section is missing or thin, which reduces evidence-based scoring.']
      : []),
    ...(effectiveProfile.diagnostics?.ocrStatus === 'attempted_no_gain'
      ? ['OCR was attempted but did not improve extraction quality.']
      : []),
    ...targetAlignment.risks,
  ]);

  const missingEssentials = unique([
    ...(!candidate.full_name ? ['Full name'] : []),
    ...(!candidate.email ? ['Email'] : []),
    ...(!candidate.phone ? ['Phone'] : []),
    ...(allSkills.length === 0 ? ['Normalized skills'] : []),
    ...(effectiveProfile.education.length === 0 ? ['Education details'] : []),
  ]);

  const suggestedActions = unique([
    ...(!candidate.linkedin && !candidate.github && !candidate.portfolio ? ['Add one professional link such as LinkedIn, GitHub, or portfolio.'] : []),
    ...(impactLanguage < 60 ? ['Rewrite weak bullets with action, implementation detail, and outcomes.'] : []),
    ...(targetAlignment.missingKeywords.length > 0
      ? [`Add evidence for role-target keywords such as ${targetAlignment.missingKeywords.slice(0, 4).join(', ')}.`]
      : []),
  ]).map((title) => ({
    title,
    reason: title,
    impact: title.includes('Rewrite weak bullets') || title.includes('Add evidence')
      ? 'high'
      : 'nice_to_have',
  })) as CareerResumeAtsAnalysis['suggestedActions'];

  return {
    overallScore,
    mode: hasTarget ? 'targeted' : 'general',
    parseConfidence: extractionReliability,
    sectionCompleteness,
    contactCompleteness,
    skillsCoverage,
    educationQuality,
    experienceDepth,
    projectsQuality: clampScore(computeExperienceEvidenceScore({
      ...effectiveProfile,
      experience: [],
    })),
    strengths,
    warnings,
    missingEssentials,
    missingKeywords: targetAlignment.missingKeywords,
    confidenceLabel:
      overallScore >= 80 ? 'high' : overallScore >= 60 ? 'medium' : 'low',
    summary:
      hasTarget
        ? 'ATS score blends extraction reliability, completeness, evidence quality, and current job-target alignment.'
        : 'ATS score reflects extraction reliability, completeness, evidence quality, and ATS-friendly structure.',
    subScores: breakdown,
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
