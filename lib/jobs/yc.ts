import { slugify } from '@/lib/utils/format';
import { detectSkillEntries } from '@/lib/resume/skill-taxonomy';

export interface NormalizedStartupCompany {
  externalCompanyId: string;
  name: string;
  slug: string;
  websiteUrl?: string | null;
  careersUrl?: string | null;
  locationText?: string | null;
  remotePolicy?: string | null;
  logoUrl?: string | null;
  metadata: Record<string, unknown>;
}

export interface NormalizedStartupJob {
  externalJobId: string;
  title: string;
  slug: string;
  locationText?: string | null;
  remotePolicy?: string | null;
  employmentType?: string | null;
  experienceMinYears?: number | null;
  experienceMaxYears?: number | null;
  descriptionText: string;
  applyUrl: string;
  postedAt?: string | null;
  metadata: Record<string, unknown>;
  extractedSkills: Array<{ slug: string; evidence: string; required: boolean; weight: number }>;
}

interface YcJobPosting {
  id: number;
  title: string;
  url: string;
  applyUrl: string;
  location?: string;
  type?: string;
  role?: string;
  roleSpecificType?: string;
  prettyRole?: string;
  salaryRange?: string;
  equityRange?: string;
  minExperience?: string;
  visa?: string;
  skills?: string[];
  companyUrl?: string;
  companyLogoUrl?: string;
  companyName?: string;
  companyBatchName?: string;
  companyOneLiner?: string;
  createdAt?: string;
  lastActive?: string;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractDataPage(html: string) {
  const match = html.match(/data-page="([^"]+)"/);
  if (!match) {
    throw new Error('Could not locate YC job payload.');
  }

  return JSON.parse(decodeHtmlEntities(match[1] ?? '')) as {
    props?: {
      jobPostings?: YcJobPosting[];
    };
  };
}

function inferRemotePolicy(locationText?: string | null) {
  const value = (locationText ?? '').toLowerCase();
  if (!value) return 'unknown';
  if (value.includes('remote')) return 'remote';
  if (value.includes('hybrid')) return 'hybrid';
  return 'onsite';
}

function inferExperienceRange(minExperience?: string) {
  if (!minExperience) {
    return { min: null, max: null };
  }

  const lower = minExperience.toLowerCase();
  const match = lower.match(/(\d+)\+?\s+years?/);
  if (match) {
    return { min: Number(match[1]), max: null };
  }

  if (lower.includes('new grad') || lower.includes('any')) {
    return { min: 0, max: null };
  }

  return { min: null, max: null };
}

function metaTagContent(html: string, name: string) {
  const match = html.match(new RegExp(`<meta[^>]+name="${name}"[^>]+content="([\\s\\S]*?)"\\s*/?>`, 'i'));
  return match ? decodeHtmlEntities(match[1] ?? '') : '';
}

async function fetchJobDescription(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CredviaCareerMatch/1.0' },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`YC detail fetch failed: ${response.status}`);
  }

  const html = await response.text();
  return metaTagContent(html, 'description');
}

function extractJobSkills(descriptionText: string, listingSkills: string[] = []) {
  const detected = new Map<string, { slug: string; evidence: string; required: boolean; weight: number }>();

  for (const skill of detectSkillEntries([descriptionText, ...listingSkills].join(' '))) {
    detected.set(skill.slug, {
      slug: skill.slug,
      evidence: skill.name,
      required: true,
      weight: 1,
    });
  }

  return [...detected.values()];
}

export async function fetchYcJobs() {
  const response = await fetch('https://www.ycombinator.com/jobs?languageid=1', {
    headers: { 'User-Agent': 'CredviaCareerMatch/1.0' },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`YC jobs fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const payload = extractDataPage(html);
  const postings = payload.props?.jobPostings ?? [];

  const normalized = await Promise.all(
    postings.map(async (posting) => {
      const companySlug = posting.companyUrl?.split('/').filter(Boolean).pop() ?? slugify(posting.companyName ?? `company-${posting.id}`);
      const detailUrl = new URL(posting.url, 'https://www.ycombinator.com').toString();
      const descriptionText = await fetchJobDescription(detailUrl);
      const experience = inferExperienceRange(posting.minExperience);

      const company: NormalizedStartupCompany = {
        externalCompanyId: companySlug,
        name: posting.companyName ?? companySlug,
        slug: companySlug,
        careersUrl: new URL(posting.companyUrl ?? '/', 'https://www.ycombinator.com').toString(),
        locationText: posting.location ?? null,
        remotePolicy: inferRemotePolicy(posting.location),
        logoUrl: posting.companyLogoUrl ?? null,
        metadata: {
          batchName: posting.companyBatchName ?? null,
          oneLiner: posting.companyOneLiner ?? null,
          ycCompanyUrl: posting.companyUrl ?? null,
        },
      };

      const job: NormalizedStartupJob = {
        externalJobId: String(posting.id),
        title: posting.title,
        slug: slugify(`${posting.title}-${posting.id}`),
        locationText: posting.location ?? null,
        remotePolicy: inferRemotePolicy(posting.location),
        employmentType: posting.type ?? null,
        experienceMinYears: experience.min,
        experienceMaxYears: experience.max,
        descriptionText,
        applyUrl: new URL(posting.applyUrl, 'https://www.ycombinator.com').toString(),
        postedAt: null,
        metadata: {
          ycUrl: detailUrl,
          salaryRange: posting.salaryRange ?? null,
          equityRange: posting.equityRange ?? null,
          minExperience: posting.minExperience ?? null,
          visa: posting.visa ?? null,
          role: posting.role ?? null,
          roleSpecificType: posting.roleSpecificType ?? null,
          prettyRole: posting.prettyRole ?? null,
          companyOneLiner: posting.companyOneLiner ?? null,
          lastActive: posting.lastActive ?? null,
          createdAtLabel: posting.createdAt ?? null,
        },
        extractedSkills: extractJobSkills(descriptionText, posting.skills ?? []),
      };

      return { company, job };
    }),
  );

  return normalized;
}
