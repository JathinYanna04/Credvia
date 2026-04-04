import Link from 'next/link';
import type { CareerResumeDetail } from '@/components/career-match/types';
import { describeAnalysisMethod, formatDateTime } from '@/components/career-match/utils';
import { Badge } from '@/components/ui/badge';

export interface ParsedResumeInsightsProps {
  detail: CareerResumeDetail;
  variant?: 'main' | 'sidebar';
}

export function ParsedResumeInsights({ detail, variant = 'main' }: ParsedResumeInsightsProps) {
  const profile = detail.profile;
  const skills = detail.skills;
  const structured = detail.effectiveProfile;
  const structuredCandidate = structured?.candidate;
  const structuredSkills = structured?.skills;
  const structuredExperience = structured?.experience ?? [];
  const structuredProjects = structured?.projects ?? [];
  const structuredEducation = structured?.education ?? [];
  const structuredAdditional = structured?.additional;
  const structuredDiagnostics = structured?.diagnostics;
  const extractionMeta = profile?.raw_sections?.__meta;
  const latestRun = detail.analysisRuns[0] ?? null;
  const showStaleParsedBanner = Boolean(profile && latestRun?.status === 'failed');
  const finalSource = structuredDiagnostics?.finalSource ?? extractionMeta?.finalSource ?? null;
  const acceptedWithWarnings =
    extractionMeta?.acceptedWithWarnings === true ||
    extractionMeta?.warningCode != null ||
    extractionMeta?.extractionQuality?.confidenceTier === 'low';
  const contaminationScore =
    extractionMeta?.extractionQuality?.contaminationScore ??
    (typeof extractionMeta?.contaminationScore === 'number'
      ? extractionMeta.contaminationScore
      : null);
  const salvageScore =
    extractionMeta?.extractionQuality?.salvageScore ??
    (typeof extractionMeta?.salvageScore === 'number' ? extractionMeta.salvageScore : null);
  const recoveredFromNoise =
    acceptedWithWarnings && typeof contaminationScore === 'number' && contaminationScore >= 70;
  const pdfInternalHint = /xref|flatedecode|objstm|endstream|startxref|endobj|\/(Type|Length|Filter|DecodeParms|Root|Info|Pages|Catalog|Page|Font|Contents|MediaBox|Resources)/i;

  const sanitizeDisplayValue = (value: string | null | undefined) => {
    if (!value) return null;
    const cleaned = value
      .replace(/[\u00BD\u00D3\u00AF\u0087\u0011]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\[\(\-]+/g, '')
      .trim();
    return cleaned || null;
  };

  const isNoiseLine = (line: string | null | undefined) => {
    if (!line) return true;
    if (!pdfInternalHint.test(line)) return false;
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length < 6) return false;
    const alphaWords = line.match(/\b[A-Za-z]{2,}\b/g) ?? [];
    const slashHits = line.match(/\/[A-Za-z]/g)?.length ?? 0;
    const internalHits =
      (line.match(/\b(xref|obj|stream|endstream|startxref|flatedecode)\b/gi)?.length ?? 0) +
      slashHits;
    const internalRatio = internalHits / tokens.length;
    const alphaRatio = alphaWords.length / tokens.length;
    return internalRatio >= 0.35 || (slashHits >= 4 && alphaWords.length < 4) || alphaRatio < 0.25;
  };

  const sanitizeLines = (items: string[]) =>
    items
      .map((item) => sanitizeDisplayValue(item))
      .filter((item): item is string => Boolean(item))
      .filter((item) => !isNoiseLine(item));
  const normalizeStructuredSkillList = (items?: Array<string | null>) =>
    (items ?? [])
      .map((item) => sanitizeDisplayValue(item ?? null))
      .filter((item): item is string => Boolean(item));
  const summaryText = sanitizeDisplayValue(structuredCandidate?.summary ?? profile?.summary ?? null);
  const sanitizedSummary = summaryText && !isNoiseLine(summaryText) ? summaryText : null;
  const sanitizedExperience = profile ? sanitizeLines(profile.experience) : [];
  const sanitizedProjects = profile ? sanitizeLines(profile.projects) : [];
  const sanitizedEducation = profile ? sanitizeLines(profile.education) : [];
  const sanitizedTitle = sanitizeDisplayValue(
    structuredCandidate?.current_title ?? profile?.current_title ?? null,
  );
  const sanitizedLocation = sanitizeDisplayValue(
    structuredCandidate?.location ?? profile?.location ?? null,
  );
  const sanitizedName = sanitizeDisplayValue(
    structuredCandidate?.full_name ?? profile?.full_name ?? null,
  );
  const sanitizedEmail = sanitizeDisplayValue(
    structuredCandidate?.email ?? profile?.email ?? null,
  );
  const sanitizedPhone = sanitizeDisplayValue(
    structuredCandidate?.phone ?? profile?.phone ?? null,
  );
  const sanitizedLinkedIn = sanitizeDisplayValue(structuredCandidate?.linkedin ?? null);
  const sanitizedGithub = sanitizeDisplayValue(structuredCandidate?.github ?? null);
  const sanitizedPortfolio = sanitizeDisplayValue(structuredCandidate?.portfolio ?? null);
  const hasStructuredContent =
    Boolean(sanitizedSummary) ||
    structuredExperience.length > 0 ||
    structuredProjects.length > 0 ||
    structuredEducation.length > 0 ||
    sanitizedExperience.length > 0 ||
    sanitizedProjects.length > 0 ||
    sanitizedEducation.length > 0;
  const finalSourceLabel =
    finalSource === 'merged'
      ? 'Merged'
      : finalSource === 'ocr_fallback'
        ? 'OCR fallback'
        : finalSource === 'deterministic_only'
          ? 'Deterministic only'
          : null;

  const parserMethodLabel = describeAnalysisMethod(latestRun?.parser_version);
  const parsedAtLabel = profile?.parsed_at ? formatDateTime(profile.parsed_at) : null;
  const usedOcr = structuredDiagnostics?.usedOcr ?? extractionMeta?.usedOcr;
  const confidenceTier = extractionMeta?.extractionQuality?.confidenceTier ?? null;
  const provenanceEntries = Object.entries(structured?.provenance ?? {}).slice(0, 8);

  const metaBadges = [
    finalSourceLabel ? { label: finalSourceLabel, variant: 'secondary' as const } : null,
    (structuredDiagnostics?.llmStatus ?? extractionMeta?.llmStatus) === 'success'
      ? { label: 'AI parsed', variant: 'accent' as const }
      : null,
    usedOcr !== undefined
      ? usedOcr
        ? { label: 'OCR used', variant: 'warning' as const }
        : { label: 'OCR not needed', variant: 'secondary' as const }
      : null,
    confidenceTier ? { label: `Confidence ${confidenceTier}`, variant: 'secondary' as const } : null,
  ].filter(Boolean) as Array<{ label: string; variant: 'accent' | 'secondary' | 'warning' }>;

  const skillSource = profile?.raw_sections?.skills ?? [];
  const fallbackSkillSource = skills.map((entry) => entry.skill.name);
  const rawSkillValues = (skillSource.length > 0 ? skillSource : fallbackSkillSource)
    .map((skill) => sanitizeDisplayValue(skill))
    .filter((value): value is string => Boolean(value));

  const skillBuckets = {
    languages: [] as string[],
    frameworks: [] as string[],
    databases: [] as string[],
    tools: [] as string[],
    cloud: [] as string[],
    others: [] as string[],
    spoken: [] as string[],
  };
  const pushUnique = (bucket: string[], value: string) => {
    if (!bucket.includes(value)) {
      bucket.push(value);
    }
  };
  const structuredSkillValues = structuredSkills
    ? {
        languages: normalizeStructuredSkillList(structuredSkills.languages),
        frameworks: normalizeStructuredSkillList(structuredSkills.frameworks),
        databases: normalizeStructuredSkillList(structuredSkills.databases),
        tools: normalizeStructuredSkillList(structuredSkills.tools),
        cloud: normalizeStructuredSkillList(structuredSkills.cloud),
        others: normalizeStructuredSkillList(structuredSkills.others),
        spoken: normalizeStructuredSkillList(structuredSkills.spoken_languages),
      }
    : null;
  const hasStructuredSkills =
    structuredSkillValues &&
    Object.values(structuredSkillValues).some((bucket) => bucket.length > 0);
  const spokenLanguages = new Set([
    'english',
    'hindi',
    'telugu',
    'tamil',
    'kannada',
    'malayalam',
    'spanish',
    'french',
    'german',
    'mandarin',
    'japanese',
    'korean',
  ]);
  const languageSkills = new Set([
    'java',
    'python',
    'c',
    'c++',
    'c#',
    'javascript',
    'typescript',
    'sql',
    'go',
    'rust',
    'kotlin',
    'swift',
    'php',
    'ruby',
    'r',
    'scala',
    'dart',
  ]);
  const frameworkSkills = new Set([
    'react',
    'node.js',
    'node',
    'fastapi',
    'javalin',
    'django',
    'flask',
    'spring',
    'next.js',
    'express',
    'nestjs',
  ]);
  const databaseSkills = new Set([
    'postgresql',
    'mysql',
    'sqlite',
    'mongodb',
    'supabase',
    'redis',
    'jdbc',
  ]);
  const toolSkills = new Set([
    'git',
    'linux',
    'kali linux',
    'docker',
    'kubernetes',
    'opencv',
    'yolo',
    'pypdf',
    'power bi',
  ]);
  const cloudSkills = new Set([
    'aws',
    'gcp',
    'azure',
    'firebase',
    'vercel',
    'render',
  ]);

  if (structuredSkillValues && hasStructuredSkills) {
    skillBuckets.languages = structuredSkillValues.languages;
    skillBuckets.frameworks = structuredSkillValues.frameworks;
    skillBuckets.databases = structuredSkillValues.databases;
    skillBuckets.tools = structuredSkillValues.tools;
    skillBuckets.cloud = structuredSkillValues.cloud;
    skillBuckets.others = structuredSkillValues.others;
    skillBuckets.spoken = structuredSkillValues.spoken;
  } else {
    rawSkillValues.forEach((skill) => {
      const normalized = skill.toLowerCase();
      if (spokenLanguages.has(normalized)) {
        pushUnique(skillBuckets.spoken, skill);
        return;
      }
      if (languageSkills.has(normalized)) {
        pushUnique(skillBuckets.languages, skill);
        return;
      }
      if (frameworkSkills.has(normalized)) {
        pushUnique(skillBuckets.frameworks, skill);
        return;
      }
      if (databaseSkills.has(normalized) || normalized.includes('sql')) {
        pushUnique(skillBuckets.databases, skill);
        return;
      }
      if (cloudSkills.has(normalized)) {
        pushUnique(skillBuckets.cloud, skill);
        return;
      }
      if (toolSkills.has(normalized)) {
        pushUnique(skillBuckets.tools, skill);
        return;
      }
      pushUnique(skillBuckets.others, skill);
    });
  }

  const parseLineWithDates = (line: string) => {
    const dateMatch = line.match(/\(([^)]+)\)/);
    const dates = dateMatch ? dateMatch[1] : null;
    const base = dateMatch ? line.replace(dateMatch[0], '').trim() : line;
    return { base, dates };
  };

  const formatStructuredDateRange = (
    startDate: string | null | undefined,
    endDate: string | null | undefined,
    currentlyWorking?: boolean,
  ) => {
    const sanitizedStart = sanitizeDisplayValue(startDate ?? null);
    const sanitizedEnd = sanitizeDisplayValue(endDate ?? null);
    if (currentlyWorking && sanitizedStart) {
      return `${sanitizedStart} - Present`;
    }
    if (sanitizedStart && sanitizedEnd) return `${sanitizedStart} - ${sanitizedEnd}`;
    return sanitizedStart ?? sanitizedEnd ?? null;
  };

  const parseExperienceLine = (line: string) => {
    const { base, dates } = parseLineWithDates(line);
    const atSplit = base.split(' at ');
    if (atSplit.length === 2) {
      return { title: atSplit[0], company: atSplit[1], dates };
    }
    const dashSplit = base.split(' - ');
    if (dashSplit.length === 2) {
      return { title: dashSplit[0], company: dashSplit[1], dates };
    }
    return { title: base, company: null, dates };
  };

  const parseProjectLine = (line: string) => {
    const { base } = parseLineWithDates(line);
    const dashSplit = base.split(' - ');
    if (dashSplit.length === 2) {
      return { name: dashSplit[0], description: dashSplit[1] };
    }
    return { name: base, description: null };
  };

  const structuredExperienceEntries = structuredExperience
    .map((entry) => ({
      title: sanitizeDisplayValue(entry.title ?? null),
      company: sanitizeDisplayValue(entry.company ?? null),
      location: sanitizeDisplayValue(entry.location ?? null),
      dates: formatStructuredDateRange(entry.start_date, entry.end_date, entry.currently_working),
      bullets: sanitizeLines(entry.bullets ?? []),
      technologies: sanitizeLines(entry.technologies ?? []),
    }))
    .filter((entry) => entry.title || entry.company || entry.bullets.length > 0);

  const fallbackExperienceEntries = sanitizedExperience.map((line) => ({
    ...parseExperienceLine(line),
    location: null as string | null,
    bullets: [] as string[],
    technologies: [] as string[],
  }));
  const experienceEntries =
    structuredExperienceEntries.length > 0 ? structuredExperienceEntries : fallbackExperienceEntries;

  const structuredProjectEntries = structuredProjects
    .map((entry) => ({
      name: sanitizeDisplayValue(entry.name ?? null),
      description: sanitizeDisplayValue(entry.description ?? null),
      technologies: sanitizeLines(entry.technologies ?? []),
      links: sanitizeLines(entry.links ?? []),
      bullets: sanitizeLines(entry.bullets ?? []),
    }))
    .filter((entry) => entry.name || entry.description || entry.bullets.length > 0);

  const fallbackProjectEntries = sanitizedProjects.map((line) => ({
    ...parseProjectLine(line),
    technologies: [] as string[],
    links: [] as string[],
    bullets: [] as string[],
  }));
  const projectEntries =
    structuredProjectEntries.length > 0 ? structuredProjectEntries : fallbackProjectEntries;

  const structuredEducationEntries = structuredEducation
    .map((entry) => ({
      degree: sanitizeDisplayValue(entry.degree ?? null),
      institution: sanitizeDisplayValue(entry.institution ?? null),
      fieldOfStudy: sanitizeDisplayValue(entry.field_of_study ?? null),
      grade: sanitizeDisplayValue(entry.grade ?? null),
      description: sanitizeDisplayValue(entry.description ?? null),
      dates: formatStructuredDateRange(entry.start_date, entry.end_date),
    }))
    .filter((entry) => entry.degree || entry.institution || entry.description);

  const fallbackEducationEntries = sanitizedEducation.map((line) => {
    const { base, dates } = parseLineWithDates(line);
    const dashSplit = base.split(' - ');
    return {
      degree: dashSplit[0] ?? base,
      institution: dashSplit[1] ?? null,
      fieldOfStudy: null,
      grade: null,
      description: null,
      dates,
    };
  });

  const educationEntries =
    structuredEducationEntries.length > 0 ? structuredEducationEntries : fallbackEducationEntries;

  const skillGroups = [
    { label: 'Programming languages', items: skillBuckets.languages },
    { label: 'Frameworks and libraries', items: skillBuckets.frameworks },
    { label: 'Databases', items: skillBuckets.databases },
    { label: 'Tools', items: skillBuckets.tools },
    { label: 'Cloud and DevOps', items: skillBuckets.cloud },
    { label: 'Core concepts', items: skillBuckets.others },
  ];

  const otherLines = profile ? sanitizeLines(profile.raw_sections?.other ?? []) : [];
  const findLinkLine = (pattern: RegExp) => otherLines.find((line) => pattern.test(line));
  const linkedInLine = sanitizedLinkedIn ?? findLinkLine(/linkedin/i);
  const githubLine = sanitizedGithub ?? findLinkLine(/github/i);
  const portfolioLine = sanitizedPortfolio ?? findLinkLine(/portfolio|website|site|http/i);
  const highlightBuckets = {
    certifications: [] as string[],
    achievements: [] as string[],
    leadership: [] as string[],
    competitions: [] as string[],
  };

  const hasStructuredAdditional =
    structuredAdditional &&
    Object.values(structuredAdditional).some((bucket) => (bucket ?? []).length > 0);

  if (structuredAdditional && hasStructuredAdditional) {
    highlightBuckets.certifications = normalizeStructuredSkillList(structuredAdditional.certifications);
    highlightBuckets.achievements = normalizeStructuredSkillList(structuredAdditional.achievements);
    highlightBuckets.leadership = normalizeStructuredSkillList(structuredAdditional.leadership);
    highlightBuckets.competitions = normalizeStructuredSkillList(structuredAdditional.hackathons);
  } else {
    otherLines.forEach((line) => {
      const normalized = line.toLowerCase();
      if (/certified|certification|specialization|certificate|associate/.test(normalized)) {
        highlightBuckets.certifications.push(line);
        return;
      }
      if (/hackathon|competition|contest|challenge/.test(normalized)) {
        highlightBuckets.competitions.push(line);
        return;
      }
      if (/volunteer|member|leader|lead|chair|coordinator|responsibility/.test(normalized)) {
        highlightBuckets.leadership.push(line);
        return;
      }
      highlightBuckets.achievements.push(line);
    });
  }

  const insightItems = [
    experienceEntries.length > 0 ? 'Experience entries detected' : null,
    educationEntries.length > 0 ? 'Education history detected' : null,
    skillBuckets.languages.length > 0 || skillBuckets.frameworks.length > 0
      ? 'Technical stack identified'
      : null,
    highlightBuckets.leadership.length > 0 ? 'Leadership signals present' : null,
    highlightBuckets.certifications.length > 0 ? 'Certifications detected' : null,
  ].filter(Boolean) as string[];

  if (variant === 'sidebar') {
    return (
      <aside className="space-y-6">
        <article className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Skill breakdown</div>
          <div className="mt-4 space-y-3">
            {skillGroups.map((group) =>
              group.items.length > 0 ? (
                <div key={group.label}>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-text-tertiary">{group.label}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-text-secondary">
                    {group.items.map((item) => (
                      <span key={`${group.label}-${item}`} className="rounded-full border border-border-subtle px-2.5 py-1">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null,
            )}
            {skillBuckets.spoken.length > 0 ? (
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-text-tertiary">Spoken languages</div>
                <div className="mt-2 flex flex-wrap gap-2 text-sm text-text-secondary">
                  {skillBuckets.spoken.map((item) => (
                    <span key={`spoken-${item}`} className="rounded-full border border-border-subtle px-2.5 py-1">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </article>

        <article className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Certifications and extras</div>
          <div className="mt-4 space-y-3 text-sm text-text-secondary">
            {highlightBuckets.certifications.length > 0 ? (
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-text-tertiary">Certifications</div>
                <ul className="mt-2 space-y-1">
                  {highlightBuckets.certifications.slice(0, 5).map((item) => (
                    <li key={`cert-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {highlightBuckets.achievements.length > 0 ? (
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-text-tertiary">Achievements</div>
                <ul className="mt-2 space-y-1">
                  {highlightBuckets.achievements.slice(0, 5).map((item) => (
                    <li key={`ach-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {highlightBuckets.competitions.length > 0 ? (
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-text-tertiary">Hackathons and competitions</div>
                <ul className="mt-2 space-y-1">
                  {highlightBuckets.competitions.slice(0, 5).map((item) => (
                    <li key={`comp-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {highlightBuckets.leadership.length > 0 ? (
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-text-tertiary">Leadership</div>
                <ul className="mt-2 space-y-1">
                  {highlightBuckets.leadership.slice(0, 5).map((item) => (
                    <li key={`lead-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {highlightBuckets.certifications.length === 0 &&
            highlightBuckets.achievements.length === 0 &&
            highlightBuckets.competitions.length === 0 &&
            highlightBuckets.leadership.length === 0 ? (
              <p>No extra qualifications detected yet.</p>
            ) : null}
          </div>
        </article>

        <article className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Diagnostics</div>
          <div className="mt-3 space-y-2 text-xs text-text-tertiary">
            {parserMethodLabel ? <div>Method: {parserMethodLabel}</div> : null}
            {parsedAtLabel ? <div>Updated: {parsedAtLabel}</div> : null}
            {finalSourceLabel ? <div>Source: {finalSourceLabel}</div> : null}
            {structuredDiagnostics?.llmStatus ? <div>LLM status: {structuredDiagnostics.llmStatus}</div> : null}
            {confidenceTier ? <div>Confidence tier: {confidenceTier}</div> : null}
            {structuredDiagnostics?.requestId ? <div>Request ID: {structuredDiagnostics.requestId}</div> : null}
          </div>
        </article>

        <article className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Field provenance</div>
          <div className="mt-3 space-y-2 text-xs text-text-tertiary">
            {provenanceEntries.length > 0 ? (
              provenanceEntries.map(([path, info]) => (
                <div key={path}>
                  {path}: {info.source}
                </div>
              ))
            ) : (
              <div>No field-level provenance captured yet.</div>
            )}
          </div>
        </article>

        <article className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Normalized skills</div>
          {skills.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {skills.map((entry) => (
                <Badge
                  key={`${entry.skill.slug}-${entry.source}`}
                  variant={entry.source === 'explicit' ? 'accent' : 'secondary'}
                >
                  {entry.skill.name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-secondary">No normalized skills detected yet.</p>
          )}
        </article>

        <article className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Top match preview</div>
          {detail.topMatches.length > 0 ? (
            <div className="mt-3 space-y-3">
              {detail.topMatches.slice(0, 3).map((match) => (
                <Link
                  key={match.id}
                  href={`/career-match/${match.id}`}
                  className="block rounded-2xl border border-border-subtle bg-bg-surface p-4 hover:border-border-default"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-text-primary">
                      {match.job?.title ?? 'Startup role'}
                    </div>
                    <Badge variant="accent">{Math.round(match.overall_score)}% fit</Badge>
                  </div>
                  <div className="mt-1 text-xs text-text-tertiary">
                    {match.job?.company?.company_name ?? 'Unknown company'}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-secondary">
              Matches will appear here after analysis and recompute complete.
            </p>
          )}
        </article>
      </aside>
    );
  }

  return (
    <section className="space-y-6">
      <article className="space-y-6">
        <div className="surface-panel space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">Extracted profile</h2>
                {metaBadges.map((badge) => (
                  <Badge key={badge.label} variant={badge.variant}>
                    {badge.label}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-sm text-text-secondary">
                This is the structured profile Credvia is currently using for match scoring.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
              {parserMethodLabel ? <span>Source: {parserMethodLabel}</span> : null}
              {parsedAtLabel ? <span>Updated {parsedAtLabel}</span> : null}
            </div>
          </div>

          {usedOcr ? (
            <div className="rounded-2xl border border-info/30 bg-info/10 px-4 py-2 text-xs text-info">
              OCR fallback was used for this extraction because native PDF text quality was too low.
            </div>
          ) : null}
          {recoveredFromNoise ? (
            <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-2 text-xs text-warning">
              Recovered from noisy PDF
              {typeof salvageScore === 'number' ? `- Salvage ${salvageScore}` : ''}
            </div>
          ) : null}
          {showStaleParsedBanner ? (
            <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              Latest extraction failed. Showing the most recent successful parsed content.
            </div>
          ) : null}

          {profile ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Identity</div>
                <div className="mt-2 text-lg font-semibold text-text-primary">
                  {sanitizedName ?? 'Name not detected'}
                </div>
                <div className="mt-1 text-sm text-text-secondary">
                  {sanitizedTitle ?? 'Current title not detected'}
                </div>
                {sanitizedLocation ? (
                  <div className="mt-2 text-xs text-text-tertiary">{sanitizedLocation}</div>
                ) : (
                  <div className="mt-2 text-xs text-text-tertiary">Location not detected</div>
                )}
              </div>
              <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Contact</div>
                {sanitizedEmail || sanitizedPhone ? (
                  <div className="mt-2 space-y-1 text-sm text-text-secondary">
                    {sanitizedEmail ? <div>{sanitizedEmail}</div> : null}
                    {sanitizedPhone ? <div>{sanitizedPhone}</div> : null}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-text-secondary">No contact details detected.</div>
                )}
                {linkedInLine || githubLine || portfolioLine ? (
                  <div className="mt-3 space-y-1 text-xs text-text-tertiary">
                    {linkedInLine ? <div>LinkedIn: {linkedInLine}</div> : null}
                    {githubLine ? <div>GitHub: {githubLine}</div> : null}
                    {portfolioLine ? <div>Portfolio: {portfolioLine}</div> : null}
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-text-tertiary">Links not detected.</div>
                )}
              </div>
            </div>
          ) : null}

          {profile ? (
            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Profile summary</div>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {sanitizedSummary ?? 'No summary was extracted from this resume yet.'}
                </p>
                {insightItems.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-xs text-text-tertiary">
                    {insightItems.slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {acceptedWithWarnings && !hasStructuredContent ? (
                <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                  We extracted this resume with warnings, but no structured content could be detected yet.
                  <div className="mt-2 text-xs text-warning/90">
                    Try a DOCX or cleaner PDF to improve parsing quality.
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border-subtle px-4 py-5 text-sm text-text-secondary">
              Run resume analysis to populate your structured profile.
            </div>
          )}
        </div>

        <div className="surface-panel space-y-4 p-6">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
            Experience and Projects
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Experience</div>
              {experienceEntries.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {experienceEntries.map((entry, index) => (
                    <div key={`exp-${index}`} className="rounded-xl border border-border-subtle bg-bg-overlay/40 p-3">
                      <div className="text-sm font-medium text-text-primary">{entry.title ?? 'Role'}</div>
                      {entry.company ? <div className="mt-1 text-xs text-text-tertiary">{entry.company}</div> : null}
                      {entry.location ? <div className="mt-1 text-xs text-text-tertiary">{entry.location}</div> : null}
                      {entry.dates ? <div className="mt-1 text-xs text-text-tertiary">{entry.dates}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm text-text-secondary">No structured experience entries yet.</div>
              )}
            </div>

            <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Projects</div>
              {projectEntries.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {projectEntries.map((entry, index) => (
                    <div key={`proj-${index}`} className="rounded-xl border border-border-subtle bg-bg-overlay/40 p-3">
                      <div className="text-sm font-medium text-text-primary">{entry.name ?? 'Project'}</div>
                      {entry.description ? <div className="mt-1 text-xs text-text-secondary">{entry.description}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm text-text-secondary">No structured project entries yet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="surface-panel space-y-4 p-6">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Education</div>
          {educationEntries.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {educationEntries.map((entry, index) => (
                <div key={`edu-${index}`} className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
                  <div className="text-sm font-medium text-text-primary">
                    {entry.degree ?? 'Education'}
                  </div>
                  {entry.institution ? (
                    <div className="mt-1 text-xs text-text-tertiary">{entry.institution}</div>
                  ) : null}
                  {entry.fieldOfStudy ? (
                    <div className="mt-1 text-xs text-text-tertiary">{entry.fieldOfStudy}</div>
                  ) : null}
                  {entry.dates ? (
                    <div className="mt-1 text-xs text-text-tertiary">{entry.dates}</div>
                  ) : null}
                  {entry.grade ? (
                    <div className="mt-1 text-xs text-text-tertiary">Grade: {entry.grade}</div>
                  ) : null}
                  {entry.description ? (
                    <div className="mt-2 text-sm text-text-secondary">{entry.description}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border-subtle px-4 py-5 text-sm text-text-secondary">
              No structured education entries yet.
            </div>
          )}
        </div>

      </article>
    </section>
  );
}
