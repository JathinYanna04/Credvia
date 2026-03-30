import { detectSkillEntries } from '@/lib/resume/skill-taxonomy';

export interface ParsedResume {
  summary: string | null;
  locationText: string | null;
  remotePreference: 'remote' | 'hybrid' | 'onsite' | 'flexible' | 'unknown';
  experienceYears: number | null;
  projects: string[];
  experience: string[];
  education: string[];
  parsedSections: Record<string, string[]>;
  directSkillSlugs: string[];
  inferredSkillSlugs: string[];
}

const SECTION_HEADERS: Record<string, string[]> = {
  summary: ['summary', 'profile', 'about'],
  skills: ['skills', 'technical skills', 'core skills', 'tooling'],
  projects: ['projects', 'selected projects'],
  experience: ['experience', 'work experience', 'professional experience', 'employment'],
  education: ['education'],
};

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
  return 'unknown';
}

function inferLocation(lines: string[]) {
  const candidate = lines.find((line) =>
    /,\s*[A-Z]{2}\b|remote|india|united states|usa|uk|london|san francisco|new york/i.test(line),
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

export function parseResumeText(rawText: string): ParsedResume {
  const cleaned = rawText.replace(/\r/g, '');
  const lines = cleaned
    .split('\n')
    .map(normalizeLine)
    .filter(Boolean);

  const sections: {
    summary: string[];
    skills: string[];
    projects: string[];
    experience: string[];
    education: string[];
    other: string[];
  } = {
    summary: [],
    skills: [],
    projects: [],
    experience: [],
    education: [],
    other: [],
  };

  let currentSection: keyof typeof sections = 'summary';
  for (const line of lines) {
    const sectionMatch = detectSection(line);
    if (sectionMatch && sectionMatch.section in sections) {
      currentSection = sectionMatch.section as keyof typeof sections;
      if (sectionMatch.remainder) {
        sections[currentSection].push(sectionMatch.remainder);
      }
      continue;
    }

    sections[currentSection].push(line);
  }

  const summary =
    sections.summary.join(' ').trim() ||
    lines.slice(0, 4).join(' ').trim() ||
    null;

  const directSkills = detectSkillEntries(sections.skills.join(' '));
  const inferredSkills = detectSkillEntries(
    [...sections.projects, ...sections.experience].join(' '),
  ).filter((entry) => !directSkills.some((direct) => direct.slug === entry.slug));

  return {
    summary,
    locationText: inferLocation(lines),
    remotePreference: inferRemotePreference(cleaned),
    experienceYears: inferExperienceYears(cleaned),
    projects: sections.projects,
    experience: sections.experience,
    education: sections.education,
    parsedSections: sections,
    directSkillSlugs: directSkills.map((entry) => entry.slug),
    inferredSkillSlugs: inferredSkills.map((entry) => entry.slug),
  };
}
