-- Migration 021: Chat Row-Level Security Policies

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversation_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_user_keypairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_blocks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_chat_participant(
  conversation_uuid UUID,
  user_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_participants cp
    WHERE cp.conversation_id = conversation_uuid
      AND cp.user_id = user_uuid
      AND cp.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_chat_owner(
  conversation_uuid UUID,
  user_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_participants cp
    WHERE cp.conversation_id = conversation_uuid
      AND cp.user_id = user_uuid
      AND cp.status = 'active'
      AND cp.role = 'owner'
  );
$$;

CREATE POLICY "chat_conversations: participant read"
  ON public.chat_conversations
  FOR SELECT
  USING (public.is_chat_participant(id, auth.uid()));

CREATE POLICY "chat_conversations: creator insert"
  ON public.chat_conversations
  FOR INSERT
  WITH CHECK (
    (
      auth.uid() = created_by
      AND type = 'dm'
    )
    OR
    (
      type = 'idea_group'
      AND source_type = 'idea'
      AND EXISTS (
        SELECT 1
        FROM public.posts p
        WHERE p.id = source_id
          AND p.post_type = 'startup_idea'
          AND p.status = 'published'
          AND p.author_id = created_by
      )
    )
  );

CREATE POLICY "chat_conversations: owner update"
  ON public.chat_conversations
  FOR UPDATE
  USING (public.is_chat_owner(id, auth.uid()))
  WITH CHECK (public.is_chat_owner(id, auth.uid()));

CREATE POLICY "chat_conversations: owner delete"
  ON public.chat_conversations
  FOR DELETE
  USING (public.is_chat_owner(id, auth.uid()));

CREATE POLICY "chat_participants: participant read"
  ON public.chat_participants
  FOR SELECT
  USING (public.is_chat_participant(conversation_id, auth.uid()));

CREATE POLICY "chat_participants: self or owner insert"
  ON public.chat_participants
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_chat_owner(conversation_id, auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.chat_conversations c
      WHERE c.id = conversation_id
        AND c.created_by = auth.uid()
    )
  );

CREATE POLICY "chat_participants: self update"
  ON public.chat_participants
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_participants: owner manage"
  ON public.chat_participants
  FOR UPDATE
  USING (public.is_chat_owner(conversation_id, auth.uid()))
  WITH CHECK (public.is_chat_owner(conversation_id, auth.uid()));

CREATE POLICY "chat_messages: participant read"
  ON public.chat_messages
  FOR SELECT
  USING (public.is_chat_participant(conversation_id, auth.uid()));

CREATE POLICY "chat_messages: participant insert"
  ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_chat_participant(conversation_id, auth.uid())
    AND NOT EXISTS (
      SELECT 1
      FROM public.chat_participants cp
      JOIN public.chat_blocks b
        ON (
          (b.blocker_id = cp.user_id AND b.blocked_id = auth.uid())
          OR
          (b.blocker_id = auth.uid() AND b.blocked_id = cp.user_id)
        )
      WHERE cp.conversation_id = conversation_id
        AND cp.status = 'active'
    )
  );

CREATE POLICY "chat_messages: sender update"
  ON public.chat_messages
  FOR UPDATE
  USING (
    sender_id = auth.uid()
    AND public.is_chat_participant(conversation_id, auth.uid())
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_chat_participant(conversation_id, auth.uid())
  );

CREATE POLICY "chat_conversation_keys: self read"
  ON public.chat_conversation_keys
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND public.is_chat_participant(conversation_id, auth.uid())
  );

CREATE POLICY "chat_conversation_keys: self insert"
  ON public.chat_conversation_keys
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_chat_participant(conversation_id, auth.uid())
  );

CREATE POLICY "chat_conversation_keys: owner insert"
  ON public.chat_conversation_keys
  FOR INSERT
  WITH CHECK (
    public.is_chat_owner(conversation_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.chat_participants cp
      WHERE cp.conversation_id = chat_conversation_keys.conversation_id
        AND cp.user_id = chat_conversation_keys.user_id
    )
  );

CREATE POLICY "chat_conversation_keys: self update"
  ON public.chat_conversation_keys
  FOR UPDATE
  USING (
    user_id = auth.uid()
    AND public.is_chat_participant(conversation_id, auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_chat_participant(conversation_id, auth.uid())
  );

CREATE POLICY "chat_conversation_keys: owner update"
  ON public.chat_conversation_keys
  FOR UPDATE
  USING (public.is_chat_owner(conversation_id, auth.uid()))
  WITH CHECK (
    public.is_chat_owner(conversation_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.chat_participants cp
      WHERE cp.conversation_id = chat_conversation_keys.conversation_id
        AND cp.user_id = chat_conversation_keys.user_id
    )
  );

CREATE POLICY "chat_conversation_keys: self delete"
  ON public.chat_conversation_keys
  FOR DELETE
  USING (
    user_id = auth.uid()
    AND public.is_chat_participant(conversation_id, auth.uid())
  );

CREATE POLICY "chat_conversation_keys: owner delete"
  ON public.chat_conversation_keys
  FOR DELETE
  USING (public.is_chat_owner(conversation_id, auth.uid()));

CREATE POLICY "chat_user_keypairs: self read"
  ON public.chat_user_keypairs
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "chat_user_keypairs: authenticated public read"
  ON public.chat_user_keypairs
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "chat_user_keypairs: self insert"
  ON public.chat_user_keypairs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat_user_keypairs: self update"
  ON public.chat_user_keypairs
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat_blocks: involved read"
  ON public.chat_blocks
  FOR SELECT
  USING (blocker_id = auth.uid() OR blocked_id = auth.uid());

CREATE POLICY "chat_blocks: self insert"
  ON public.chat_blocks
  FOR INSERT
  WITH CHECK (blocker_id = auth.uid() AND blocker_id <> blocked_id);

CREATE POLICY "chat_blocks: self delete"
  ON public.chat_blocks
  FOR DELETE
  USING (blocker_id = auth.uid());
