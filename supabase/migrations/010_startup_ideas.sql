CREATE TABLE public.startup_ideas (
  post_id UUID PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  founder_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  problem TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  solution TEXT NOT NULL,
  market_category TEXT NOT NULL,
  stage TEXT NOT NULL,
  monetization_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT startup_ideas_stage_check CHECK (
    stage IN ('idea', 'problem_validation', 'mvp_building', 'early_users')
  )
);

CREATE INDEX idx_startup_ideas_founder ON public.startup_ideas(founder_user_id);
CREATE INDEX idx_startup_ideas_stage ON public.startup_ideas(stage);
CREATE INDEX idx_startup_ideas_market_category ON public.startup_ideas(market_category);

ALTER TABLE public.startup_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "startup_ideas: public read" ON public.startup_ideas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = startup_ideas.post_id
        AND posts.status = 'published'
    )
  );

CREATE POLICY "startup_ideas: founder insert" ON public.startup_ideas
  FOR INSERT WITH CHECK (
    auth.uid() = founder_user_id
    AND EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = startup_ideas.post_id
        AND posts.author_id = auth.uid()
    )
  );

CREATE POLICY "startup_ideas: founder update" ON public.startup_ideas
  FOR UPDATE
  USING (
    auth.uid() = founder_user_id
    AND EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = startup_ideas.post_id
        AND posts.author_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = founder_user_id
    AND EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = startup_ideas.post_id
        AND posts.author_id = auth.uid()
    )
  );

CREATE TRIGGER trg_startup_ideas_updated
  BEFORE UPDATE ON public.startup_ideas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
