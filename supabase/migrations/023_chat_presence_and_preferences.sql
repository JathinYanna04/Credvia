-- Migration 023: Chat presence and participant preferences

ALTER TABLE public.chat_participants
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_chat_participants_user_pinned
  ON public.chat_participants(user_id, is_pinned, pinned_at DESC)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.chat_user_presence (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'away', 'offline')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_user_presence_status
  ON public.chat_user_presence(status, updated_at DESC);

DROP TRIGGER IF EXISTS trg_chat_user_presence_updated ON public.chat_user_presence;
CREATE TRIGGER trg_chat_user_presence_updated
  BEFORE UPDATE ON public.chat_user_presence
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.chat_user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_user_presence: participant read"
  ON public.chat_user_presence
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.chat_participants self_participant
      JOIN public.chat_participants other_participant
        ON self_participant.conversation_id = other_participant.conversation_id
      WHERE self_participant.user_id = auth.uid()
        AND self_participant.status = 'active'
        AND other_participant.user_id = chat_user_presence.user_id
        AND other_participant.status = 'active'
    )
  );

CREATE POLICY "chat_user_presence: self insert"
  ON public.chat_user_presence
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat_user_presence: self update"
  ON public.chat_user_presence
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
