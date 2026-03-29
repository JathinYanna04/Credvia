-- Migration 006: Notifications, Reports, Moderation
CREATE TABLE public.notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notif_type    TEXT NOT NULL, -- 'reply' | 'mention' | 'vote' | 'best_answer' | 'follow' | 'mod_action'
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  entity_type   TEXT,
  entity_id     UUID,
  payload       JSONB,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.reports (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_type      TEXT NOT NULL, -- 'post' | 'comment' | 'profile'
  target_id        UUID NOT NULL,
  reason_code      TEXT NOT NULL, -- 'spam' | 'harassment' | 'misinformation' | 'off_topic' | 'other'
  details          TEXT,
  status           TEXT NOT NULL DEFAULT 'open', -- 'open' | 'reviewed' | 'actioned' | 'dismissed'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE TABLE public.moderation_actions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  moderator_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_type       TEXT NOT NULL,
  target_id         UUID NOT NULL,
  action_type       TEXT NOT NULL, -- 'hide' | 'remove' | 'suspend' | 'warn' | 'reinstate'
  reason            TEXT,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX idx_reports_status ON public.reports(status, created_at DESC);
CREATE INDEX idx_mod_actions_target ON public.moderation_actions(target_type, target_id);
