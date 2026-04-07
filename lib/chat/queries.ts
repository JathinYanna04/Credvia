import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ChatConversationSummary,
  ChatMessageRecord,
  ChatMessageType,
  ChatPresenceStatus,
  ChatThreadPage,
} from '@/lib/chat/contracts';
import { ChatServiceError } from '@/lib/chat/errors';
import { isRecoverableSupabaseReadError } from '@/lib/supabase/helpers';
import type { Database, Json } from '@/lib/supabase/types';

type TypedSupabaseClient = SupabaseClient<Database>;
type ChatConversationRow = Database['public']['Tables']['chat_conversations']['Row'];
type ChatParticipantRow = Database['public']['Tables']['chat_participants']['Row'];
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
type ChatConversationKeyRow =
  Database['public']['Tables']['chat_conversation_keys']['Row'];
type ChatUserKeypairRow = Database['public']['Tables']['chat_user_keypairs']['Row'];
type ChatUserPresenceRow = Database['public']['Tables']['chat_user_presence']['Row'];

type ParticipantProfile = {
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  headline: string | null;
  primary_persona: string | null;
};

export interface ListConversationsInput {
  cursor?: number;
  limit?: number;
}

export interface ConversationKeyEnvelopeInput {
  userId: string;
  encryptedConversationKey: string;
  keyEncryptionAlgorithm: string;
  keyVersion?: number;
}

export interface CreateOrGetDmConversationInput {
  requesterUserId: string;
  targetUserId: string;
  wrappedKeys?: ConversationKeyEnvelopeInput[];
}

export interface CreateOrGetDmConversationResult {
  conversation: ChatConversationRow;
  created: boolean;
  recoveredFromUniqueConflict: boolean;
}

export interface CreateOrJoinIdeaConversationInput {
  requesterUserId: string;
  ideaId: string;
  join?: boolean;
  wrappedKeys?: ConversationKeyEnvelopeInput[];
}

export interface SendEncryptedMessageInput {
  conversationId: string;
  senderId: string;
  ciphertext: string;
  iv: string;
  algorithm: string;
  keyVersion: number;
  clientGeneratedId?: string;
  payloadMeta?: Record<string, unknown> | null;
  replyToMessageId?: string;
}

export interface UpsertConversationKeyInput {
  conversationId: string;
  userId: string;
  encryptedConversationKey: string;
  keyEncryptionAlgorithm: string;
  keyVersion?: number;
}

export interface UpdateConversationPreferencesInput {
  conversationId: string;
  userId: string;
  notificationsMuted?: boolean;
  isPinned?: boolean;
}

export interface UpdateChatPresenceInput {
  userId: string;
  status?: ChatPresenceStatus;
  heartbeatOnly?: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizePagination(input: ListConversationsInput) {
  const limit = clamp(Number.isFinite(input.limit) ? Number(input.limit) : 20, 1, 50);
  const cursor =
    Number.isFinite(input.cursor) && Number(input.cursor) >= 0
      ? Math.floor(Number(input.cursor))
      : 0;

  return { limit, cursor };
}

function assertUuidCandidate(value: string, fieldName: string) {
  if (!/^[0-9a-fA-F-]{32,36}$/.test(value)) {
    throw new ChatServiceError('VALIDATION_ERROR', `Invalid ${fieldName}.`, 400);
  }
}

function toMessageRecord(row: ChatMessageRow): ChatMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    messageType: row.message_type as ChatMessageType,
    ciphertext: row.ciphertext,
    iv: row.iv,
    algorithm: row.algorithm,
    keyVersion: row.key_version,
    payloadMeta: row.payload_meta,
    clientGeneratedId: row.client_generated_id,
    replyToMessageId: row.reply_to_message_id,
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertActiveParticipant(
  supabase: TypedSupabaseClient,
  conversationId: string,
  userId: string,
) {
  const participantResult = await supabase
    .from('chat_participants')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (participantResult.error) {
    throw new Error(participantResult.error.message);
  }

  if (!participantResult.data) {
    throw new ChatServiceError('FORBIDDEN', 'You are not a participant in this conversation.', 403);
  }

  return participantResult.data as ChatParticipantRow;
}

function toSourceHref(sourceType: string | null, sourceId: string | null) {
  if (!sourceType || !sourceId) {
    return null;
  }

  if (sourceType === 'idea') {
    return `/ideas/${sourceId}`;
  }

  if (sourceType === 'opportunity') {
    return `/career/jobs/${sourceId}`;
  }

  if (sourceType === 'career_match') {
    return '/career-match';
  }

  if (sourceType === 'community') {
    return `/c/${sourceId}`;
  }

  return null;
}

function normalizePresenceStatus(status: string | null | undefined): ChatPresenceStatus {
  if (status === 'online' || status === 'away') {
    return status;
  }

  return 'offline';
}

async function loadConversationSummaries(
  supabase: TypedSupabaseClient,
  userId: string,
  conversations: ChatConversationRow[],
): Promise<ChatConversationSummary[]> {
  if (conversations.length === 0) {
    return [];
  }

  const conversationIds = conversations.map((conversation) => conversation.id);
  const ownParticipantsResult = await supabase
    .from('chat_participants')
    .select(
      'conversation_id, user_id, status, role, joined_at, last_read_message_id, last_read_at, notifications_muted, is_pinned, pinned_at',
    )
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('conversation_id', conversationIds);

  if (ownParticipantsResult.error) {
    throw new Error(ownParticipantsResult.error.message);
  }

  const allParticipantsResult = await supabase
    .from('chat_participants')
    .select('conversation_id, user_id, status')
    .eq('status', 'active')
    .in('conversation_id', conversationIds);

  if (allParticipantsResult.error) {
    throw new Error(allParticipantsResult.error.message);
  }

  const ownParticipantByConversation = new Map(
    (ownParticipantsResult.data ?? []).map((participant) => [
      participant.conversation_id,
      participant,
    ]),
  );

  const participantsByConversation = new Map<string, string[]>();
  for (const participant of allParticipantsResult.data ?? []) {
    const current = participantsByConversation.get(participant.conversation_id) ?? [];
    current.push(participant.user_id);
    participantsByConversation.set(participant.conversation_id, current);
  }

  const lastMessageIds = conversations
    .map((conversation) => conversation.last_message_id)
    .filter((messageId): messageId is string => Boolean(messageId));

  const lastMessageMap = new Map<string, ChatMessageRow>();
  if (lastMessageIds.length > 0) {
    const lastMessagesResult = await supabase
      .from('chat_messages')
      .select('id, conversation_id, sender_id, message_type, is_deleted, created_at, updated_at, ciphertext, iv, algorithm, key_version, payload_meta, client_generated_id, reply_to_message_id, deleted_at')
      .in('id', lastMessageIds);

    if (lastMessagesResult.error) {
      throw new Error(lastMessagesResult.error.message);
    }

    for (const message of (lastMessagesResult.data ?? []) as ChatMessageRow[]) {
      lastMessageMap.set(message.id, message);
    }
  }

  const sourceIds = new Set<string>();
  for (const conversation of conversations) {
    if (conversation.source_id) {
      sourceIds.add(conversation.source_id);
    }
  }

  const sourceTitleMap = new Map<string, string | null>();
  if (sourceIds.size > 0) {
    const sourceResult = await supabase
      .from('posts')
      .select('id, title')
      .in('id', [...sourceIds]);

    if (sourceResult.error) {
      throw new Error(sourceResult.error.message);
    }

    for (const source of sourceResult.data ?? []) {
      sourceTitleMap.set(source.id, source.title ?? null);
    }
  }

  const counterpartUserIds = new Set<string>();
  for (const conversation of conversations) {
    if (conversation.type !== 'dm') {
      continue;
    }

    const participantIds = participantsByConversation.get(conversation.id) ?? [];
    const counterpartFromParticipants = participantIds.find((participantId) => participantId !== userId);
    const counterpartFromPair =
      conversation.dm_user_low === userId ? conversation.dm_user_high : conversation.dm_user_low;
    const counterpartId = counterpartFromParticipants ?? counterpartFromPair;

    if (counterpartId) {
      counterpartUserIds.add(counterpartId);
    }
  }

  const counterpartProfilesMap = new Map<string, ParticipantProfile>();
  const counterpartIds = [...counterpartUserIds];
  if (counterpartIds.length > 0) {
    const profilesWithPersonaResult = await supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url, headline, primary_persona')
      .in('user_id', counterpartIds);

    if (profilesWithPersonaResult.error && !isRecoverableSupabaseReadError(profilesWithPersonaResult.error)) {
      throw new Error(profilesWithPersonaResult.error.message);
    }

    if (!profilesWithPersonaResult.error) {
      for (const profile of profilesWithPersonaResult.data ?? []) {
        counterpartProfilesMap.set(profile.user_id, profile as ParticipantProfile);
      }
    } else {
      const legacyProfilesResult = await supabase
        .from('profiles')
        .select('user_id, username, full_name, avatar_url')
        .in('user_id', counterpartIds);

      if (legacyProfilesResult.error) {
        throw new Error(legacyProfilesResult.error.message);
      }

      for (const profile of legacyProfilesResult.data ?? []) {
        counterpartProfilesMap.set(profile.user_id, {
          user_id: profile.user_id,
          username: profile.username,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          headline: null,
          primary_persona: null,
        });
      }
    }
  }

  const counterpartPresenceMap = new Map<string, ChatUserPresenceRow>();
  if (counterpartIds.length > 0) {
    const presenceResult = await supabase
      .from('chat_user_presence')
      .select('user_id, status, last_seen_at, updated_at')
      .in('user_id', counterpartIds);

    if (presenceResult.error && !isRecoverableSupabaseReadError(presenceResult.error)) {
      throw new Error(presenceResult.error.message);
    }

    if (!presenceResult.error) {
      for (const presence of presenceResult.data ?? []) {
        counterpartPresenceMap.set(presence.user_id, presence as ChatUserPresenceRow);
      }
    }
  }

  const unreadCounts = new Map<string, number>();
  const unreadMessagesResult = await supabase
    .from('chat_messages')
    .select('conversation_id, created_at, sender_id, is_deleted')
    .in('conversation_id', conversationIds)
    .eq('is_deleted', false)
    .neq('sender_id', userId);

  if (unreadMessagesResult.error) {
    throw new Error(unreadMessagesResult.error.message);
  }

  for (const conversation of conversations) {
    unreadCounts.set(conversation.id, 0);
  }

  for (const message of unreadMessagesResult.data ?? []) {
    const participant = ownParticipantByConversation.get(message.conversation_id);
    const readBoundary = participant?.last_read_at ?? participant?.joined_at ?? null;
    const isUnread = !readBoundary || message.created_at > readBoundary;

    if (!isUnread) {
      continue;
    }

    unreadCounts.set(
      message.conversation_id,
      (unreadCounts.get(message.conversation_id) ?? 0) + 1,
    );
  }

  return conversations.map((conversation) => {
    const ownParticipant = ownParticipantByConversation.get(conversation.id);

    if (!ownParticipant) {
      throw new ChatServiceError(
        'FORBIDDEN',
        'You are not an active participant in this conversation.',
        403,
      );
    }

    let counterpart: ChatConversationSummary['counterpart'] = null;

    if (conversation.type === 'dm') {
      const participantIds = participantsByConversation.get(conversation.id) ?? [];
      const counterpartFromParticipants = participantIds.find((participantId) => participantId !== userId);
      const counterpartFromPair =
        conversation.dm_user_low === userId ? conversation.dm_user_high : conversation.dm_user_low;
      const counterpartId = counterpartFromParticipants ?? counterpartFromPair;

      if (counterpartId) {
        const profile = counterpartProfilesMap.get(counterpartId);
        const presence = counterpartPresenceMap.get(counterpartId);
        counterpart = {
          userId: counterpartId,
          username: profile?.username ?? `user_${counterpartId.slice(0, 8)}`,
          fullName: profile?.full_name ?? profile?.username ?? null,
          avatarUrl: profile?.avatar_url ?? null,
          headline: profile?.headline ?? null,
          primaryPersona: profile?.primary_persona ?? null,
          presence: normalizePresenceStatus(presence?.status),
          lastSeenAt: presence?.last_seen_at ?? null,
        };
      }
    }

    const lastMessage = conversation.last_message_id
      ? lastMessageMap.get(conversation.last_message_id) ?? null
      : null;

    return {
      id: conversation.id,
      type: conversation.type as ChatConversationSummary['type'],
      sourceType: conversation.source_type as ChatConversationSummary['sourceType'],
      sourceId: conversation.source_id,
      title: conversation.title,
      description: conversation.description,
      isArchived: conversation.is_archived,
      lastMessageAt: conversation.last_message_at,
      lastMessageId: conversation.last_message_id,
      messageCount: conversation.message_count,
      unreadCount: unreadCounts.get(conversation.id) ?? 0,
      participant: {
        role: ownParticipant.role as ChatConversationSummary['participant']['role'],
        status: ownParticipant.status as ChatConversationSummary['participant']['status'],
        lastReadMessageId: ownParticipant.last_read_message_id,
        lastReadAt: ownParticipant.last_read_at,
        notificationsMuted: ownParticipant.notifications_muted,
        isPinned: ownParticipant.is_pinned ?? false,
        pinnedAt: ownParticipant.pinned_at ?? null,
      },
      sourceContext:
        conversation.source_id && conversation.source_type
          ? {
              kind:
                conversation.source_type as NonNullable<
                  ChatConversationSummary['sourceContext']
                >['kind'],
              title: sourceTitleMap.get(conversation.source_id) ?? null,
              href: toSourceHref(conversation.source_type, conversation.source_id),
            }
          : null,
      counterpart,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            senderId: lastMessage.sender_id,
            messageType: lastMessage.message_type as ChatMessageType,
            isDeleted: lastMessage.is_deleted,
            createdAt: lastMessage.created_at,
            previewText: null,
          }
        : null,
    };
  });
}

async function ensureDmParticipantsActive(
  supabase: TypedSupabaseClient,
  conversation: ChatConversationRow,
  requesterUserId: string,
  targetUserId: string,
) {
  const existingParticipantsResult = await supabase
    .from('chat_participants')
    .select('user_id, status, role, left_at')
    .eq('conversation_id', conversation.id)
    .in('user_id', [requesterUserId, targetUserId]);

  if (existingParticipantsResult.error) {
    throw new Error(existingParticipantsResult.error.message);
  }

  const existingByUser = new Map<string, {
    user_id: string;
    status: string;
    role: string;
    left_at: string | null;
  }>();

  for (const participant of existingParticipantsResult.data ?? []) {
    existingByUser.set(participant.user_id, {
      user_id: participant.user_id,
      status: participant.status,
      role: participant.role,
      left_at: participant.left_at,
    });
  }

  const missingParticipants: Array<{
    conversation_id: string;
    user_id: string;
    role: string;
    status: 'active';
    left_at: null;
  }> = [];

  for (const userId of [requesterUserId, targetUserId]) {
    const existing = existingByUser.get(userId);
    const inferredRole = conversation.created_by === userId ? 'owner' : 'member';

    if (!existing) {
      missingParticipants.push({
        conversation_id: conversation.id,
        user_id: userId,
        role: inferredRole,
        status: 'active',
        left_at: null,
      });
      continue;
    }

    if (existing.status !== 'active' || existing.left_at !== null) {
      const reactivateResult = await supabase
        .from('chat_participants')
        .update({
          status: 'active',
          left_at: null,
        })
        .eq('conversation_id', conversation.id)
        .eq('user_id', userId);

      if (reactivateResult.error) {
        throw new Error(reactivateResult.error.message);
      }
    }
  }

  if (missingParticipants.length === 0) {
    return;
  }

  const insertMissingResult = await supabase
    .from('chat_participants')
    .insert(missingParticipants);

  if (insertMissingResult.error && insertMissingResult.error.code !== '23505') {
    throw new Error(insertMissingResult.error.message);
  }
}

export async function listConversationSummaries(
  supabase: TypedSupabaseClient,
  userId: string,
  input: ListConversationsInput = {},
) {
  const { limit, cursor } = normalizePagination(input);
  const conversationsResult = await supabase
    .from('chat_conversations')
    .select('*')
    .order('last_message_at', { ascending: false })
    .order('updated_at', { ascending: false })
    .range(cursor, cursor + limit);

  if (conversationsResult.error) {
    throw new Error(conversationsResult.error.message);
  }

  const rows = (conversationsResult.data ?? []) as ChatConversationRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const conversations = await loadConversationSummaries(supabase, userId, pageRows);

  return {
    conversations,
    nextCursor: hasMore ? String(cursor + limit) : null,
  };
}

export async function getConversationSummary(
  supabase: TypedSupabaseClient,
  userId: string,
  conversationId: string,
) {
  const conversationResult = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();

  if (conversationResult.error) {
    throw new Error(conversationResult.error.message);
  }

  if (!conversationResult.data) {
    throw new ChatServiceError('NOT_FOUND', 'Conversation not found.', 404);
  }

  const summaries = await loadConversationSummaries(
    supabase,
    userId,
    [conversationResult.data as ChatConversationRow],
  );

  return summaries[0] ?? null;
}

export async function getConversationThreadPage(
  supabase: TypedSupabaseClient,
  userId: string,
  conversationId: string,
  input: {
    cursor?: string | null;
    limit?: number;
  } = {},
): Promise<ChatThreadPage> {
  await assertActiveParticipant(supabase, conversationId, userId);

  const limit = clamp(Number.isFinite(input.limit) ? Number(input.limit) : 40, 1, 100);
  const cursor = input.cursor?.trim() || null;

  let query = supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    const asDate = new Date(cursor);
    if (Number.isNaN(asDate.getTime())) {
      throw new ChatServiceError('VALIDATION_ERROR', 'Invalid cursor value.', 400);
    }

    query = query.lt('created_at', asDate.toISOString());
  }

  const messagesResult = await query;

  if (messagesResult.error) {
    throw new Error(messagesResult.error.message);
  }

  const rows = (messagesResult.data ?? []) as ChatMessageRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.created_at ?? null : null;

  return {
    messages: pageRows.map(toMessageRecord).reverse(),
    nextCursor,
  };
}

export async function sendEncryptedMessage(
  supabase: TypedSupabaseClient,
  input: SendEncryptedMessageInput,
): Promise<ChatMessageRecord> {
  await assertActiveParticipant(supabase, input.conversationId, input.senderId);

  const conversationResult = await supabase
    .from('chat_conversations')
    .select('id, is_archived')
    .eq('id', input.conversationId)
    .maybeSingle();

  if (conversationResult.error) {
    throw new Error(conversationResult.error.message);
  }

  if (!conversationResult.data) {
    throw new ChatServiceError('NOT_FOUND', 'Conversation not found.', 404);
  }

  if (conversationResult.data.is_archived) {
    throw new ChatServiceError('FORBIDDEN', 'Conversation is archived.', 403);
  }

  const insertResult = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      message_type: 'text',
      ciphertext: input.ciphertext,
      iv: input.iv,
      algorithm: input.algorithm,
      key_version: input.keyVersion,
      payload_meta: (input.payloadMeta ?? null) as Json,
      client_generated_id: input.clientGeneratedId ?? null,
      reply_to_message_id: input.replyToMessageId ?? null,
    })
    .select('*')
    .single();

  let row = insertResult.data as ChatMessageRow | null;

  if (insertResult.error) {
    if (insertResult.error.code === '23505' && input.clientGeneratedId) {
      const duplicateResult = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', input.conversationId)
        .eq('client_generated_id', input.clientGeneratedId)
        .maybeSingle();

      if (duplicateResult.error) {
        throw new Error(duplicateResult.error.message);
      }

      if (!duplicateResult.data) {
        throw new Error(insertResult.error.message);
      }

      row = duplicateResult.data as ChatMessageRow;
    } else {
      throw new Error(insertResult.error.message);
    }
  }

  if (!row) {
    throw new Error('Message could not be created.');
  }

  const markReadResult = await supabase
    .from('chat_participants')
    .update({
      last_read_message_id: row.id,
      last_read_at: row.created_at,
    })
    .eq('conversation_id', input.conversationId)
    .eq('user_id', input.senderId);

  if (markReadResult.error) {
    throw new Error(markReadResult.error.message);
  }

  return toMessageRecord(row);
}

export async function markConversationRead(
  supabase: TypedSupabaseClient,
  userId: string,
  conversationId: string,
  lastReadMessageId?: string,
) {
  await assertActiveParticipant(supabase, conversationId, userId);

  let resolvedMessageId: string | null = null;
  let resolvedReadAt = new Date().toISOString();

  if (lastReadMessageId) {
    const messageResult = await supabase
      .from('chat_messages')
      .select('id, conversation_id, created_at')
      .eq('id', lastReadMessageId)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (messageResult.error) {
      throw new Error(messageResult.error.message);
    }

    if (!messageResult.data) {
      throw new ChatServiceError('NOT_FOUND', 'Message not found in this conversation.', 404);
    }

    resolvedMessageId = messageResult.data.id;
    resolvedReadAt = messageResult.data.created_at;
  } else {
    const conversationResult = await supabase
      .from('chat_conversations')
      .select('last_message_id, last_message_at')
      .eq('id', conversationId)
      .maybeSingle();

    if (conversationResult.error) {
      throw new Error(conversationResult.error.message);
    }

    if (!conversationResult.data) {
      throw new ChatServiceError('NOT_FOUND', 'Conversation not found.', 404);
    }

    resolvedMessageId = conversationResult.data.last_message_id;
    if (conversationResult.data.last_message_at) {
      resolvedReadAt = conversationResult.data.last_message_at;
    }
  }

  const updateResult = await supabase
    .from('chat_participants')
    .update({
      last_read_message_id: resolvedMessageId,
      last_read_at: resolvedReadAt,
    })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }

  return {
    conversationId,
    lastReadMessageId: resolvedMessageId,
    lastReadAt: resolvedReadAt,
  };
}

export async function updateConversationPreferences(
  supabase: TypedSupabaseClient,
  input: UpdateConversationPreferencesInput,
) {
  await assertActiveParticipant(supabase, input.conversationId, input.userId);

  const update: {
    notifications_muted?: boolean;
    is_pinned?: boolean;
    pinned_at?: string | null;
  } = {};

  if (typeof input.notificationsMuted === 'boolean') {
    update.notifications_muted = input.notificationsMuted;
  }

  if (typeof input.isPinned === 'boolean') {
    update.is_pinned = input.isPinned;
    update.pinned_at = input.isPinned ? new Date().toISOString() : null;
  }

  if (Object.keys(update).length === 0) {
    throw new ChatServiceError(
      'VALIDATION_ERROR',
      'At least one preference field is required.',
      400,
    );
  }

  const result = await supabase
    .from('chat_participants')
    .update(update)
    .eq('conversation_id', input.conversationId)
    .eq('user_id', input.userId)
    .eq('status', 'active')
    .select('conversation_id, user_id, notifications_muted, is_pinned, pinned_at, updated_at')
    .single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return {
    conversationId: result.data.conversation_id,
    userId: result.data.user_id,
    notificationsMuted: result.data.notifications_muted,
    isPinned: result.data.is_pinned ?? false,
    pinnedAt: result.data.pinned_at ?? null,
    updatedAt: result.data.updated_at,
  };
}

export async function updateChatPresence(
  supabase: TypedSupabaseClient,
  input: UpdateChatPresenceInput,
) {
  const existingResult = await supabase
    .from('chat_user_presence')
    .select('user_id, status')
    .eq('user_id', input.userId)
    .maybeSingle();

  if (existingResult.error && !isRecoverableSupabaseReadError(existingResult.error)) {
    throw new Error(existingResult.error.message);
  }

  const now = new Date().toISOString();
  const fallbackStatus: ChatPresenceStatus = existingResult.data
    ? normalizePresenceStatus(existingResult.data.status)
    : 'online';
  const status = input.status ?? fallbackStatus;

  const upsertResult = await supabase
    .from('chat_user_presence')
    .upsert(
      {
        user_id: input.userId,
        status,
        last_seen_at: now,
        updated_at: now,
      },
      {
        onConflict: 'user_id',
      },
    )
    .select('user_id, status, last_seen_at, updated_at')
    .single();

  if (upsertResult.error) {
    throw new Error(upsertResult.error.message);
  }

  return {
    userId: upsertResult.data.user_id,
    status: normalizePresenceStatus(upsertResult.data.status),
    lastSeenAt: upsertResult.data.last_seen_at,
    updatedAt: upsertResult.data.updated_at,
    heartbeatOnly: input.heartbeatOnly ?? false,
  };
}

function canonicalDmPair(a: string, b: string) {
  return a < b ? ([a, b] as const) : ([b, a] as const);
}

function normalizeWrappedKeys(input: ConversationKeyEnvelopeInput[]) {
  const dedupedMap = new Map<string, UpsertConversationKeyInput>();

  for (const key of input) {
    const version = key.keyVersion && key.keyVersion > 0 ? key.keyVersion : 1;
    const dedupeKey = `${key.userId}:${version}`;

    dedupedMap.set(dedupeKey, {
      conversationId: '',
      userId: key.userId,
      encryptedConversationKey: key.encryptedConversationKey,
      keyEncryptionAlgorithm: key.keyEncryptionAlgorithm,
      keyVersion: version,
    });
  }

  return [...dedupedMap.values()];
}

export async function upsertConversationKeys(
  supabase: TypedSupabaseClient,
  keys: UpsertConversationKeyInput[],
) {
  if (keys.length === 0) {
    return;
  }

  const result = await supabase.from('chat_conversation_keys').upsert(
    keys.map((key) => ({
      conversation_id: key.conversationId,
      user_id: key.userId,
      encrypted_conversation_key: key.encryptedConversationKey,
      key_encryption_algorithm: key.keyEncryptionAlgorithm,
      key_version: key.keyVersion && key.keyVersion > 0 ? key.keyVersion : 1,
    })),
    {
      onConflict: 'conversation_id,user_id,key_version',
    },
  );

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function createOrGetDmConversation(
  supabase: TypedSupabaseClient,
  input: CreateOrGetDmConversationInput,
) {
  const { requesterUserId, targetUserId, wrappedKeys } = input;

  assertUuidCandidate(requesterUserId, 'requester user id');
  assertUuidCandidate(targetUserId, 'target user id');

  if (requesterUserId === targetUserId) {
    throw new ChatServiceError('VALIDATION_ERROR', 'Cannot start a DM with yourself.', 400);
  }

  const targetUserResult = await supabase
    .from('users')
    .select('id')
    .eq('id', targetUserId)
    .maybeSingle();

  if (targetUserResult.error) {
    throw new Error(targetUserResult.error.message);
  }

  if (!targetUserResult.data) {
    throw new ChatServiceError('NOT_FOUND', 'Target user not found.', 404);
  }

  const blockResult = await supabase
    .from('chat_blocks')
    .select('id')
    .or(`and(blocker_id.eq.${requesterUserId},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${requesterUserId})`)
    .limit(1);

  if (blockResult.error) {
    throw new Error(blockResult.error.message);
  }

  if ((blockResult.data ?? []).length > 0) {
    throw new ChatServiceError('FORBIDDEN', 'Cannot start a conversation due to block settings.', 403);
  }

  const [dmUserLow, dmUserHigh] = canonicalDmPair(requesterUserId, targetUserId);
  const existingResult = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('type', 'dm')
    .eq('dm_user_low', dmUserLow)
    .eq('dm_user_high', dmUserHigh)
    .maybeSingle();

  if (existingResult.error) {
    throw new Error(existingResult.error.message);
  }

  let conversation = existingResult.data as ChatConversationRow | null;
  let created = false;
  let recoveredFromUniqueConflict = false;

  if (!conversation) {
    const insertResult = await supabase
      .from('chat_conversations')
      .insert({
        type: 'dm',
        created_by: requesterUserId,
        dm_user_low: dmUserLow,
        dm_user_high: dmUserHigh,
      })
      .select('*')
      .single();

    if (insertResult.error) {
      if (insertResult.error.code === '23505') {
        recoveredFromUniqueConflict = true;
        const retryResult = await supabase
          .from('chat_conversations')
          .select('*')
          .eq('type', 'dm')
          .eq('dm_user_low', dmUserLow)
          .eq('dm_user_high', dmUserHigh)
          .maybeSingle();

        if (retryResult.error) {
          throw new Error(retryResult.error.message);
        }

        if (!retryResult.data) {
          throw new Error(insertResult.error.message);
        }

        conversation = retryResult.data as ChatConversationRow;
      } else {
        throw new Error(insertResult.error.message);
      }
    } else {
      conversation = insertResult.data as ChatConversationRow;
      created = true;
    }
  }

  if (!conversation) {
    throw new Error('Conversation could not be created.');
  }

  await ensureDmParticipantsActive(
    supabase,
    conversation,
    requesterUserId,
    targetUserId,
  );

  if ((wrappedKeys ?? []).length > 0) {
    const keyCountResult = await supabase
      .from('chat_conversation_keys')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id);

    if (keyCountResult.error) {
      throw new Error(keyCountResult.error.message);
    }

    const canProvisionWrappedKeys = (keyCountResult.count ?? 0) === 0;

    if (canProvisionWrappedKeys) {
      const normalized = normalizeWrappedKeys(wrappedKeys ?? []);
      const allowedUserIds = new Set([requesterUserId, targetUserId]);

      for (const key of normalized) {
        if (!allowedUserIds.has(key.userId)) {
          throw new ChatServiceError('VALIDATION_ERROR', 'Wrapped key user is not a DM participant.', 400);
        }
      }

      await upsertConversationKeys(
        supabase,
        normalized.map((key) => ({
          ...key,
          conversationId: conversation!.id,
        })),
      );
    }
  }

  return {
    conversation,
    created,
    recoveredFromUniqueConflict,
  } as CreateOrGetDmConversationResult;
}

export async function createOrJoinIdeaConversation(
  supabase: TypedSupabaseClient,
  input: CreateOrJoinIdeaConversationInput,
) {
  const {
    requesterUserId,
    ideaId,
    join = true,
    wrappedKeys,
  } = input;

  assertUuidCandidate(requesterUserId, 'requester user id');
  assertUuidCandidate(ideaId, 'idea id');

  const ideaResult = await supabase
    .from('posts')
    .select('id, author_id, post_type, status, title')
    .eq('id', ideaId)
    .eq('post_type', 'startup_idea')
    .maybeSingle();

  if (ideaResult.error) {
    throw new Error(ideaResult.error.message);
  }

  if (!ideaResult.data || ideaResult.data.status !== 'published') {
    throw new ChatServiceError('NOT_FOUND', 'Published startup idea not found.', 404);
  }

  const ownerUserId = ideaResult.data.author_id;
  const isOwner = ownerUserId === requesterUserId;

  const existingResult = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('type', 'idea_group')
    .eq('source_type', 'idea')
    .eq('source_id', ideaId)
    .maybeSingle();

  if (existingResult.error) {
    throw new Error(existingResult.error.message);
  }

  let conversation = existingResult.data as ChatConversationRow | null;

  if (!conversation) {
    const insertResult = await supabase
      .from('chat_conversations')
      .insert({
        type: 'idea_group',
        source_type: 'idea',
        source_id: ideaId,
        created_by: ownerUserId,
        title: ideaResult.data.title ? `${ideaResult.data.title} chat` : null,
      })
      .select('*')
      .single();

    if (insertResult.error) {
      if (insertResult.error.code === '23505') {
        const retryResult = await supabase
          .from('chat_conversations')
          .select('*')
          .eq('type', 'idea_group')
          .eq('source_type', 'idea')
          .eq('source_id', ideaId)
          .maybeSingle();

        if (retryResult.error) {
          throw new Error(retryResult.error.message);
        }

        if (!retryResult.data) {
          throw new Error(insertResult.error.message);
        }

        conversation = retryResult.data as ChatConversationRow;
      } else {
        throw new Error(insertResult.error.message);
      }
    } else {
      conversation = insertResult.data as ChatConversationRow;
    }
  }

  if (!conversation) {
    throw new Error('Conversation could not be created.');
  }

  const ensureOwnerParticipantResult = await supabase.from('chat_participants').upsert(
    {
      conversation_id: conversation.id,
      user_id: ownerUserId,
      role: 'owner',
      status: 'active',
      left_at: null,
    },
    {
      onConflict: 'conversation_id,user_id',
    },
  );

  if (ensureOwnerParticipantResult.error) {
    throw new Error(ensureOwnerParticipantResult.error.message);
  }

  if (join) {
    const joinParticipantResult = await supabase.from('chat_participants').upsert(
      {
        conversation_id: conversation.id,
        user_id: requesterUserId,
        role: isOwner ? 'owner' : 'member',
        status: 'active',
        left_at: null,
      },
      {
        onConflict: 'conversation_id,user_id',
      },
    );

    if (joinParticipantResult.error) {
      throw new Error(joinParticipantResult.error.message);
    }
  }

  if ((wrappedKeys ?? []).length > 0) {
    const keyCountResult = await supabase
      .from('chat_conversation_keys')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id);

    if (keyCountResult.error) {
      throw new Error(keyCountResult.error.message);
    }

    const canProvisionWrappedKeys = (keyCountResult.count ?? 0) === 0;

    if (canProvisionWrappedKeys) {
      const normalized = normalizeWrappedKeys(wrappedKeys ?? []);
      await upsertConversationKeys(
        supabase,
        normalized.map((key) => ({
          ...key,
          conversationId: conversation!.id,
        })),
      );
    }
  }

  return conversation;
}

export async function getLatestConversationKeyForUser(
  supabase: TypedSupabaseClient,
  conversationId: string,
  userId: string,
): Promise<ChatConversationKeyRow | null> {
  const keyResult = await supabase
    .from('chat_conversation_keys')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .order('key_version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (keyResult.error) {
    throw new Error(keyResult.error.message);
  }

  return (keyResult.data as ChatConversationKeyRow | null) ?? null;
}

export async function upsertUserKeypair(
  supabase: TypedSupabaseClient,
  userId: string,
  input: {
    publicKey: string;
    algorithm: string;
    keyVersion?: number;
  },
): Promise<ChatUserKeypairRow> {
  const result = await supabase
    .from('chat_user_keypairs')
    .upsert(
      {
        user_id: userId,
        public_key: input.publicKey,
        algorithm: input.algorithm,
        key_version: input.keyVersion && input.keyVersion > 0 ? input.keyVersion : 1,
      },
      {
        onConflict: 'user_id',
      },
    )
    .select('*')
    .single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data as ChatUserKeypairRow;
}

export async function getUserKeypair(
  supabase: TypedSupabaseClient,
  userId: string,
): Promise<ChatUserKeypairRow | null> {
  const result = await supabase
    .from('chat_user_keypairs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data as ChatUserKeypairRow | null) ?? null;
}

export async function getUserPublicKey(
  supabase: TypedSupabaseClient,
  userId: string,
): Promise<ChatUserKeypairRow | null> {
  const result = await supabase
    .from('chat_user_keypairs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data as ChatUserKeypairRow | null) ?? null;
}

export async function softDeleteOwnMessage(
  supabase: TypedSupabaseClient,
  messageId: string,
  requesterUserId: string,
): Promise<ChatMessageRecord> {
  const messageResult = await supabase
    .from('chat_messages')
    .select('*')
    .eq('id', messageId)
    .maybeSingle();

  if (messageResult.error) {
    throw new Error(messageResult.error.message);
  }

  const message = messageResult.data as ChatMessageRow | null;

  if (!message) {
    throw new ChatServiceError('NOT_FOUND', 'Message not found.', 404);
  }

  if (message.sender_id !== requesterUserId) {
    throw new ChatServiceError('FORBIDDEN', 'You can only delete your own messages.', 403);
  }

  if (message.is_deleted) {
    return toMessageRecord(message);
  }

  const updateResult = await supabase
    .from('chat_messages')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      ciphertext: null,
      iv: null,
      algorithm: null,
      key_version: null,
      payload_meta: null,
    })
    .eq('id', messageId)
    .select('*')
    .single();

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }

  return toMessageRecord(updateResult.data as ChatMessageRow);
}
