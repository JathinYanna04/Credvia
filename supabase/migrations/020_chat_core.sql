-- Migration 020: Chat Core (ciphertext-only message storage)

CREATE TABLE public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('dm', 'idea_group')),
  source_type TEXT,
  source_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  dm_user_low UUID REFERENCES public.users(id) ON DELETE CASCADE,
  dm_user_high UUID REFERENCES public.users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  last_message_id UUID,
  message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_conversations_dm_users_distinct CHECK (
    dm_user_low IS NULL OR dm_user_high IS NULL OR dm_user_low <> dm_user_high
  ),
  CONSTRAINT chat_conversations_type_shape CHECK (
    (
      type = 'dm'
      AND source_type IS NULL
      AND source_id IS NULL
      AND dm_user_low IS NOT NULL
      AND dm_user_high IS NOT NULL
    )
    OR
    (
      type = 'idea_group'
      AND source_type = 'idea'
      AND source_id IS NOT NULL
      AND dm_user_low IS NULL
      AND dm_user_high IS NULL
    )
  )
);

CREATE TABLE public.chat_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'removed')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  last_read_message_id UUID,
  last_read_at TIMESTAMPTZ,
  notifications_muted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_participants_left_at_consistency CHECK (
    (status = 'active' AND left_at IS NULL)
    OR
    (status IN ('left', 'removed'))
  )
);

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'system', 'context_card')),
  ciphertext TEXT,
  iv TEXT,
  algorithm TEXT,
  key_version INTEGER CHECK (key_version IS NULL OR key_version > 0),
  payload_meta JSONB,
  client_generated_id TEXT,
  reply_to_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_messages_encrypted_content_shape CHECK (
    (
      message_type = 'text'
      AND (
        is_deleted = TRUE
        OR
        (
          ciphertext IS NOT NULL
          AND iv IS NOT NULL
          AND algorithm IS NOT NULL
        )
      )
    )
    OR
    (message_type IN ('system', 'context_card'))
  ),
  CONSTRAINT chat_messages_deleted_consistency CHECK (
    (is_deleted = FALSE AND deleted_at IS NULL)
    OR
    (is_deleted = TRUE AND deleted_at IS NOT NULL)
  )
);

CREATE TABLE public.chat_conversation_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  encrypted_conversation_key TEXT NOT NULL,
  key_encryption_algorithm TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ
);

CREATE TABLE public.chat_user_keypairs (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'RSA-OAEP-256',
  key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.chat_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_blocks_no_self_block CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_last_message_fk
  FOREIGN KEY (last_message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;

ALTER TABLE public.chat_participants
  ADD CONSTRAINT chat_participants_last_read_message_fk
  FOREIGN KEY (last_read_message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX uq_chat_conversations_dm_pair
  ON public.chat_conversations(dm_user_low, dm_user_high)
  WHERE type = 'dm';

CREATE UNIQUE INDEX uq_chat_conversations_idea_source
  ON public.chat_conversations(source_type, source_id)
  WHERE type = 'idea_group' AND source_id IS NOT NULL;

CREATE INDEX idx_chat_conversations_last_message_at
  ON public.chat_conversations(last_message_at DESC NULLS LAST);

CREATE INDEX idx_chat_conversations_created_by
  ON public.chat_conversations(created_by, created_at DESC);

CREATE UNIQUE INDEX uq_chat_participants_conversation_user
  ON public.chat_participants(conversation_id, user_id);

CREATE INDEX idx_chat_participants_user_active
  ON public.chat_participants(user_id, status, updated_at DESC);

CREATE INDEX idx_chat_participants_conversation_active
  ON public.chat_participants(conversation_id, status, joined_at DESC);

CREATE INDEX idx_chat_messages_conversation_created
  ON public.chat_messages(conversation_id, created_at DESC);

CREATE INDEX idx_chat_messages_conversation_not_deleted
  ON public.chat_messages(conversation_id, created_at DESC)
  WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX uq_chat_messages_client_generated
  ON public.chat_messages(conversation_id, client_generated_id)
  WHERE client_generated_id IS NOT NULL;

CREATE INDEX idx_chat_messages_sender_created
  ON public.chat_messages(sender_id, created_at DESC);

CREATE UNIQUE INDEX uq_chat_conversation_keys_conversation_user_version
  ON public.chat_conversation_keys(conversation_id, user_id, key_version);

CREATE INDEX idx_chat_conversation_keys_user_lookup
  ON public.chat_conversation_keys(user_id, conversation_id, key_version DESC);

CREATE UNIQUE INDEX uq_chat_blocks_blocker_blocked
  ON public.chat_blocks(blocker_id, blocked_id);

CREATE INDEX idx_chat_blocks_blocked
  ON public.chat_blocks(blocked_id, created_at DESC);

CREATE TRIGGER trg_chat_conversations_updated
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_chat_participants_updated
  BEFORE UPDATE ON public.chat_participants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_chat_messages_updated
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_chat_user_keypairs_updated
  BEFORE UPDATE ON public.chat_user_keypairs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION public.chat_enforce_participant_rules()
RETURNS TRIGGER AS $$
DECLARE
  conversation_type TEXT;
  dm_low UUID;
  dm_high UUID;
  active_count INTEGER;
BEGIN
  SELECT c.type, c.dm_user_low, c.dm_user_high
  INTO conversation_type, dm_low, dm_high
  FROM public.chat_conversations c
  WHERE c.id = NEW.conversation_id;

  IF conversation_type IS NULL THEN
    RAISE EXCEPTION 'Conversation % not found for participant row.', NEW.conversation_id;
  END IF;

  IF conversation_type = 'dm' THEN
    IF NEW.user_id IS DISTINCT FROM dm_low AND NEW.user_id IS DISTINCT FROM dm_high THEN
      RAISE EXCEPTION 'DM participant must match canonical DM pair.';
    END IF;

    IF NEW.status = 'active' THEN
      SELECT COUNT(*)
      INTO active_count
      FROM public.chat_participants cp
      WHERE cp.conversation_id = NEW.conversation_id
        AND cp.status = 'active'
        AND (TG_OP <> 'UPDATE' OR cp.id <> NEW.id);

      IF active_count >= 2 THEN
        RAISE EXCEPTION 'DM conversations cannot exceed two active participants.';
      END IF;
    END IF;
  END IF;

  IF NEW.status IN ('left', 'removed') AND NEW.left_at IS NULL THEN
    NEW.left_at := NOW();
  END IF;

  IF NEW.status = 'active' THEN
    NEW.left_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_participants_enforce
  BEFORE INSERT OR UPDATE ON public.chat_participants
  FOR EACH ROW EXECUTE FUNCTION public.chat_enforce_participant_rules();

CREATE OR REPLACE FUNCTION public.chat_sync_conversation_after_message_mutation()
RETURNS TRIGGER AS $$
DECLARE
  target_conversation_id UUID;
  latest_message_id UUID;
  latest_message_at TIMESTAMPTZ;
  visible_message_count INTEGER;
BEGIN
  target_conversation_id := COALESCE(NEW.conversation_id, OLD.conversation_id);

  IF target_conversation_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*)
  INTO visible_message_count
  FROM public.chat_messages m
  WHERE m.conversation_id = target_conversation_id
    AND m.is_deleted = FALSE;

  SELECT m.id, m.created_at
  INTO latest_message_id, latest_message_at
  FROM public.chat_messages m
  WHERE m.conversation_id = target_conversation_id
    AND m.is_deleted = FALSE
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1;

  UPDATE public.chat_conversations c
  SET
    message_count = COALESCE(visible_message_count, 0),
    last_message_id = latest_message_id,
    last_message_at = latest_message_at,
    updated_at = NOW()
  WHERE c.id = target_conversation_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_conversation_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_sync_conversation_after_message_mutation();
