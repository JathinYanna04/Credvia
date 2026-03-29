-- Seed data for development
-- Run this after all migrations

-- Seed Skills
INSERT INTO public.skills (name, slug) VALUES
  ('JavaScript', 'javascript'),
  ('TypeScript', 'typescript'),
  ('Python', 'python'),
  ('React', 'react'),
  ('Next.js', 'nextjs'),
  ('Node.js', 'nodejs'),
  ('PostgreSQL', 'postgresql'),
  ('System Design', 'system-design'),
  ('Data Structures', 'data-structures'),
  ('Machine Learning', 'machine-learning'),
  ('Docker', 'docker'),
  ('Kubernetes', 'kubernetes'),
  ('Go', 'go'),
  ('Rust', 'rust'),
  ('GraphQL', 'graphql'),
  ('AWS', 'aws'),
  ('UI/UX Design', 'ui-ux-design'),
  ('Product Management', 'product-management'),
  ('Open Source', 'open-source'),
  ('DevOps', 'devops')
ON CONFLICT (slug) DO NOTHING;

-- Seed Communities (only if not exists)
INSERT INTO public.communities (id, name, slug, description, status) VALUES
  (uuid_generate_v4(), 'Web Development', 'web-dev', 'HTML, CSS, JS, frameworks, web tooling, and browser APIs.', 'active'),
  (uuid_generate_v4(), 'AI / ML', 'ai-ml', 'Machine learning, deep learning, LLMs, and applied AI.', 'active'),
  (uuid_generate_v4(), 'Internship Prep', 'internship-prep', 'DSA, mock interviews, referrals, and campus placement advice.', 'active'),
  (uuid_generate_v4(), 'Open Source', 'open-source', 'Contributing to OSS, finding projects, and building in public.', 'active'),
  (uuid_generate_v4(), 'Resume Review', 'resume-review', 'Get structured feedback on your resume from peers and professionals.', 'active'),
  (uuid_generate_v4(), 'Startups', 'startups', 'Building products, startup lessons, fundraising, and founder life.', 'active'),
  (uuid_generate_v4(), 'Hackathons', 'hackathons', 'Team formation, project ideas, past wins, and upcoming events.', 'active')
ON CONFLICT (slug) DO NOTHING;

-- Create search function
CREATE OR REPLACE FUNCTION public.search_all(
  query_text TEXT,
  entity_types TEXT[] DEFAULT ARRAY['post', 'community', 'profile'],
  result_limit INT DEFAULT 10
)
RETURNS TABLE (
  entity_type TEXT,
  id UUID,
  title TEXT,
  subtitle TEXT,
  avatar_url TEXT,
  slug TEXT,
  score REAL
) AS $$
BEGIN
  RETURN QUERY
  -- Posts
  SELECT
    'post'::TEXT,
    p.id,
    p.title,
    substring(p.body_md, 1, 120) as subtitle,
    NULL::TEXT,
    NULL::TEXT,
    ts_rank(p.search_vector, plainto_tsquery('english', query_text)) as score
  FROM public.posts p
  WHERE 'post' = ANY(entity_types)
    AND p.status = 'published'
    AND p.search_vector @@ plainto_tsquery('english', query_text)

  UNION ALL

  -- Communities
  SELECT
    'community'::TEXT,
    c.id,
    c.name,
    c.description,
    c.icon_url,
    c.slug,
    ts_rank(c.search_vector, plainto_tsquery('english', query_text))
  FROM public.communities c
  WHERE 'community' = ANY(entity_types)
    AND c.status = 'active'
    AND c.search_vector @@ plainto_tsquery('english', query_text)

  UNION ALL

  -- Profiles
  SELECT
    'profile'::TEXT,
    pr.user_id,
    pr.full_name,
    pr.headline,
    pr.avatar_url,
    pr.username,
    ts_rank(pr.search_vector, plainto_tsquery('english', query_text))
  FROM public.profiles pr
  WHERE 'profile' = ANY(entity_types)
    AND pr.search_vector @@ plainto_tsquery('english', query_text)

  ORDER BY score DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;
