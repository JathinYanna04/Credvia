-- Migration 005: Reputation
CREATE TABLE public.reputation_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  source_type  TEXT NOT NULL, -- 'post_upvote' | 'comment_upvote' | 'best_answer' | 'post_saved' | 'post_removed' | 'comment_removed' | 'spam_violation'
  source_id    UUID NOT NULL,
  delta        INT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, community_id, source_type, source_id)
);

CREATE TABLE public.community_reputation (
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  score        INT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, community_id)
);

CREATE INDEX idx_rep_events_user ON public.reputation_events(user_id);
CREATE INDEX idx_rep_events_community ON public.reputation_events(community_id);
CREATE INDEX idx_community_rep_score ON public.community_reputation(community_id, score DESC);
