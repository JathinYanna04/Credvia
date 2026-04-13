-- Migration 025: Shared AI infrastructure and feature result tables

CREATE TABLE IF NOT EXISTS public.ai_runs (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  feature TEXT NOT NULL CHECK (feature IN ('founder_idea_feedback', 'career_copilot', 'moderation_review')),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('startup_idea', 'resume', 'report')),
  subject_id UUID NOT NULL,
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  provider TEXT,
  model TEXT,
  prompt_version TEXT NOT NULL,
  input_schema_version TEXT NOT NULL DEFAULT 'v1',
  output_schema_version TEXT NOT NULL DEFAULT 'v1',
  request_id TEXT,
  trace_id TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.founder_idea_reviews (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  run_id UUID NOT NULL UNIQUE REFERENCES public.ai_runs(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  founder_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL,
  confidence NUMERIC(5,2),
  summary TEXT NOT NULL,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  market_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.career_copilot_sessions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  match_id UUID REFERENCES public.job_matches(id) ON DELETE SET NULL,
  run_id UUID REFERENCES public.ai_runs(id) ON DELETE SET NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.career_copilot_insights (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.career_copilot_sessions(id) ON DELETE CASCADE,
  run_id UUID NOT NULL UNIQUE REFERENCES public.ai_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL DEFAULT 'general',
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.moderation_ai_reviews (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  run_id UUID NOT NULL UNIQUE REFERENCES public.ai_runs(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  moderator_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  risk_label TEXT NOT NULL,
  confidence NUMERIC(5,2),
  rationale TEXT NOT NULL,
  suggested_action TEXT NOT NULL,
  suggested_reason TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_runs_request_id_unique
  ON public.ai_runs(request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_runs_requested_by_created
  ON public.ai_runs(requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_runs_feature_status_created
  ON public.ai_runs(feature, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_runs_subject_lookup
  ON public.ai_runs(subject_type, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_founder_idea_reviews_post_created
  ON public.founder_idea_reviews(post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_founder_idea_reviews_founder_created
  ON public.founder_idea_reviews(founder_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_career_copilot_sessions_user_created
  ON public.career_copilot_sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_career_copilot_insights_session_created
  ON public.career_copilot_insights(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_career_copilot_insights_user_created
  ON public.career_copilot_insights(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_ai_reviews_report_created
  ON public.moderation_ai_reviews(report_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_ai_reviews_moderator_created
  ON public.moderation_ai_reviews(moderator_user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_career_copilot_sessions_updated ON public.career_copilot_sessions;
CREATE TRIGGER trg_career_copilot_sessions_updated
  BEFORE UPDATE ON public.career_copilot_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founder_idea_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_copilot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_copilot_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_ai_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_runs: owner read" ON public.ai_runs;
CREATE POLICY "ai_runs: owner read"
  ON public.ai_runs
  FOR SELECT
  USING (requested_by = auth.uid());

DROP POLICY IF EXISTS "ai_runs: moderator read moderation" ON public.ai_runs;
CREATE POLICY "ai_runs: moderator read moderation"
  ON public.ai_runs
  FOR SELECT
  USING (
    feature = 'moderation_review'
    AND EXISTS (
      SELECT 1
      FROM public.community_memberships
      WHERE user_id = auth.uid()
        AND role IN ('moderator', 'admin')
    )
  );

DROP POLICY IF EXISTS "ai_runs: owner insert" ON public.ai_runs;
CREATE POLICY "ai_runs: owner insert"
  ON public.ai_runs
  FOR INSERT
  WITH CHECK (requested_by = auth.uid());

DROP POLICY IF EXISTS "founder_idea_reviews: founder read" ON public.founder_idea_reviews;
CREATE POLICY "founder_idea_reviews: founder read"
  ON public.founder_idea_reviews
  FOR SELECT
  USING (founder_user_id = auth.uid());

DROP POLICY IF EXISTS "founder_idea_reviews: founder insert" ON public.founder_idea_reviews;
CREATE POLICY "founder_idea_reviews: founder insert"
  ON public.founder_idea_reviews
  FOR INSERT
  WITH CHECK (
    founder_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.posts
      WHERE posts.id = founder_idea_reviews.post_id
        AND posts.author_id = auth.uid()
        AND posts.post_type = 'startup_idea'
    )
  );

DROP POLICY IF EXISTS "career_copilot_sessions: self read" ON public.career_copilot_sessions;
CREATE POLICY "career_copilot_sessions: self read"
  ON public.career_copilot_sessions
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "career_copilot_sessions: self insert" ON public.career_copilot_sessions;
CREATE POLICY "career_copilot_sessions: self insert"
  ON public.career_copilot_sessions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "career_copilot_sessions: self update" ON public.career_copilot_sessions;
CREATE POLICY "career_copilot_sessions: self update"
  ON public.career_copilot_sessions
  FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "career_copilot_sessions: self delete" ON public.career_copilot_sessions;
CREATE POLICY "career_copilot_sessions: self delete"
  ON public.career_copilot_sessions
  FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "career_copilot_insights: self read" ON public.career_copilot_insights;
CREATE POLICY "career_copilot_insights: self read"
  ON public.career_copilot_insights
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "career_copilot_insights: self insert" ON public.career_copilot_insights;
CREATE POLICY "career_copilot_insights: self insert"
  ON public.career_copilot_insights
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.career_copilot_sessions
      WHERE career_copilot_sessions.id = career_copilot_insights.session_id
        AND career_copilot_sessions.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "moderation_ai_reviews: moderator read" ON public.moderation_ai_reviews;
CREATE POLICY "moderation_ai_reviews: moderator read"
  ON public.moderation_ai_reviews
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_memberships
      WHERE user_id = auth.uid()
        AND role IN ('moderator', 'admin')
    )
  );

DROP POLICY IF EXISTS "moderation_ai_reviews: moderator insert" ON public.moderation_ai_reviews;
CREATE POLICY "moderation_ai_reviews: moderator insert"
  ON public.moderation_ai_reviews
  FOR INSERT
  WITH CHECK (
    moderator_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.community_memberships
      WHERE user_id = auth.uid()
        AND role IN ('moderator', 'admin')
    )
  );
