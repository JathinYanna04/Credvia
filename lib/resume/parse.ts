import { detectSkillEntries } from '@/lib/resume/skill-taxonomy';

export interface ParsedResumeSections {
  summary: string[];
  skills: string[];
  projects: string[];
  experience: string[];
  education: string[];
  other: string[];
}

export interface ParsedResumeMeta {
  extractionMethod?: string;
  attemptedMethods?: string[];
  extractionQuality?: Record<string, unknown>;
  contaminationScore?: number;
  salvageScore?: number;
  cleaningActions?: string[];
  usedOcr?: boolean;
  ocrAttempted?: boolean;
  ocrImprovedQuality?: boolean | null;
  ocrConfidence?: number | null;
  ocrAvailable?: boolean;
  ocrUnavailableReason?: string | null;
  acceptedWithWarnings?: boolean;
  finalSource?: 'llm' | 'heuristic_fallback' | 'merged';
  llmStatus?: 'success' | 'invalid_json' | 'timeout' | 'error' | 'skipped';
  llmError?: string | null;
  llmRawPresent?: boolean | null;
  warningCode?:
    | 'LOW_TEXT_CONFIDENCE'
    | 'OCR_UNAVAILABLE'
    | 'OCR_DID_NOT_IMPROVE'
    | 'SALVAGED_FROM_NOISE'
    | 'CLEANED_TEXT_LOW_SIGNAL'
    | null;
  warningMessage?: string | null;
  textLength?: number;
  cleanedTextLength?: number;
  readiness?: 'good' | 'partial' | 'poor' | 'failed';
  rawText?: string;
  cleanedText?: string;
}

export interface ParsedResume {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  currentTitle: string | null;
  summary: string | null;
  locationText: string | null;
  remotePreference: 'remote' | 'hybrid' | 'onsite' | 'flexible' | 'unknown';
  experienceYears: number | null;
  projects: string[];
  experience: string[];
  education: string[];
  parsedSections: ParsedResumeSections & { __meta?: ParsedResumeMeta };
  directSkillSlugs: string[];
  inferredSkillSlugs: string[];
}

const SECTION_HEADERS: Record<keyof ParsedResumeSections, string[]> = {
  summary: ['summary', 'profile', 'about', 'professional summary'],
  skills: ['skills', 'technical skills', 'core skills', 'tooling', 'technologies', 'stack'],
  projects: ['projects', 'selected projects', 'project experience'],
  experience: ['experience', 'work experience', 'professional experience', 'employment'],
  education: ['education', 'certifications', 'certification', 'achievements', 'awards'],
  other: [],
};

const INLINE_SECTION_HEADERS = [
  'Summary',
  'Profile',
  'Skills',
  'Technical Skills',
  'Core Skills',
  'Technologies',
  'Stack',
  'Projects',
  'Selected Projects',
  'Project Experience',
  'Experience',
  'Work Experience',
  'Professional Experience',
  'Education',
  'Certifications',
  'Achievements',
  'Awards',
  'Location',
];

const TITLE_HINT = /\b(engineer|developer|manager|designer|analyst|founder|consultant|architect|intern|specialist|lead|director|product|backend|frontend|full[- ]stack|software)\b/i;
const DEGREE_HINT = /\b(b\.?sc|bachelor|b\.?e|m\.?sc|master|m\.?tech|ph\.?d|mba|university|college|institute|school)\b/i;
const PROJECT_HINT = /\b(project|built|developed|shipped|led|launched)\b/i;
const EXPERIENCE_HINT = /\b(experience|intern|engineer|developer|manager|analyst|designer|consultant|architect|lead|director)\b/i;
const DATE_HINT = /\b(20\d{2}|19\d{2})\b/;
const PDF_INTERNAL_HINT = /\b(xref|flatedecode|objstm|endstream|startxref|endobj)\b/i;
const PDF_METADATA_HINT = /\/(Type|Length|Filter|DecodeParms|Root|Info|Pages|Catalog|Page|Font|Contents|MediaBox|Resources)\b/i;

function preprocessResumeText(rawText: string) {
  let normalized = rawText.replace(/\r/g, '\n');

  for (const label of INLINE_SECTION_HEADERS) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    normalized = normalized.replace(new RegExp(`([^\\n])\\s+(${escaped})\\s*:`, 'gi'), '$1\n$2:');
  }

  normalized = normalized
    .replace(/\u2022/g, '-')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

  return normalized.trim();
}

function reconstructResumeText(rawText: string) {
  let reconstructed = rawText;

  reconstructed = reconstructed.replace(
    /([a-z0-9])\s+(Summary|Profile|Skills|Technical Skills|Core Skills|Technologies|Stack|Projects|Project Experience|Experience|Work Experience|Professional Experience|Education|Certifications|Achievements|Awards)\s*:/gi,
    '$1\n$2:',
  );

  reconstructed = reconstructed.replace(
    /([a-z0-9])\s+(Summary|Profile|Skills|Technical Skills|Core Skills|Technologies|Stack|Projects|Project Experience|Experience|Work Experience|Professional Experience|Education|Certifications|Achievements|Awards)\b/gi,
    '$1\n$2',
  );

  reconstructed = reconstructed.replace(/([^\n])\s+(\u2022|[-*])\s+/g, '$1\n- ');
  reconstructed = reconstructed.replace(/([^\n])\s+(\b20\d{2}\b)/g, '$1\n$2');

  reconstructed = reconstructed.replace(
    /([^\n])\s+([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
    '$1\n$2',
  );
  reconstructed = reconstructed.replace(
    /([^\n])\s+(\+?\d[\d\s()+-]{7,})/g,
    '$1\n$2',
  );

  return reconstructed;
}

function shouldDropPdfNoiseLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }

  if (!PDF_INTERNAL_HINT.test(trimmed) && !PDF_METADATA_HINT.test(trimmed)) {
    return false;
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length < 6) {
    return false;
  }

  const alphaWords = trimmed.match(/\b[A-Za-z]{2,}\b/g) ?? [];
  const alphaRatio = alphaWords.length / tokens.length;
  const slashHits = trimmed.match(/\/[A-Za-z]/g)?.length ?? 0;
  const internalHits =
    (trimmed.match(/\b(xref|obj|stream|endstream|startxref|flatedecode)\b/gi)?.length ??
      0) + slashHits;
  const internalRatio = internalHits / tokens.length;

  return (
    internalRatio >= 0.35 ||
    (slashHits >= 4 && alphaWords.length < 4) ||
    (trimmed.length > 140 && alphaRatio < 0.35)
  );
}

function stripPdfInternalLines(rawText: string) {
  if (!PDF_INTERNAL_HINT.test(rawText) && !PDF_METADATA_HINT.test(rawText)) {
    return rawText;
  }

  const lines = rawText.split('\n');
  const filtered = lines.filter((line) => !shouldDropPdfNoiseLine(line));
  return filtered.join('\n');
}

function normalizeLine(line: string) {
  return line.replace(/\u2022/g, '-').replace(/\s+/g, ' ').trim();
}

function detectSection(line: string) {
  const trimmed = line.trim();
  const normalized = trimmed.toLowerCase();

  for (const [section, headers] of Object.entries(SECTION_HEADERS)) {
    for (const header of headers) {
      if (normalized === header) {
        return { section, remainder: '' };
      }

      const prefix = `${header}:`;
      if (normalized.startsWith(prefix)) {
        return {
          section,
          remainder: trimmed.slice(prefix.length).trim(),
        };
      }
    }
  }

  return null;
}

function inferRemotePreference(text: string): ParsedResume['remotePreference'] {
  const normalized = text.toLowerCase();
  if (normalized.includes('remote')) return 'remote';
  if (normalized.includes('hybrid')) return 'hybrid';
  if (normalized.includes('onsite') || normalized.includes('on-site')) return 'onsite';
  if (normalized.includes('flexible')) return 'flexible';
  return 'unknown';
}

function inferLocation(lines: string[]) {
  const candidate = lines.find((line) =>
    /,\s*[A-Z]{2}\b|remote|india|united states|usa|uk|london|san francisco|new york|telangana|bangalore|hyderabad/i.test(
      line,
    ),
  );
  return candidate ?? null;
}

function inferExperienceYears(text: string) {
  const explicit = text.match(/(\d+)\+?\s+years?/i);
  if (explicit) {
    return Number(explicit[1]);
  }

  const years = [...text.matchAll(/\b(20\d{2}|19\d{2})\b/g)].map((match) => Number(match[1]));
  if (years.length >= 2) {
    return Math.max(0, Math.max(...years) - Math.min(...years));
  }

  return null;
}

function inferEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
}

function inferPhone(text: string) {
  return text.match(/(?:\+\d{1,3}\s*)?(?:\(?\d{2,4}\)?[\s-]*){2,4}\d{3,4}/)?.[0]?.trim() ?? null;
}

function inferFullName(lines: string[]) {
  for (const line of lines.slice(0, 6)) {
    if (
      line.length < 5 ||
      line.length > 80 ||
      /@|linkedin|github|skills?|experience|education|project|resume/i.test(line)
    ) {
      continue;
    }

    const words = line.split(/\s+/);
    if (
      words.length >= 2 &&
      words.length <= 5 &&
      words.every((word) => /^[A-Z][A-Za-z.'-]+$/.test(word))
    ) {
      return line;
    }
  }

  return null;
}

function inferCurrentTitle(lines: string[], fullName: string | null) {
  const startIndex = fullName ? Math.max(0, lines.indexOf(fullName)) : 0;
  const candidates = lines.slice(startIndex, startIndex + 8);

  for (const line of candidates) {
    if (
      !line ||
      line === fullName ||
      /@|linkedin|github|skills?|experience|education|project|location/i.test(line)
    ) {
      continue;
    }

    if (TITLE_HINT.test(line)) {
      return line;
    }
  }

  return null;
}

function inferSummary(sections: ParsedResumeSections, lines: string[], fullName: string | null, currentTitle: string | null) {
  if (sections.summary.length > 0) {
    const filteredSummaryLines = sections.summary.filter((line) => {
      if (!line || line === fullName || line === currentTitle) {
        return false;
      }

      return !/@|linkedin|github|coding profiles?|^\[|^\+?\d[\d\s()+-]{7,}|location/i.test(line);
    });

    return filteredSummaryLines.join(' ').trim() || currentTitle || null;
  }

  const summaryLines = lines.filter((line) => {
    if (!line || line === fullName || line === currentTitle) {
      return false;
    }

    return !/@|linkedin|github|skills?|experience|education|project|location/i.test(line);
  });

  return summaryLines.slice(0, 3).join(' ').trim() || null;
}

function inferEducationLines(lines: string[]) {
  return lines.filter((line) => DEGREE_HINT.test(line)).slice(0, 4);
}

function inferExperienceLines(lines: string[]) {
  return lines
    .filter((line) => EXPERIENCE_HINT.test(line) || DATE_HINT.test(line))
    .slice(0, 6);
}

function inferProjectLines(lines: string[]) {
  return lines.filter((line) => PROJECT_HINT.test(line)).slice(0, 6);
}

export function parseResumeText(rawText: string, meta?: ParsedResumeMeta): ParsedResume {
  const reconstructed = reconstructResumeText(stripPdfInternalLines(rawText));
  const cleaned = preprocessResumeText(reconstructed);
  const lines = cleaned
    .split('\n')
    .map(normalizeLine)
    .filter(Boolean);

  const sections: ParsedResumeSections = {
    summary: [],
    skills: [],
    projects: [],
    experience: [],
    education: [],
    other: [],
  };

  let currentSection: keyof ParsedResumeSections = 'summary';

  for (const line of lines) {
    const sectionMatch = detectSection(line);
    if (sectionMatch && sectionMatch.section in sections) {
      currentSection = sectionMatch.section as keyof ParsedResumeSections;
      if (sectionMatch.remainder) {
        sections[currentSection].push(sectionMatch.remainder);
      }
      continue;
    }

    sections[currentSection].push(line);
  }

  const fullName = inferFullName(lines);
  const currentTitle = inferCurrentTitle(lines, fullName);
  const summary = inferSummary(sections, lines, fullName, currentTitle);

  const skillsSourceText = [
    sections.skills.join(' '),
    lines.filter((line) => /^skills?:/i.test(line)).join(' '),
  ].join(' ');
  const directSkillEntries = detectSkillEntries(skillsSourceText);
  const fallbackSkillEntries = sections.skills.length === 0 ? detectSkillEntries(cleaned) : [];
  const directSkills = directSkillEntries.length > 0 ? directSkillEntries : fallbackSkillEntries;
  if (sections.education.length === 0) {
    const inferredEducation = inferEducationLines(lines);
    if (inferredEducation.length > 0) {
      sections.education.push(...inferredEducation);
    }
  }

  if (sections.experience.length === 0) {
    const inferredExperience = inferExperienceLines(lines);
    if (inferredExperience.length > 0) {
      sections.experience.push(...inferredExperience);
    }
  }

  if (sections.projects.length === 0) {
    const inferredProjects = inferProjectLines(lines);
    if (inferredProjects.length > 0) {
      sections.projects.push(...inferredProjects);
    }
  }

  if (sections.skills.length === 0 && fallbackSkillEntries.length > 0) {
    sections.skills.push(`Skills: ${fallbackSkillEntries.map((entry) => entry.name).join(', ')}`);
  }

  const inferredSkills = detectSkillEntries(
    [...sections.projects, ...sections.experience, summary ?? '', currentTitle ?? '', cleaned].join(' '),
  ).filter((entry) => !directSkills.some((direct) => direct.slug === entry.slug));

  return {
    fullName,
    email: inferEmail(cleaned),
    phone: inferPhone(cleaned),
    currentTitle,
    summary,
    locationText: inferLocation(lines),
    remotePreference: inferRemotePreference(cleaned),
    experienceYears: inferExperienceYears(cleaned),
    projects: sections.projects,
    experience: sections.experience,
    education: sections.education,
    parsedSections: meta ? { ...sections, __meta: meta } : sections,
    directSkillSlugs: directSkills.map((entry) => entry.slug),
    inferredSkillSlugs: inferredSkills.map((entry) => entry.slug),
  };
}
