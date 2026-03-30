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
  extractionQuality?: Record<string, unknown>;
  usedOcr?: boolean;
  ocrConfidence?: number | null;
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
  skills: ['skills', 'technical skills', 'core skills', 'tooling'],
  projects: ['projects', 'selected projects'],
  experience: ['experience', 'work experience', 'professional experience', 'employment'],
  education: ['education'],
  other: [],
};

const INLINE_SECTION_HEADERS = [
  'Summary',
  'Profile',
  'Skills',
  'Technical Skills',
  'Core Skills',
  'Projects',
  'Selected Projects',
  'Experience',
  'Work Experience',
  'Professional Experience',
  'Education',
  'Location',
];

const TITLE_HINT = /\b(engineer|developer|manager|designer|analyst|founder|consultant|architect|intern|specialist|lead|director|product|backend|frontend|full[- ]stack|software)\b/i;

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

export function parseResumeText(rawText: string, meta?: ParsedResumeMeta): ParsedResume {
  const cleaned = preprocessResumeText(rawText);
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

  const directSkills = detectSkillEntries(
    [sections.skills.join(' '), lines.filter((line) => /^skills?:/i.test(line)).join(' ')].join(' '),
  );
  const inferredSkills = detectSkillEntries(
    [...sections.projects, ...sections.experience, summary ?? '', currentTitle ?? ''].join(' '),
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
