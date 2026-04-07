-- Migration 019: Adaptive intelligence graph

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contribution_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS trust_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS behavioral_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS growth_trajectory JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS identity_confidence_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consistency_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depth_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impact_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signal_to_noise_ratio INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS domain_authority_score INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.trust_edges (
  source_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  domain_tag TEXT NOT NULL DEFAULT 'general',
  edge_type TEXT NOT NULL DEFAULT 'contribution',
  weight INT NOT NULL DEFAULT 0,
  evidence_entity_type TEXT,
  evidence_entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_user_id, target_user_id, domain_tag, edge_type),
  CHECK (source_user_id <> target_user_id)
);

CREATE TABLE IF NOT EXISTS public.endorsement_graph (
  endorser_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endorsed_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  domain_tag TEXT NOT NULL,
  note TEXT,
  weight INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (endorser_user_id, endorsed_user_id, domain_tag),
  CHECK (endorser_user_id <> endorsed_user_id)
);

CREATE TABLE IF NOT EXISTS public.feed_signal_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  duration_ms INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.interaction_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  interaction_type TEXT NOT NULL,
  value INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trust_edges_target ON public.trust_edges(target_user_id, domain_tag, weight DESC);
CREATE INDEX IF NOT EXISTS idx_endorsement_graph_target ON public.endorsement_graph(endorsed_user_id, domain_tag);
CREATE INDEX IF NOT EXISTS idx_feed_signal_events_user_created ON public.feed_signal_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_events_target ON public.interaction_events(target_user_id, created_at DESC);

ALTER TABLE public.trust_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endorsement_graph ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_signal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interaction_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'trust_edges' AND policyname = 'trust_edges: public read'
  ) THEN
    CREATE POLICY "trust_edges: public read"
      ON public.trust_edges FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'endorsement_graph' AND policyname = 'endorsement_graph: public read'
  ) THEN
    CREATE POLICY "endorsement_graph: public read"
      ON public.endorsement_graph FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'endorsement_graph' AND policyname = 'endorsement_graph: self write'
  ) THEN
    CREATE POLICY "endorsement_graph: self write"
      ON public.endorsement_graph FOR ALL
      USING (auth.uid() = endorser_user_id)
      WITH CHECK (auth.uid() = endorser_user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'feed_signal_events' AND policyname = 'feed_signal_events: self write'
  ) THEN
    CREATE POLICY "feed_signal_events: self write"
      ON public.feed_signal_events FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'interaction_events' AND policyname = 'interaction_events: self write'
  ) THEN
    CREATE POLICY "interaction_events: self write"
      ON public.interaction_events FOR INSERT
      WITH CHECK (auth.uid() = actor_user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'interaction_events' AND policyname = 'interaction_events: self read'
  ) THEN
    CREATE POLICY "interaction_events: self read"
      ON public.interaction_events FOR SELECT
      USING (auth.uid() = actor_user_id OR auth.uid() = target_user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_trust_edges_updated'
  ) THEN
    CREATE TRIGGER trg_trust_edges_updated
      BEFORE UPDATE ON public.trust_edges
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_endorsement_graph_updated'
  ) THEN
    CREATE TRIGGER trg_endorsement_graph_updated
      BEFORE UPDATE ON public.endorsement_graph
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
