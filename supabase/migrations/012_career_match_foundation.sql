-- Migration 012: Career Match foundation

CREATE TABLE public.resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded', -- uploaded | processing | ready | failed
  parse_error TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.resume_profiles (
  resume_id UUID PRIMARY KEY REFERENCES public.resumes(id) ON DELETE CASCADE,
  summary TEXT,
  location_text TEXT,
  remote_preference TEXT, -- remote | hybrid | onsite | flexible | unknown
  experience_years INT,
  projects_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  experience_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  education_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_text TEXT NOT NULL,
  parsed_sections_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.resume_skills (
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  source TEXT NOT NULL, -- direct | inferred
  evidence TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (resume_id, skill_id)
);

CREATE TABLE public.resume_analysis_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | processing | completed | failed
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.job_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_synced_at TIMESTAMPTZ,
  sync_cursor JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.startup_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES public.job_sources(id) ON DELETE CASCADE,
  external_company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  website_url TEXT,
  careers_url TEXT,
  location_text TEXT,
  remote_policy TEXT, -- remote | hybrid | onsite | flexible | unknown
  logo_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, external_company_id),
  UNIQUE (source_id, slug)
);

CREATE TABLE public.startup_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES public.job_sources(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.startup_companies(id) ON DELETE CASCADE,
  external_job_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  location_text TEXT,
  remote_policy TEXT, -- remote | hybrid | onsite | flexible | unknown
  employment_type TEXT,
  experience_min_years INT,
  experience_max_years INT,
  description_text TEXT NOT NULL,
  apply_url TEXT NOT NULL,
  posted_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, external_job_id),
  UNIQUE (company_id, slug)
);

CREATE TABLE public.job_skills (
  job_id UUID NOT NULL REFERENCES public.startup_jobs(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  weight NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job_id, skill_id)
);

CREATE TABLE public.job_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.startup_jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'current', -- current | stale | archived
  overall_score NUMERIC(5,2) NOT NULL,
  skill_score NUMERIC(5,2) NOT NULL,
  title_score NUMERIC(5,2) NOT NULL,
  experience_score NUMERIC(5,2) NOT NULL,
  location_score NUMERIC(5,2) NOT NULL,
  matched_skills_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_skills_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  strengths_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  explanation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, resume_id, job_id)
);

CREATE TABLE public.saved_job_matches (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.job_matches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, match_id)
);

CREATE INDEX idx_resumes_user ON public.resumes(user_id, created_at DESC);
CREATE UNIQUE INDEX idx_resumes_one_active ON public.resumes(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_resume_analysis_runs_resume ON public.resume_analysis_runs(resume_id, started_at DESC);
CREATE INDEX idx_resume_skills_resume ON public.resume_skills(resume_id);
CREATE INDEX idx_job_sources_status ON public.job_sources(status, last_synced_at DESC);
CREATE INDEX idx_startup_companies_active ON public.startup_companies(active, name);
CREATE INDEX idx_startup_jobs_active_posted ON public.startup_jobs(active, posted_at DESC);
CREATE INDEX idx_startup_jobs_company ON public.startup_jobs(company_id, active);
CREATE INDEX idx_startup_jobs_last_seen ON public.startup_jobs(last_seen_at DESC);
CREATE INDEX idx_job_matches_user_score ON public.job_matches(user_id, overall_score DESC, computed_at DESC);
CREATE INDEX idx_job_matches_resume ON public.job_matches(resume_id, overall_score DESC);
CREATE INDEX idx_saved_job_matches_user ON public.saved_job_matches(user_id, created_at DESC);

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.startup_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.startup_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_job_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resumes: self read" ON public.resumes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "resumes: self insert" ON public.resumes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "resumes: self update" ON public.resumes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "resumes: self delete" ON public.resumes
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "resume_profiles: self read" ON public.resume_profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.resumes WHERE id = resume_id AND user_id = auth.uid())
  );
CREATE POLICY "resume_profiles: self write" ON public.resume_profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.resumes WHERE id = resume_id AND user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.resumes WHERE id = resume_id AND user_id = auth.uid())
  );

CREATE POLICY "resume_skills: self read" ON public.resume_skills
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.resumes WHERE id = resume_id AND user_id = auth.uid())
  );
CREATE POLICY "resume_skills: self write" ON public.resume_skills
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.resumes WHERE id = resume_id AND user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.resumes WHERE id = resume_id AND user_id = auth.uid())
  );

CREATE POLICY "resume_analysis_runs: self read" ON public.resume_analysis_runs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "resume_analysis_runs: self insert" ON public.resume_analysis_runs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "job_sources: public read active" ON public.job_sources
  FOR SELECT USING (status = 'active');

CREATE POLICY "startup_companies: public read active" ON public.startup_companies
  FOR SELECT USING (active = TRUE);

CREATE POLICY "startup_jobs: public read active" ON public.startup_jobs
  FOR SELECT USING (active = TRUE);

CREATE POLICY "job_skills: public read active jobs" ON public.job_skills
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.startup_jobs WHERE id = job_id AND active = TRUE)
  );

CREATE POLICY "job_matches: self read" ON public.job_matches
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "job_matches: self insert" ON public.job_matches
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "job_matches: self update" ON public.job_matches
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "job_matches: self delete" ON public.job_matches
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "saved_job_matches: self only" ON public.saved_job_matches
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_resumes_updated BEFORE UPDATE ON public.resumes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_resume_profiles_updated BEFORE UPDATE ON public.resume_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_job_sources_updated BEFORE UPDATE ON public.job_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_startup_companies_updated BEFORE UPDATE ON public.startup_companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_startup_jobs_updated BEFORE UPDATE ON public.startup_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_job_matches_updated BEFORE UPDATE ON public.job_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resumes',
  'resumes',
  FALSE,
  10485760,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "resume bucket: self read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "resume bucket: self insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "resume bucket: self update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "resume bucket: self delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

INSERT INTO public.job_sources (source_key, display_name, status)
VALUES ('yc', 'Y Combinator Jobs', 'active')
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO public.skills (name, slug)
VALUES
  ('JavaScript', 'javascript'),
  ('TypeScript', 'typescript'),
  ('Node.js', 'nodejs'),
  ('React', 'react'),
  ('Next.js', 'nextjs'),
  ('Python', 'python'),
  ('Django', 'django'),
  ('Flask', 'flask'),
  ('FastAPI', 'fastapi'),
  ('Java', 'java'),
  ('Spring', 'spring'),
  ('Go', 'go'),
  ('Rust', 'rust'),
  ('Ruby', 'ruby'),
  ('Ruby on Rails', 'rails'),
  ('PostgreSQL', 'postgresql'),
  ('MySQL', 'mysql'),
  ('MongoDB', 'mongodb'),
  ('Redis', 'redis'),
  ('Docker', 'docker'),
  ('Kubernetes', 'kubernetes'),
  ('Amazon Web Services', 'aws'),
  ('Google Cloud Platform', 'gcp'),
  ('Microsoft Azure', 'azure'),
  ('GraphQL', 'graphql'),
  ('REST APIs', 'rest-api'),
  ('Machine Learning', 'machine-learning'),
  ('Artificial Intelligence', 'artificial-intelligence'),
  ('Data Analysis', 'data-analysis'),
  ('Product Management', 'product-management'),
  ('Figma', 'figma'),
  ('SQL', 'sql'),
  ('DevOps', 'devops'),
  ('Sales', 'sales'),
  ('Marketing', 'marketing'),
  ('Customer Success', 'customer-success')
ON CONFLICT (slug) DO NOTHING;
