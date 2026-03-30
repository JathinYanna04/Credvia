import type { Database } from '@/lib/supabase/types';

export interface SkillTaxonomyEntry {
  slug: string;
  name: string;
  aliases: string[];
}

export const SKILL_TAXONOMY: SkillTaxonomyEntry[] = [
  { slug: 'javascript', name: 'JavaScript', aliases: ['javascript', 'js', 'ecmascript'] },
  { slug: 'typescript', name: 'TypeScript', aliases: ['typescript', 'ts'] },
  { slug: 'nodejs', name: 'Node.js', aliases: ['node.js', 'nodejs', 'node'] },
  { slug: 'react', name: 'React', aliases: ['react', 'reactjs', 'react.js'] },
  { slug: 'nextjs', name: 'Next.js', aliases: ['next.js', 'nextjs'] },
  { slug: 'python', name: 'Python', aliases: ['python'] },
  { slug: 'django', name: 'Django', aliases: ['django'] },
  { slug: 'flask', name: 'Flask', aliases: ['flask'] },
  { slug: 'fastapi', name: 'FastAPI', aliases: ['fastapi', 'fast api'] },
  { slug: 'java', name: 'Java', aliases: ['java'] },
  { slug: 'spring', name: 'Spring', aliases: ['spring', 'spring boot'] },
  { slug: 'go', name: 'Go', aliases: ['golang', 'go language', ' go '] },
  { slug: 'rust', name: 'Rust', aliases: ['rust'] },
  { slug: 'ruby', name: 'Ruby', aliases: ['ruby'] },
  { slug: 'rails', name: 'Ruby on Rails', aliases: ['rails', 'ruby on rails'] },
  { slug: 'postgresql', name: 'PostgreSQL', aliases: ['postgresql', 'postgres'] },
  { slug: 'mysql', name: 'MySQL', aliases: ['mysql'] },
  { slug: 'mongodb', name: 'MongoDB', aliases: ['mongodb', 'mongo db', 'mongo'] },
  { slug: 'redis', name: 'Redis', aliases: ['redis'] },
  { slug: 'docker', name: 'Docker', aliases: ['docker'] },
  { slug: 'kubernetes', name: 'Kubernetes', aliases: ['kubernetes', 'k8s'] },
  { slug: 'aws', name: 'Amazon Web Services', aliases: ['aws', 'amazon web services'] },
  { slug: 'gcp', name: 'Google Cloud Platform', aliases: ['gcp', 'google cloud', 'google cloud platform'] },
  { slug: 'azure', name: 'Microsoft Azure', aliases: ['azure', 'microsoft azure'] },
  { slug: 'graphql', name: 'GraphQL', aliases: ['graphql'] },
  { slug: 'rest-api', name: 'REST APIs', aliases: ['rest api', 'rest apis', 'restful api', 'restful apis'] },
  { slug: 'machine-learning', name: 'Machine Learning', aliases: ['machine learning', 'ml'] },
  { slug: 'artificial-intelligence', name: 'Artificial Intelligence', aliases: ['artificial intelligence', 'ai'] },
  { slug: 'data-analysis', name: 'Data Analysis', aliases: ['data analysis', 'analytics'] },
  { slug: 'product-management', name: 'Product Management', aliases: ['product management', 'product manager'] },
  { slug: 'figma', name: 'Figma', aliases: ['figma'] },
  { slug: 'sql', name: 'SQL', aliases: ['sql'] },
  { slug: 'devops', name: 'DevOps', aliases: ['devops', 'dev ops'] },
  { slug: 'sales', name: 'Sales', aliases: ['sales', 'account executive', 'business development'] },
  { slug: 'marketing', name: 'Marketing', aliases: ['marketing', 'growth marketing'] },
  { slug: 'customer-success', name: 'Customer Success', aliases: ['customer success', 'customer support'] },
];

const aliasMap = new Map<string, SkillTaxonomyEntry>();
for (const entry of SKILL_TAXONOMY) {
  for (const alias of entry.aliases) {
    aliasMap.set(alias.toLowerCase(), entry);
  }
}

export type SkillRow = Database['public']['Tables']['skills']['Row'];

function containsAlias(haystack: string, alias: string) {
  const escaped = alias.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
}

export function detectSkillEntries(text: string) {
  const normalized = text.toLowerCase();
  const matches = new Map<string, SkillTaxonomyEntry>();

  for (const entry of SKILL_TAXONOMY) {
    if (entry.aliases.some((alias) => containsAlias(normalized, alias.toLowerCase()))) {
      matches.set(entry.slug, entry);
    }
  }

  return [...matches.values()];
}

export function buildSkillLookup(
  skills: Array<Pick<SkillRow, 'id' | 'name' | 'slug'>>,
) {
  const bySlug = new Map<string, Pick<SkillRow, 'id' | 'name' | 'slug'>>();
  for (const skill of skills) {
    bySlug.set(skill.slug, skill);
  }
  return bySlug;
}

export function getSkillEntryBySlug(slug: string) {
  return SKILL_TAXONOMY.find((entry) => entry.slug === slug) ?? null;
}
