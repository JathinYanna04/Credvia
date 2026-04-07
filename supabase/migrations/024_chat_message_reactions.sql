-- Migration 024: Chat message reactions

CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_chat_message_reactions_message_user_emoji UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_conversation_created
  ON public.chat_message_reactions(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message
  ON public.chat_message_reactions(message_id);

DROP TRIGGER IF EXISTS trg_chat_message_reactions_updated ON public.chat_message_reactions;
CREATE TRIGGER trg_chat_message_reactions_updated
  BEFORE UPDATE ON public.chat_message_reactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_message_reactions: participant read" ON public.chat_message_reactions;
CREATE POLICY "chat_message_reactions: participant read"
  ON public.chat_message_reactions
  FOR SELECT
  USING (public.is_chat_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "chat_message_reactions: self insert" ON public.chat_message_reactions;
CREATE POLICY "chat_message_reactions: self insert"
  ON public.chat_message_reactions
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_chat_participant(conversation_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.chat_messages m
      WHERE m.id = chat_message_reactions.message_id
        AND m.conversation_id = chat_message_reactions.conversation_id
    )
  );

DROP POLICY IF EXISTS "chat_message_reactions: self delete" ON public.chat_message_reactions;
CREATE POLICY "chat_message_reactions: self delete"
  ON public.chat_message_reactions
  FOR DELETE
  USING (
    user_id = auth.uid()
    AND public.is_chat_participant(conversation_id, auth.uid())
  );
