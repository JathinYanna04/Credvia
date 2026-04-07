-- Migration 018: Identity graph and trust v2

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS secondary_personas TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS profile_intent TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS open_to TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS expertise_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS interest_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contribution_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credibility_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS helpfulness_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expertise_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS community_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS persona_completion_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS open_for_opportunities BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_for_mentorship BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_for_hiring BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_version INT NOT NULL DEFAULT 2;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_primary_persona_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_primary_persona_check
      CHECK (
        primary_persona IS NULL OR primary_persona IN (
          'student',
          'job_seeker',
          'professional',
          'recruiter',
          'founder',
          'mentor'
        )
      );
  END IF;
END $$;

UPDATE public.profiles
SET
  secondary_personas = COALESCE(secondary_personas, '{}'),
  profile_intent = COALESCE(profile_intent, '{}'),
  open_to = COALESCE(open_to, '{}'),
  expertise_tags = COALESCE(expertise_tags, '{}'),
  interest_tags = COALESCE(interest_tags, '{}'),
  contribution_score = COALESCE(contribution_score, 0),
  credibility_score = COALESCE(credibility_score, 0),
  helpfulness_score = COALESCE(helpfulness_score, 0),
  expertise_score = COALESCE(expertise_score, 0),
  community_score = COALESCE(community_score, 0),
  persona_completion_score = COALESCE(persona_completion_score, 0),
  onboarding_version = COALESCE(onboarding_version, 2);

CREATE TABLE IF NOT EXISTS public.profile_persona_details (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  current_title TEXT,
  company TEXT,
  industry TEXT,
  years_experience INT,
  college TEXT,
  degree TEXT,
  graduation_year INT,
  target_roles TEXT[] NOT NULL DEFAULT '{}',
  preferred_locations TEXT[] NOT NULL DEFAULT '{}',
  work_mode TEXT,
  startup_name TEXT,
  startup_stage TEXT,
  startup_domains TEXT[] NOT NULL DEFAULT '{}',
  startup_team_size INT,
  mentor_topics TEXT[] NOT NULL DEFAULT '{}',
  mentoring_format TEXT,
  hiring_roles TEXT[] NOT NULL DEFAULT '{}',
  hiring_regions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_contribution_stats (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  posts_count INT NOT NULL DEFAULT 0,
  comments_count INT NOT NULL DEFAULT 0,
  votes_received INT NOT NULL DEFAULT 0,
  votes_cast INT NOT NULL DEFAULT 0,
  helpful_marks_received INT NOT NULL DEFAULT 0,
  mentor_answers_count INT NOT NULL DEFAULT 0,
  startup_ideas_count INT NOT NULL DEFAULT 0,
  recruiter_actions_count INT NOT NULL DEFAULT 0,
  score_last_recomputed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_topic_follows (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, topic_id)
);

ALTER TABLE public.reputation_events
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS points INT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.reputation_events
SET
  event_type = COALESCE(event_type, source_type),
  entity_type = COALESCE(entity_type, 'legacy'),
  entity_id = COALESCE(entity_id, source_id),
  points = COALESCE(points, delta);

CREATE INDEX IF NOT EXISTS idx_profiles_primary_persona ON public.profiles(primary_persona);
CREATE INDEX IF NOT EXISTS idx_profiles_secondary_personas ON public.profiles USING GIN (secondary_personas);
CREATE INDEX IF NOT EXISTS idx_profiles_profile_intent ON public.profiles USING GIN (profile_intent);
CREATE INDEX IF NOT EXISTS idx_profiles_open_to ON public.profiles USING GIN (open_to);
CREATE INDEX IF NOT EXISTS idx_profiles_interest_tags ON public.profiles USING GIN (interest_tags);
CREATE INDEX IF NOT EXISTS idx_profiles_expertise_tags ON public.profiles USING GIN (expertise_tags);
CREATE INDEX IF NOT EXISTS idx_topic_follows_topic ON public.user_topic_follows(topic_id);
CREATE INDEX IF NOT EXISTS idx_reputation_events_event_type ON public.reputation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_reputation_events_entity ON public.reputation_events(entity_type, entity_id);

ALTER TABLE public.profile_persona_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_contribution_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_topic_follows ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profile_persona_details' AND policyname = 'persona_details: self read'
  ) THEN
    CREATE POLICY "persona_details: self read"
      ON public.profile_persona_details FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profile_persona_details' AND policyname = 'persona_details: self write'
  ) THEN
    CREATE POLICY "persona_details: self write"
      ON public.profile_persona_details FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_contribution_stats' AND policyname = 'contrib_stats: public read'
  ) THEN
    CREATE POLICY "contrib_stats: public read"
      ON public.user_contribution_stats FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'topics' AND policyname = 'topics: public read'
  ) THEN
    CREATE POLICY "topics: public read"
      ON public.topics FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_topic_follows' AND policyname = 'topic_follows: public read'
  ) THEN
    CREATE POLICY "topic_follows: public read"
      ON public.user_topic_follows FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_topic_follows' AND policyname = 'topic_follows: self write'
  ) THEN
    CREATE POLICY "topic_follows: self write"
      ON public.user_topic_follows FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profile_persona_details_updated'
  ) THEN
    CREATE TRIGGER trg_profile_persona_details_updated
      BEFORE UPDATE ON public.profile_persona_details
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_contribution_stats_updated'
  ) THEN
    CREATE TRIGGER trg_user_contribution_stats_updated
      BEFORE UPDATE ON public.user_contribution_stats
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
