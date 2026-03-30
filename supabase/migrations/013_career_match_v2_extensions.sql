-- Migration 013: Career Match V2 extensions

CREATE TABLE public.job_follows (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.startup_jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, job_id)
);

CREATE TABLE public.company_follows (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.startup_companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE public.skill_aliases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  alias TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.job_match_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.startup_jobs(id) ON DELETE CASCADE,
  job_match_id UUID REFERENCES public.job_matches(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL, -- new_match | score_increase | followed_job_update | followed_company_job
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_follows_user ON public.job_follows(user_id, created_at DESC);
CREATE INDEX idx_company_follows_user ON public.company_follows(user_id, created_at DESC);
CREATE INDEX idx_job_match_alerts_user ON public.job_match_alerts(user_id, created_at DESC);
CREATE INDEX idx_skill_aliases_canonical ON public.skill_aliases(canonical_skill_id);

ALTER TABLE public.job_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_match_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_follows: self only" ON public.job_follows
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "company_follows: self only" ON public.company_follows
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "skill_aliases: public read" ON public.skill_aliases
  FOR SELECT USING (true);

CREATE POLICY "job_match_alerts: self read" ON public.job_match_alerts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "job_match_alerts: self insert" ON public.job_match_alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "job_match_alerts: self update" ON public.job_match_alerts
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "job_match_alerts: self delete" ON public.job_match_alerts
  FOR DELETE USING (auth.uid() = user_id);
