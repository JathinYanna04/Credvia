'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCheck,
  ChevronLeft,
  MessageSquare,
  MoreHorizontal,
  Pin,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown';
import { Textarea } from '@/components/ui/textarea';
import { bootstrapDirectMessageConversation } from '@/lib/chat/bootstrap-client';
import type {
  ChatConversationSummary,
  ChatMessageReactionRecord,
  ChatMessageRecord,
} from '@/lib/chat/contracts';
import {
  decryptMessageContent,
  encryptMessageContent,
  exportConversationKeyRaw,
  generateClientGeneratedId,
  generateUserKeyPair,
  importConversationKeyRaw,
  unwrapConversationKeyForParticipant,
} from '@/lib/chat/crypto';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
import type { ApiResponse } from '@/lib/types';
import { logInfo } from '@/lib/utils/logger';
import { cn } from '@/lib/utils/cn';
import { formatCompactRelativeTime } from '@/lib/utils/format';

interface ConversationThreadClientProps {
  conversationId: string;
  currentUserId: string;
  conversation: ChatConversationSummary;
  initialMessages: ChatMessageRecord[];
  initialNextCursor: string | null;
  showBackLink?: boolean;
}

type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
type ChatParticipantRow = Database['public']['Tables']['chat_participants']['Row'];
type ChatMessageReactionRow =
  Database['public']['Tables']['chat_message_reactions']['Row'];

interface LocalUserKeypair {
  publicKey: string;
  privateKey: string;
  algorithm: string;
  keyVersion: number;
}

interface ConversationKeyPayload {
  conversationId: string;
  userId: string;
  encryptedConversationKey: string;
  keyEncryptionAlgorithm: string;
  keyVersion: number;
  createdAt: string;
  rotatedAt: string | null;
}

interface LocalThreadMessage extends ChatMessageRecord {
  localState?: 'sending' | 'failed';
  localError?: string | null;
}

interface RenderedMessage extends LocalThreadMessage {
  mine: boolean;
  text: string;
}

type TimelineItem =
  | {
      kind: 'date';
      key: string;
      label: string;
    }
  | {
      kind: 'message';
      key: string;
      message: RenderedMessage;
      groupedWithPrevious: boolean;
      groupedWithNext: boolean;
      showAvatar: boolean;
      showInlineTimestamp: boolean;
    };

interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

const USER_KEYPAIR_STORAGE_KEY = 'credvia.chat.user-keypair.v1';
const QUICK_REACTIONS = ['❤️', '👍', '😂', '👏', '🔥'] as const;

function conversationKeyStorageKey(conversationId: string) {
  return `credvia.chat.conversation-key.${conversationId}.v1`;
}

function conversationDraftStorageKey(conversationId: string) {
  return `credvia.chat.draft.${conversationId}.v1`;
}

function getSourceContextChipLabel(sourceType: ChatConversationSummary['sourceType']) {
  if (sourceType === 'idea') {
    return 'From Startup Idea';
  }

  if (sourceType === 'opportunity') {
    return 'From Opportunity';
  }

  if (sourceType === 'career_match') {
    return 'From Career Match';
  }

  if (sourceType === 'community') {
    return 'From Community';
  }

  return null;
}

function getMessageTimeLabel(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function getDateSeparatorLabel(value: string, options?: { includeRelativeDay?: boolean }) {
  const candidate = new Date(value);

  if (!options?.includeRelativeDay) {
    return candidate.toISOString().slice(0, 10);
  }

  const now = new Date();

  const candidateMidnight = new Date(candidate);
  candidateMidnight.setHours(0, 0, 0, 0);

  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);

  const diffDays = Math.round((todayMidnight.getTime() - candidateMidnight.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return 'Today';
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  return candidate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: candidate.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

function isGroupedMessage(
  previous: Pick<ChatMessageRecord, 'senderId' | 'createdAt'> | null,
  current: Pick<ChatMessageRecord, 'senderId' | 'createdAt'>,
) {
  if (!previous || !previous.senderId || !current.senderId || previous.senderId !== current.senderId) {
    return false;
  }

  const gapMs = Math.abs(Date.parse(current.createdAt) - Date.parse(previous.createdAt));
  return gapMs < 5 * 60 * 1000;
}

function toMessageRecord(row: ChatMessageRow): ChatMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    messageType: row.message_type as ChatMessageRecord['messageType'],
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

function toReactionRecord(row: ChatMessageReactionRow): ChatMessageReactionRecord {
  return {
    id: row.id,
    messageId: row.message_id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    emoji: row.emoji,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function aggregateReactions(
  reactions: ChatMessageReactionRecord[] | undefined,
  currentUserId: string,
) {
  const byEmoji = new Map<string, ReactionSummary>();

  for (const reaction of reactions ?? []) {
    const existing = byEmoji.get(reaction.emoji);
    if (!existing) {
      byEmoji.set(reaction.emoji, {
        emoji: reaction.emoji,
        count: 1,
        reactedByMe: reaction.userId === currentUserId,
      });
      continue;
    }

    existing.count += 1;
    if (reaction.userId === currentUserId) {
      existing.reactedByMe = true;
    }
  }

  return [...byEmoji.values()].sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count;
    }

    return left.emoji.localeCompare(right.emoji);
  });
}

function isMessageSeenByCounterpart(
  message: Pick<ChatMessageRecord, 'createdAt' | 'senderId'>,
  counterpart: ChatConversationSummary['counterpart'],
  currentUserId: string,
) {
  if (!counterpart || message.senderId !== currentUserId) {
    return false;
  }

  if (!counterpart.lastReadAt) {
    return false;
  }

  return Date.parse(counterpart.lastReadAt) >= Date.parse(message.createdAt);
}

function sortMessages(
  left: Pick<ChatMessageRecord, 'createdAt' | 'id'>,
  right: Pick<ChatMessageRecord, 'createdAt' | 'id'>,
) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.id.localeCompare(right.id);
}

function mergeMessage(previous: LocalThreadMessage[], incoming: ChatMessageRecord) {
  const normalized: LocalThreadMessage = {
    ...incoming,
    localState: undefined,
    localError: null,
  };

  const indexById = previous.findIndex((message) => message.id === incoming.id);
  if (indexById >= 0) {
    return previous
      .map((message, index) => (index === indexById ? { ...message, ...normalized } : message))
      .sort(sortMessages);
  }

  if (incoming.clientGeneratedId) {
    const indexByClientId = previous.findIndex(
      (message) => message.clientGeneratedId === incoming.clientGeneratedId,
    );

    if (indexByClientId >= 0) {
      return previous
        .map((message, index) =>
          index === indexByClientId ? { ...message, ...normalized } : message,
        )
        .sort(sortMessages);
    }
  }

  return [...previous, normalized].sort(sortMessages);
}

function readStoredUserKeypair() {
  const raw = localStorage.getItem(USER_KEYPAIR_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as LocalUserKeypair;
  } catch {
    localStorage.removeItem(USER_KEYPAIR_STORAGE_KEY);
    return null;
  }
}

function saveStoredUserKeypair(keypair: LocalUserKeypair) {
  localStorage.setItem(USER_KEYPAIR_STORAGE_KEY, JSON.stringify(keypair));
}

async function ensureLocalUserKeypair() {
  const existing = readStoredUserKeypair();
  if (existing) {
    logInfo('chat-setup', 'Loaded local keypair', {
      source: 'storage',
      keyVersion: existing.keyVersion,
    });
    return existing;
  }

  logInfo('chat-setup', 'Generating local keypair');

  try {
    const generated = await generateUserKeyPair();
    const created: LocalUserKeypair = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      algorithm: generated.algorithm,
      keyVersion: generated.keyVersion,
    };

    saveStoredUserKeypair(created);
    logInfo('chat-setup', 'Local keypair generated', {
      keyVersion: created.keyVersion,
      algorithm: created.algorithm,
    });
    return created;
  } catch (error) {
    logInfo('chat-setup', 'Local keypair generation failed', {
      reason: error instanceof Error ? error.message : 'unknown_error',
    });
    throw error;
  }
}

async function syncPublicKey(keypair: LocalUserKeypair) {
  logInfo('chat-setup', 'Syncing public key', {
    keyVersion: keypair.keyVersion,
    algorithm: keypair.algorithm,
  });

  const response = await fetch('/api/v1/chat/me/keypair', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      publicKey: keypair.publicKey,
      algorithm: keypair.algorithm,
      keyVersion: keypair.keyVersion,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
    logInfo('chat-setup', 'Public key sync failed', {
      reason: payload?.error?.message ?? 'unknown_error',
    });
    throw new Error(payload?.error?.message ?? 'Unable to sync your chat keypair.');
  }

  logInfo('chat-setup', 'Public key sync succeeded', {
    keyVersion: keypair.keyVersion,
  });
}

async function resolveConversationKey(
  conversationId: string,
  privateKey: string,
): Promise<{ key: CryptoKey | null; keyVersion: number }> {
  const storedRawKey = localStorage.getItem(conversationKeyStorageKey(conversationId));

  if (storedRawKey) {
    logInfo('chat-setup', 'Importing cached conversation key', {
      conversationId,
      source: 'local_storage',
    });

    try {
      return {
        key: await importConversationKeyRaw(storedRawKey),
        keyVersion: 1,
      };
    } catch (error) {
      localStorage.removeItem(conversationKeyStorageKey(conversationId));
      logInfo('chat-setup', 'Cached conversation key import failed', {
        conversationId,
        reason: error instanceof Error ? error.message : 'unknown_error',
      });
    }
  }

  logInfo('chat-setup', 'Fetching conversation key envelope', {
    conversationId,
  });

  const keyResponse = await fetch(`/api/v1/chat/conversations/${conversationId}/key`, {
    method: 'GET',
  });

  if (keyResponse.status === 404) {
    return {
      key: null,
      keyVersion: 1,
    };
  }

  if (!keyResponse.ok) {
    const payload = (await keyResponse.json().catch(() => null)) as ApiResponse<unknown> | null;
    throw new Error(payload?.error?.message ?? 'Unable to load your conversation key.');
  }

  const payload = (await keyResponse.json()) as ApiResponse<ConversationKeyPayload | null>;
  if (!payload.data) {
    return {
      key: null,
      keyVersion: 1,
    };
  }

  const key = await unwrapConversationKeyForParticipant(
    payload.data.encryptedConversationKey,
    privateKey,
  );

  try {
    logInfo('chat-setup', 'Exporting conversation key for cache', {
      conversationId,
      keyVersion: payload.data.keyVersion,
    });
    const exported = await exportConversationKeyRaw(key);
    localStorage.setItem(conversationKeyStorageKey(conversationId), exported);
    logInfo('chat-setup', 'Conversation key cached locally', {
      conversationId,
      keyVersion: payload.data.keyVersion,
    });
  } catch (error) {
    logInfo('chat-setup', 'Conversation key export failed; continuing without cache', {
      conversationId,
      reason: error instanceof Error ? error.message : 'unknown_error',
    });
  }

  return {
    key,
    keyVersion: payload.data.keyVersion,
  };
}

function getConversationTitle(conversation: ChatConversationSummary) {
  if (conversation.type === 'dm') {
    return conversation.counterpart?.fullName ?? conversation.counterpart?.username ?? 'Direct message';
  }

  return conversation.title ?? 'Idea discussion';
}

function getConversationSubtitle(
  conversation: ChatConversationSummary,
  options?: { isCounterpartTyping?: boolean; includeRelativeTime?: boolean },
) {
  if (conversation.type === 'dm') {
    const identity = conversation.counterpart?.username
      ? `@${conversation.counterpart.username}`
      : 'Direct message';

    if (options?.isCounterpartTyping) {
      return `${identity} · Typing`;
    }

    if (conversation.counterpart?.presence === 'online') {
      return `${identity} · Active now`;
    }

    if (conversation.counterpart?.presence === 'away') {
      return `${identity} · Active recently`;
    }

    if (conversation.counterpart?.lastSeenAt) {
      if (!options?.includeRelativeTime) {
        return `${identity} · Active recently`;
      }

      const compact = formatCompactRelativeTime(conversation.counterpart.lastSeenAt);
      return compact === 'now' ? `${identity} · Active now` : `${identity} · Active ${compact}`;
    }

    return `${identity} · Active earlier`;
  }

  return conversation.sourceContext?.title ?? 'Private conversation';
}

function getConversationAvatarFallback(conversation: ChatConversationSummary) {
  const [first, second] = getConversationTitle(conversation).split(' ');
  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || 'CH';
}

function toFriendlyMessagingError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('conversation key') ||
    normalized.includes('keypair') ||
    normalized.includes('decrypt') ||
    normalized.includes('chat identity')
  ) {
    return 'Preparing your chat. Please try again in a moment.';
  }

  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Could not send right now. Check your connection and try again.';
  }

  return message;
}

export function ConversationThreadClient({
  conversationId,
  currentUserId,
  conversation,
  initialMessages,
  initialNextCursor,
  showBackLink = false,
}: ConversationThreadClientProps) {
  const [summary, setSummary] = useState(conversation);
  const [messages, setMessages] = useState<LocalThreadMessage[]>(
    initialMessages.map((message) => ({ ...message, localState: undefined, localError: null })),
  );
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [draft, setDraft] = useState('');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [setupState, setSetupState] = useState<'checking' | 'ready' | 'blocked'>('checking');
  const [showSetupSkeleton, setShowSetupSkeleton] = useState(false);
  const [showSlowConnecting, setShowSlowConnecting] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);
  const [conversationKey, setConversationKey] = useState<CryptoKey | null>(null);
  const [conversationKeyVersion, setConversationKeyVersion] = useState(1);
  const [decryptedText, setDecryptedText] = useState<Record<string, string>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [sendingClientIds, setSendingClientIds] = useState<Record<string, boolean>>({});
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [connectionToast, setConnectionToast] = useState<'connecting' | 'reconnected' | null>(null);
  const [pendingBelowCount, setPendingBelowCount] = useState(0);
  const [messageReactions, setMessageReactions] = useState<
    Record<string, ChatMessageReactionRecord[]>
  >({});
  const [activeReactionPickerFor, setActiveReactionPickerFor] = useState<string | null>(null);
  const [updatingReactionKey, setUpdatingReactionKey] = useState<string | null>(null);
  const [typingIndicatorVisible, setTypingIndicatorVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const typingStartTimerRef = useRef<number | null>(null);
  const typingStopTimerRef = useRef<number | null>(null);
  const didBroadcastTypingRef = useRef(false);
  const readTimerRef = useRef<number | null>(null);
  const lastMarkedReadRef = useRef<string | null>(null);
  const wasDisconnectedRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const lastMessageIdRef = useRef<string | null>(null);
  const reconnectToastTimerRef = useRef<number | null>(null);
  const setupSkeletonTimerRef = useRef<number | null>(null);
  const setupSlowConnectTimerRef = useRef<number | null>(null);
  const previousRealtimeStatusRef = useRef<'connecting' | 'connected' | 'offline'>('connecting');
  const typingChannelRef = useRef<{ send: (payload: unknown) => Promise<unknown> } | null>(null);
  const loadedReactionMessageIdsRef = useRef<Set<string>>(new Set());
  const reactionPressTimerRef = useRef<number | null>(null);
  const historyLoadAnchorRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  const typingIndicatorDelayRef = useRef<number | null>(null);

  useEffect(() => {
    setSummary(conversation);
  }, [conversation]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    setMessages(
      initialMessages
        .map((message) => ({ ...message, localState: undefined, localError: null }))
        .sort(sortMessages),
    );
    setNextCursor(initialNextCursor);
    setSetupState('checking');
    setShowSetupSkeleton(true);
    setShowSlowConnecting(false);
    setPendingDraft(null);
    setPendingBelowCount(0);
    setMessageReactions({});
    setActiveReactionPickerFor(null);
    setUpdatingReactionKey(null);
    setTypingIndicatorVisible(false);
    loadedReactionMessageIdsRef.current = new Set();
    lastMessageIdRef.current = null;

    const savedDraft = localStorage.getItem(conversationDraftStorageKey(conversationId));
    setDraft(savedDraft ?? '');

    if (typingStartTimerRef.current !== null) {
      window.clearTimeout(typingStartTimerRef.current);
      typingStartTimerRef.current = null;
    }

    if (typingStopTimerRef.current !== null) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }

    if (setupSkeletonTimerRef.current !== null) {
      window.clearTimeout(setupSkeletonTimerRef.current);
      setupSkeletonTimerRef.current = null;
    }

    if (setupSlowConnectTimerRef.current !== null) {
      window.clearTimeout(setupSlowConnectTimerRef.current);
      setupSlowConnectTimerRef.current = null;
    }

    if (reactionPressTimerRef.current !== null) {
      window.clearTimeout(reactionPressTimerRef.current);
      reactionPressTimerRef.current = null;
    }

    if (typingIndicatorDelayRef.current !== null) {
      window.clearTimeout(typingIndicatorDelayRef.current);
      typingIndicatorDelayRef.current = null;
    }

    didBroadcastTypingRef.current = false;
  }, [conversationId, initialMessages, initialNextCursor]);

  useEffect(() => {
    const key = conversationDraftStorageKey(conversationId);

    if (!draft.trim()) {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, draft);
  }, [conversationId, draft]);

  useEffect(() => {
    const input = composerRef.current;
    if (!input) {
      return;
    }

    input.style.height = 'auto';
    const computed = window.getComputedStyle(input);
    const lineHeight = Number.parseFloat(computed.lineHeight || '20');
    const maxHeight = lineHeight * 5 + 24;
    input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
    input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [draft, conversationId]);

  useEffect(() => {
    if (setupSkeletonTimerRef.current !== null) {
      window.clearTimeout(setupSkeletonTimerRef.current);
      setupSkeletonTimerRef.current = null;
    }

    if (setupSlowConnectTimerRef.current !== null) {
      window.clearTimeout(setupSlowConnectTimerRef.current);
      setupSlowConnectTimerRef.current = null;
    }

    if (setupState !== 'checking') {
      setShowSetupSkeleton(false);
      setShowSlowConnecting(false);
      return;
    }

    setShowSetupSkeleton(true);
    setShowSlowConnecting(false);

    setupSkeletonTimerRef.current = window.setTimeout(() => {
      setupSkeletonTimerRef.current = null;
      setShowSetupSkeleton(false);
    }, 1200);

    setupSlowConnectTimerRef.current = window.setTimeout(() => {
      setupSlowConnectTimerRef.current = null;
      setShowSlowConnecting(true);
    }, 1200);
  }, [setupState]);

  const ensureMessagingReady = useCallback(
    async (trigger: 'initial' | 'retry' | 'send-preflight') => {
      logInfo('chat-send', 'Setup preflight started', {
        conversationId,
        trigger,
        conversationType: conversation.type,
      });

      setSetupState('checking');

      try {
        const localUserKeypair = await ensureLocalUserKeypair();
        await syncPublicKey(localUserKeypair);

        let resolved = await resolveConversationKey(conversationId, localUserKeypair.privateKey);

        if (
          !resolved.key &&
          conversation.type === 'dm' &&
          conversation.counterpart?.userId &&
          summary.messageCount === 0
        ) {
          logInfo('chat-send', 'Attempting DM setup bootstrap', {
            conversationId,
            trigger,
            targetUserId: conversation.counterpart.userId,
          });

          try {
            await bootstrapDirectMessageConversation(currentUserId, conversation.counterpart.userId);
            resolved = await resolveConversationKey(conversationId, localUserKeypair.privateKey);
          } catch (error) {
            logInfo('chat-send', 'DM setup bootstrap failed', {
              conversationId,
              trigger,
              reason: error instanceof Error ? error.message : 'unknown_bootstrap_error',
            });
          }
        }

        setConversationKey(resolved.key);
        setConversationKeyVersion(resolved.keyVersion);

        if (!resolved.key) {
          setSetupState('blocked');
          setStatusError(null);
          logInfo('chat-send', 'Setup preflight blocked', {
            conversationId,
            trigger,
            reason: 'conversation_not_ready',
          });

          return {
            ready: false as const,
            key: null,
            keyVersion: resolved.keyVersion,
          };
        }

        setSetupState('ready');
        setStatusError(null);
        logInfo('chat-send', 'Setup preflight ready', {
          conversationId,
          trigger,
          keyVersion: resolved.keyVersion,
        });

        return {
          ready: true as const,
          key: resolved.key,
          keyVersion: resolved.keyVersion,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown_setup_error';
        setSetupState('blocked');
        setStatusError(null);
        logInfo('chat-send', 'Setup preflight failed', {
          conversationId,
          trigger,
          reason,
        });

        return {
          ready: false as const,
          key: null,
          keyVersion: conversationKeyVersion,
        };
      }
    },
    [
      conversationId,
      conversation.type,
      conversation.counterpart?.userId,
      summary.messageCount,
      currentUserId,
      conversationKeyVersion,
    ],
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      const result = await ensureMessagingReady('initial');
      if (!active) {
        return;
      }

      if (!result.ready) {
        setSetupState('blocked');
      }
    })();

    return () => {
      active = false;
    };
  }, [ensureMessagingReady]);

  useEffect(() => {
    if (!conversationKey) {
      return;
    }

    const activeConversationKey: CryptoKey = conversationKey;
    let active = true;

    async function decryptVisibleMessages() {
      const updates: Record<string, string> = {};

      await Promise.all(
        messages.map(async (message) => {
          if (message.isDeleted) {
            updates[message.id] = '[message deleted]';
            return;
          }

          if (
            message.messageType !== 'text' ||
            !message.ciphertext ||
            !message.iv ||
            !message.algorithm
          ) {
            return;
          }

          try {
            const plaintext = await decryptMessageContent(
              {
                ciphertext: message.ciphertext,
                iv: message.iv,
                algorithm: message.algorithm,
              },
              activeConversationKey,
            );
            updates[message.id] = plaintext;
          } catch {
            updates[message.id] = 'Message unavailable on this device.';
          }
        }),
      );

      if (active) {
        setDecryptedText((previous) => ({
          ...previous,
          ...updates,
        }));
      }
    }

    void decryptVisibleMessages();

    return () => {
      active = false;
    };
  }, [conversationKey, messages]);

  useEffect(() => {
    const sendPresence = async (payload: {
      status?: 'online' | 'away' | 'offline';
      heartbeatOnly?: boolean;
      keepalive?: boolean;
    }) => {
      try {
        await fetch('/api/v1/chat/me/presence', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            status: payload.status,
            heartbeatOnly: payload.heartbeatOnly,
          }),
          keepalive: payload.keepalive,
        });
      } catch {
        // Presence heartbeats should not interrupt chat usage.
      }
    };

    void sendPresence({ status: 'online' });

    const heartbeatInterval = window.setInterval(() => {
      void sendPresence({ heartbeatOnly: true });
    }, 25_000);

    const onVisibilityChange = () => {
      if (document.hidden) {
        void sendPresence({ status: 'away', heartbeatOnly: true });
      } else {
        void sendPresence({ status: 'online', heartbeatOnly: true });
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sendPresence({ status: 'offline', keepalive: true });
    };
  }, []);

  const reconcileLatestMessages = async () => {
    try {
      const response = await fetch(`/api/v1/chat/conversations/${conversationId}/messages?limit=50`);
      const payload = (await response.json()) as ApiResponse<ChatMessageRecord[]>;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Unable to refresh message state.');
      }

      setMessages((previous) => {
        let next = previous;

        for (const message of payload.data ?? []) {
          next = mergeMessage(next, message);
        }

        return next;
      });

      setNextCursor(payload.meta?.cursor ?? null);
      setStatusError(null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Unable to refresh message state.');
    }
  };

  const upsertReaction = useCallback((reaction: ChatMessageReactionRecord) => {
    setMessageReactions((previous) => {
      const current = previous[reaction.messageId] ?? [];
      const index = current.findIndex((candidate) => candidate.id === reaction.id);

      if (index >= 0) {
        const nextForMessage = current.map((candidate, currentIndex) =>
          currentIndex === index ? reaction : candidate,
        );
        return {
          ...previous,
          [reaction.messageId]: nextForMessage,
        };
      }

      return {
        ...previous,
        [reaction.messageId]: [...current, reaction],
      };
    });
  }, []);

  const removeReaction = useCallback((reactionId: string, messageId: string) => {
    setMessageReactions((previous) => {
      const current = previous[messageId] ?? [];
      const nextForMessage = current.filter((candidate) => candidate.id !== reactionId);

      if (nextForMessage.length === current.length) {
        return previous;
      }

      return {
        ...previous,
        [messageId]: nextForMessage,
      };
    });
  }, []);

  const hydrateMissingReactions = useCallback(
    async (messageIds: string[]) => {
      const uniqueIds = [...new Set(messageIds)].filter((id) => !id.startsWith('optimistic:'));
      const missingMessageIds = uniqueIds.filter(
        (id) => !loadedReactionMessageIdsRef.current.has(id),
      );

      if (missingMessageIds.length === 0) {
        return;
      }

      try {
        const query = missingMessageIds.map((id) => `messageId=${encodeURIComponent(id)}`).join('&');
        const response = await fetch(
          `/api/v1/chat/conversations/${conversationId}/reactions?${query}`,
          {
            method: 'GET',
          },
        );
        const payload = (await response.json()) as ApiResponse<ChatMessageReactionRecord[]>;

        if (!response.ok) {
          throw new Error(payload.error?.message ?? 'Unable to load message reactions.');
        }

        const nextByMessageId: Record<string, ChatMessageReactionRecord[]> = {};
        for (const messageId of missingMessageIds) {
          nextByMessageId[messageId] = [];
        }

        for (const reaction of payload.data ?? []) {
          const current = nextByMessageId[reaction.messageId] ?? [];
          current.push(reaction);
          nextByMessageId[reaction.messageId] = current;
        }

        setMessageReactions((previous) => ({
          ...previous,
          ...nextByMessageId,
        }));

        for (const messageId of missingMessageIds) {
          loadedReactionMessageIdsRef.current.add(messageId);
        }
      } catch {
        // Reactions are optional UX metadata; failures should not break message flow.
      }
    },
    [conversationId],
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const key = `${messageId}:${emoji}`;
      if (updatingReactionKey === key) {
        return;
      }

      setUpdatingReactionKey(key);

      const previous = messageReactions;
      const currentReactions = previous[messageId] ?? [];
      const existingMine = currentReactions.find(
        (candidate) => candidate.userId === currentUserId && candidate.emoji === emoji,
      );

      if (existingMine) {
        removeReaction(existingMine.id, messageId);
      } else {
        upsertReaction({
          id: `optimistic:${messageId}:${currentUserId}:${emoji}`,
          messageId,
          conversationId,
          userId: currentUserId,
          emoji,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      try {
        const response = await fetch(`/api/v1/chat/messages/${messageId}/reactions`, {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ emoji }),
        });

        const payload = (await response.json()) as ApiResponse<{
          reacted: boolean;
          messageId: string;
          emoji: string;
          reaction: ChatMessageReactionRecord | null;
        }>;

        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? 'Unable to update reaction.');
        }

        removeReaction(`optimistic:${messageId}:${currentUserId}:${emoji}`, messageId);

        if (payload.data.reacted && payload.data.reaction) {
          upsertReaction(payload.data.reaction);
        }
      } catch {
        setMessageReactions(previous);
      } finally {
        setUpdatingReactionKey((current) => (current === key ? null : current));
      }
    },
    [
      conversationId,
      currentUserId,
      messageReactions,
      removeReaction,
      upsertReaction,
      updatingReactionKey,
    ],
  );

  useEffect(() => {
    void hydrateMissingReactions(messages.map((message) => message.id));
  }, [hydrateMissingReactions, messages]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`chat-thread:${conversationId}`, {
        config: {
          broadcast: {
            self: true,
          },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          setMessages((previous) => mergeMessage(previous, toMessageRecord(row)));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          setMessages((previous) => mergeMessage(previous, toMessageRecord(row)));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_participants',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as ChatParticipantRow;
          if (row.user_id === currentUserId) {
            return;
          }

          setSummary((previous) => {
            if (!previous.counterpart || previous.counterpart.userId !== row.user_id) {
              return previous;
            }

            return {
              ...previous,
              counterpart: {
                ...previous.counterpart,
                lastReadMessageId: row.last_read_message_id,
                lastReadAt: row.last_read_at,
              },
            };
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id: string; message_id: string };
            removeReaction(deleted.id, deleted.message_id);
            return;
          }

          const row = payload.new as ChatMessageReactionRow;
          upsertReaction(toReactionRecord(row));
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_user_presence',
          filter: summary.counterpart?.userId
            ? `user_id=eq.${summary.counterpart.userId}`
            : 'user_id=eq.00000000-0000-0000-0000-000000000000',
        },
        (payload) => {
          const next = payload.new as { status?: 'online' | 'away' | 'offline'; last_seen_at?: string };
          if (!summary.counterpart?.userId) {
            return;
          }

          setSummary((previous) => {
            if (!previous.counterpart) {
              return previous;
            }

            return {
              ...previous,
              counterpart: {
                ...previous.counterpart,
                presence: next.status ?? previous.counterpart.presence,
                lastSeenAt: next.last_seen_at ?? previous.counterpart.lastSeenAt,
              },
            };
          });
        },
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        const data = payload as { payload?: { userId?: string; isTyping?: boolean } };
        const remoteUserId = data.payload?.userId;

        if (!remoteUserId || remoteUserId === currentUserId) {
          return;
        }

        if (!data.payload?.isTyping) {
          setTypingUsers((previous) => {
            const next = { ...previous };
            delete next[remoteUserId];
            return next;
          });
          return;
        }

        setTypingUsers((previous) => ({
          ...previous,
          [remoteUserId]: Date.now() + 2_800,
        }));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          typingChannelRef.current = {
            send: (payload) => channel.send(payload as Parameters<typeof channel.send>[0]),
          };
          setRealtimeStatus('connected');

          if (wasDisconnectedRef.current) {
            wasDisconnectedRef.current = false;
            void reconcileLatestMessages();
          }

          return;
        }

        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          setRealtimeStatus('offline');
          wasDisconnectedRef.current = true;
          return;
        }

        setRealtimeStatus('connecting');
      });

    const typingPruneInterval = window.setInterval(() => {
      const now = Date.now();
      setTypingUsers((previous) => {
        const next: Record<string, number> = {};

        for (const [userId, expiresAt] of Object.entries(previous)) {
          if (expiresAt > now) {
            next[userId] = expiresAt;
          }
        }

        return next;
      });
    }, 1000);

    return () => {
      typingChannelRef.current = null;
      window.clearInterval(typingPruneInterval);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, removeReaction, summary.counterpart?.userId, upsertReaction]);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (!latest || latest.senderId === currentUserId) {
      return;
    }

    if (latest.id === lastMarkedReadRef.current) {
      return;
    }

    if (readTimerRef.current !== null) {
      window.clearTimeout(readTimerRef.current);
    }

    readTimerRef.current = window.setTimeout(() => {
      readTimerRef.current = null;

      void fetch(`/api/v1/chat/conversations/${conversationId}/read`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          lastReadMessageId: latest.id,
        }),
      });

      lastMarkedReadRef.current = latest.id;
    }, 280);

    return () => {
      if (readTimerRef.current !== null) {
        window.clearTimeout(readTimerRef.current);
      }
    };
  }, [conversationId, currentUserId, messages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const onScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const nearBottom = distanceFromBottom < 96;
      isNearBottomRef.current = nearBottom;

      if (nearBottom) {
        setPendingBelowCount(0);
      }
    };

    container.addEventListener('scroll', onScroll);
    onScroll();

    return () => {
      container.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (!latest || latest.id === lastMessageIdRef.current) {
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) {
      lastMessageIdRef.current = latest.id;
      return;
    }

    if (isNearBottomRef.current) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
      setPendingBelowCount(0);
    } else {
      setPendingBelowCount((count) => count + 1);
    }

    lastMessageIdRef.current = latest.id;
  }, [messages]);

  const isCounterpartTyping = useMemo(() => {
    if (!summary.counterpart?.userId) {
      return false;
    }

    return Boolean(typingUsers[summary.counterpart.userId]);
  }, [summary.counterpart?.userId, typingUsers]);

  const subtitleLabel = useMemo(
    () => getConversationSubtitle(summary, { isCounterpartTyping, includeRelativeTime: isHydrated }),
    [isCounterpartTyping, isHydrated, summary],
  );

  const typingIndicatorLabel = useMemo(() => {
    const typingUserIds = Object.keys(typingUsers);
    if (typingUserIds.length === 0) {
      return null;
    }

    if (isCounterpartTyping) {
      return 'Typing';
    }

    return typingUserIds.length === 1 ? 'Someone is typing' : `${typingUserIds.length} people are typing`;
  }, [isCounterpartTyping, typingUsers]);

  useEffect(() => {
    const hasTyping = Boolean(typingIndicatorLabel);

    if (!hasTyping) {
      if (typingIndicatorDelayRef.current !== null) {
        window.clearTimeout(typingIndicatorDelayRef.current);
        typingIndicatorDelayRef.current = null;
      }

      setTypingIndicatorVisible(false);
      return;
    }

    if (typingIndicatorVisible || typingIndicatorDelayRef.current !== null) {
      return;
    }

    typingIndicatorDelayRef.current = window.setTimeout(() => {
      typingIndicatorDelayRef.current = null;
      setTypingIndicatorVisible(true);
    }, 400);
  }, [typingIndicatorLabel, typingIndicatorVisible]);

  const renderedMessages = useMemo(
    () =>
      messages.map((message) => {
        const mine = message.senderId === currentUserId;
        const text =
          decryptedText[message.id] ??
          (message.messageType === 'text'
            ? 'Message'
            : message.isDeleted
              ? '[message deleted]'
              : `[${message.messageType}]`);

        return {
          ...message,
          mine,
          text,
        };
      }),
    [currentUserId, decryptedText, messages],
  );

  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = [];
    let previousDateKey: string | null = null;

    for (let index = 0; index < renderedMessages.length; index += 1) {
      const message = renderedMessages[index];
      if (!message) {
        continue;
      }

      const previousMessage = renderedMessages[index - 1] ?? null;
      const nextMessage = renderedMessages[index + 1] ?? null;
      const dateKey = new Date(message.createdAt).toDateString();

      if (dateKey !== previousDateKey) {
        items.push({
          kind: 'date',
          key: `date:${dateKey}`,
          label: getDateSeparatorLabel(message.createdAt, { includeRelativeDay: isHydrated }),
        });
        previousDateKey = dateKey;
      }

      const groupedWithPrevious = isGroupedMessage(previousMessage, message);
      const groupedWithNext = nextMessage ? isGroupedMessage(message, nextMessage) : false;

      items.push({
        kind: 'message',
        key: message.id,
        message,
        groupedWithPrevious,
        groupedWithNext,
        showAvatar: !message.mine && !groupedWithNext,
        showInlineTimestamp: !groupedWithNext || index % 4 === 0,
      });
    }

    return items;
  }, [isHydrated, renderedMessages]);

  const sendTypingSignal = useCallback((isTyping: boolean) => {
    if (!typingChannelRef.current) {
      return;
    }

    if (didBroadcastTypingRef.current === isTyping) {
      return;
    }

    didBroadcastTypingRef.current = isTyping;

    void typingChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        userId: currentUserId,
        isTyping,
      },
    });
  }, [currentUserId]);

  const queueTypingSignal = useCallback(
    (value: string) => {
      const hasContent = value.trim().length > 0;

      if (typingStartTimerRef.current !== null) {
        window.clearTimeout(typingStartTimerRef.current);
        typingStartTimerRef.current = null;
      }

      if (typingStopTimerRef.current !== null) {
        window.clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }

      if (!hasContent) {
        sendTypingSignal(false);
        return;
      }

      if (!didBroadcastTypingRef.current) {
        typingStartTimerRef.current = window.setTimeout(() => {
          typingStartTimerRef.current = null;
          sendTypingSignal(true);
        }, 380);
      }

      typingStopTimerRef.current = window.setTimeout(() => {
        typingStopTimerRef.current = null;
        sendTypingSignal(false);
      }, 2300);
    },
    [sendTypingSignal],
  );

  useEffect(() => {
    const previousStatus = previousRealtimeStatusRef.current;

    if (realtimeStatus !== 'connected') {
      setConnectionToast('connecting');

      if (reconnectToastTimerRef.current !== null) {
        window.clearTimeout(reconnectToastTimerRef.current);
        reconnectToastTimerRef.current = null;
      }

      previousRealtimeStatusRef.current = realtimeStatus;
      return;
    }

    if (previousStatus === 'offline' || previousStatus === 'connecting') {
      setConnectionToast('reconnected');

      if (reconnectToastTimerRef.current !== null) {
        window.clearTimeout(reconnectToastTimerRef.current);
      }

      reconnectToastTimerRef.current = window.setTimeout(() => {
        reconnectToastTimerRef.current = null;
        setConnectionToast(null);
      }, 1800);
    } else {
      setConnectionToast(null);
    }

    previousRealtimeStatusRef.current = realtimeStatus;
  }, [realtimeStatus]);

  useEffect(
    () => () => {
      if (typingStartTimerRef.current !== null) {
        window.clearTimeout(typingStartTimerRef.current);
      }

      if (typingStopTimerRef.current !== null) {
        window.clearTimeout(typingStopTimerRef.current);
      }

      if (reconnectToastTimerRef.current !== null) {
        window.clearTimeout(reconnectToastTimerRef.current);
      }

      if (setupSkeletonTimerRef.current !== null) {
        window.clearTimeout(setupSkeletonTimerRef.current);
      }

      if (setupSlowConnectTimerRef.current !== null) {
        window.clearTimeout(setupSlowConnectTimerRef.current);
      }

      if (reactionPressTimerRef.current !== null) {
        window.clearTimeout(reactionPressTimerRef.current);
      }

      if (typingIndicatorDelayRef.current !== null) {
        window.clearTimeout(typingIndicatorDelayRef.current);
      }

      sendTypingSignal(false);
    },
    [sendTypingSignal],
  );

  async function loadOlderMessages() {
    if (!nextCursor || loadingOlder) {
      return;
    }

    const container = messagesContainerRef.current;
    historyLoadAnchorRef.current = container
      ? {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
        }
      : null;

    setLoadingOlder(true);
    setStatusError(null);

    try {
      const response = await fetch(
        `/api/v1/chat/conversations/${conversationId}/messages?cursor=${encodeURIComponent(nextCursor)}&limit=40`,
      );
      const payload = (await response.json()) as ApiResponse<ChatMessageRecord[]>;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Unable to load older messages.');
      }

      setMessages((previous) => {
        let next = previous;

        for (const message of payload.data ?? []) {
          next = mergeMessage(next, message);
        }

        return next;
      });

      window.requestAnimationFrame(() => {
        const anchor = historyLoadAnchorRef.current;
        const liveContainer = messagesContainerRef.current;

        if (!anchor || !liveContainer) {
          historyLoadAnchorRef.current = null;
          return;
        }

        const heightDelta = liveContainer.scrollHeight - anchor.scrollHeight;
        liveContainer.scrollTop = anchor.scrollTop + heightDelta;
        historyLoadAnchorRef.current = null;
      });

      setNextCursor(payload.meta?.cursor ?? null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Unable to load older messages.');
    } finally {
      setLoadingOlder(false);
    }
  }

  async function updatePreferences(updates: {
    notificationsMuted?: boolean;
    isPinned?: boolean;
  }) {
    const previousSummary = summary;
    const now = new Date().toISOString();

    setSummary((current) => ({
      ...current,
      participant: {
        ...current.participant,
        notificationsMuted:
          typeof updates.notificationsMuted === 'boolean'
            ? updates.notificationsMuted
            : current.participant.notificationsMuted,
        isPinned:
          typeof updates.isPinned === 'boolean' ? updates.isPinned : current.participant.isPinned,
        pinnedAt:
          typeof updates.isPinned === 'boolean'
            ? updates.isPinned
              ? now
              : null
            : current.participant.pinnedAt,
      },
    }));

    try {
      const response = await fetch(`/api/v1/chat/conversations/${conversationId}/preferences`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      const payload = (await response.json()) as ApiResponse<{
        notificationsMuted: boolean;
        isPinned: boolean;
        pinnedAt: string | null;
      }>;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to update conversation preference.');
      }

      setSummary((current) => ({
        ...current,
        participant: {
          ...current.participant,
          notificationsMuted: payload.data!.notificationsMuted,
          isPinned: payload.data!.isPinned,
          pinnedAt: payload.data!.pinnedAt,
        },
      }));
      setStatusError(null);
    } catch (error) {
      setSummary(previousSummary);
      setStatusError(
        error instanceof Error
          ? toFriendlyMessagingError(error.message)
          : 'Unable to update conversation preference.',
      );
    }
  }

  async function sendMessage(options?: {
    plaintext?: string;
    clientGeneratedId?: string;
    optimisticMessageId?: string;
    clearDraftOnSuccess?: boolean;
  }) {
    const plaintext = (options?.plaintext ?? draft).trim();
    logInfo('chat-send', 'Send clicked', {
      conversationId,
      draftLength: plaintext.length,
      hasConversationKey: Boolean(conversationKey),
      hasLocalKeypair: Boolean(readStoredUserKeypair()),
      setupState,
    });

    if (!plaintext) {
      logInfo('chat-send', 'Send aborted due to empty draft', {
        conversationId,
      });
      return;
    }

    let activeConversationKey: CryptoKey | null = conversationKey;
    let activeKeyVersion = conversationKeyVersion;

    if (!activeConversationKey) {
      setPendingDraft(plaintext);
      logInfo('chat-send', 'Preflight started', {
        conversationId,
        reason: 'missing_conversation_key',
      });

      const setupResult = await ensureMessagingReady('send-preflight');
      if (!setupResult.ready || !setupResult.key) {
        setSetupState('blocked');
        setStatusError(null);
        logInfo('chat-send', 'Send blocked before fetch', {
          conversationId,
          reason: 'setup_not_ready',
          draftLength: plaintext.length,
        });
        return;
      }

      activeConversationKey = setupResult.key;
      activeKeyVersion = setupResult.keyVersion;
      setPendingDraft(null);
    }

    const clientGeneratedId = options?.clientGeneratedId ?? generateClientGeneratedId();
    const optimisticMessageId = options?.optimisticMessageId ?? `optimistic:${clientGeneratedId}`;
    const optimisticCreatedAt = new Date().toISOString();

    setSendingClientIds((current) => ({
      ...current,
      [clientGeneratedId]: true,
    }));
    setStatusError(null);

    if (!options?.optimisticMessageId) {
      setMessages((previous) =>
        mergeMessage(previous, {
          id: optimisticMessageId,
          conversationId,
          senderId: currentUserId,
          messageType: 'text',
          ciphertext: null,
          iv: null,
          algorithm: 'AES-GCM',
          keyVersion: activeKeyVersion,
          payloadMeta: null,
          clientGeneratedId,
          replyToMessageId: null,
          isDeleted: false,
          deletedAt: null,
          createdAt: optimisticCreatedAt,
          updatedAt: optimisticCreatedAt,
        }).map((message) =>
          message.id === optimisticMessageId
            ? {
                ...message,
                localState: 'sending',
                localError: null,
              }
            : message,
        ),
      );
    } else {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === optimisticMessageId
            ? {
                ...message,
                localState: 'sending',
                localError: null,
              }
            : message,
        ),
      );
    }

    setDecryptedText((previous) => ({
      ...previous,
      [optimisticMessageId]: plaintext,
    }));

    try {
      logInfo('chat-send', 'Fetch started', {
        conversationId,
        clientGeneratedId,
        draftLength: plaintext.length,
      });

      const encryptedPayload = await encryptMessageContent(
        plaintext,
        activeConversationKey,
        activeKeyVersion,
      );

      const response = await fetch(`/api/v1/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...encryptedPayload,
          clientGeneratedId,
        }),
      });

      const payload = (await response.json()) as ApiResponse<ChatMessageRecord>;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to send message.');
      }

      logInfo('chat-send', 'Fetch succeeded', {
        conversationId,
        clientGeneratedId,
        messageId: payload.data.id,
      });

      setMessages((previous) => mergeMessage(previous, payload.data as ChatMessageRecord));
      setDecryptedText((previous) => ({
        ...previous,
        [payload.data!.id]: plaintext,
      }));
      setSetupState('ready');
      setPendingDraft(null);

      if (options?.clearDraftOnSuccess ?? !options?.plaintext) {
        setDraft('');
      }
      sendTypingSignal(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to send message.';
      logInfo('chat-send', 'Fetch failed', {
        conversationId,
        clientGeneratedId,
        reason: errorMessage,
      });

      setMessages((previous) =>
        previous.map((message) =>
          message.clientGeneratedId === clientGeneratedId
            ? {
                ...message,
                localState: 'failed',
                localError: errorMessage,
              }
            : message,
        ),
      );
      setStatusError(toFriendlyMessagingError(errorMessage));
    } finally {
      setSendingClientIds((current) => {
        const next = { ...current };
        delete next[clientGeneratedId];
        return next;
      });
    }
  }

  async function retryMessagingSetup() {
    logInfo('chat-send', 'Retry setup clicked', {
      conversationId,
      hasPendingDraft: Boolean(pendingDraft?.trim()),
    });

    const setupResult = await ensureMessagingReady('retry');
    if (!setupResult.ready || !setupResult.key) {
      return;
    }

    if (pendingDraft?.trim()) {
      const draftToRetry = pendingDraft;
      setPendingDraft(null);
      await sendMessage({ plaintext: draftToRetry, clearDraftOnSuccess: true });
    }
  }

  const isSending = Object.keys(sendingClientIds).length > 0;
  const composerDisabled = setupState !== 'ready';
  const realtimeLabel =
    realtimeStatus === 'connected'
      ? 'Live'
      : realtimeStatus === 'offline'
        ? 'Offline'
        : 'Syncing';
  const sourceChipLabel = getSourceContextChipLabel(summary.sourceType);
  const showSetupLoadSkeleton = setupState === 'checking' && showSetupSkeleton && timelineItems.length === 0;
  const showEmptyThreadState = setupState === 'ready' && timelineItems.length === 0;
  const connectionBannerLabel =
    connectionToast === 'reconnected'
      ? 'Reconnected'
      : showSlowConnecting || (realtimeStatus !== 'connected' && !showSetupLoadSkeleton)
        ? 'Connecting...'
        : null;

  return (
    <section className="surface-panel relative flex h-[calc(100dvh-6.2rem)] min-h-[calc(100dvh-6.2rem)] flex-col overflow-hidden lg:h-auto lg:min-h-[58dvh] lg:max-h-[calc(100dvh-11.25rem)]">
      <header className="sticky top-0 z-10 border-b border-border-subtle bg-bg-surface/95 px-3 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          {showBackLink ? (
            <Link
              href="/messages"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-subtle text-text-secondary transition-colors hover:border-border-default hover:text-text-primary lg:hidden"
              aria-label="Back to inbox"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : null}

          <Avatar className="h-10 w-10 border border-border-subtle">
            <AvatarImage src={summary.counterpart?.avatarUrl ?? undefined} alt={getConversationTitle(summary)} />
            <AvatarFallback>{getConversationAvatarFallback(summary)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text-primary">{getConversationTitle(summary)}</p>
            <p className="truncate text-xs text-text-tertiary">{subtitleLabel}</p>
          </div>

          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              aria-label={summary.participant.isPinned ? 'Unpin conversation' : 'Pin conversation'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle text-text-tertiary transition-colors hover:border-border-default hover:text-text-primary"
              onClick={() => {
                void updatePreferences({ isPinned: !summary.participant.isPinned });
              }}
            >
              <Pin className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={summary.participant.notificationsMuted ? 'Enable notifications' : 'Mute notifications'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle text-text-tertiary transition-colors hover:border-border-default hover:text-text-primary"
              onClick={() => {
                void updatePreferences({
                  notificationsMuted: !summary.participant.notificationsMuted,
                });
              }}
            >
              {summary.participant.notificationsMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className="h-11 w-11" aria-label="Conversation actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    void updatePreferences({ isPinned: !summary.participant.isPinned });
                  }}
                >
                  {summary.participant.isPinned ? 'Unpin conversation' : 'Pin conversation'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    void updatePreferences({
                      notificationsMuted: !summary.participant.notificationsMuted,
                    });
                  }}
                >
                  {summary.participant.notificationsMuted ? 'Enable notifications' : 'Mute notifications'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {sourceChipLabel ? <Badge variant="outline">{sourceChipLabel}</Badge> : null}
          {summary.sourceContext?.title ? (
            <Badge variant="outline">{summary.sourceContext.title}</Badge>
          ) : null}
          <Badge
            variant={
              realtimeStatus === 'connected'
                ? 'success'
                : realtimeStatus === 'offline'
                  ? 'danger'
                  : 'warning'
            }
          >
            {realtimeLabel}
          </Badge>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {connectionBannerLabel ? (
          <motion.div
            key={connectionBannerLabel}
            initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
            className="border-b border-border-subtle bg-bg-overlay/60 px-4 py-2 text-xs text-text-secondary"
          >
            {connectionBannerLabel}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {statusError ? (
        <div className="mx-3 mt-2 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
          {statusError}
        </div>
      ) : null}

      {setupState === 'blocked' ? (
        <div className="mx-3 mt-2 flex items-center justify-between rounded-xl border border-border-subtle bg-bg-overlay/60 px-3 py-2 text-xs text-text-secondary">
          <span>Connecting...</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void retryMessagingSetup();
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-end border-b border-border-subtle px-3 py-1.5">
        {nextCursor ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void loadOlderMessages();
            }}
            loading={loadingOlder}
          >
            Load older
          </Button>
        ) : null}
      </div>

      <div ref={messagesContainerRef} className="relative flex-1 overflow-y-auto px-2.5 py-2.5 sm:px-3 sm:py-3">
        {showSetupLoadSkeleton ? (
          <div className="space-y-2 px-1 py-1">
            <div className="skeleton h-12 w-[62%] rounded-[20px]" />
            <div className="skeleton ml-auto h-11 w-[58%] rounded-[20px]" />
            <div className="skeleton h-12 w-[66%] rounded-[20px]" />
          </div>
        ) : null}

        {showEmptyThreadState ? (
          <div className="rounded-2xl border border-dashed border-border-subtle bg-bg-overlay/50 p-6 text-center text-sm text-text-secondary">
            <MessageSquare className="mx-auto mb-3 h-5 w-5 text-text-tertiary" />
            Say hello 👋 and start the conversation.
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {timelineItems.map((item) => {
            if (item.kind === 'date') {
              return (
                <motion.div
                  key={item.key}
                  layout
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
                  className="my-2 flex justify-center"
                >
                  <span className="rounded-full border border-border-subtle bg-bg-overlay/70 px-3 py-1 text-[11px] font-medium text-text-tertiary">
                    {item.label}
                  </span>
                </motion.div>
              );
            }

            const { message, groupedWithPrevious, groupedWithNext, showAvatar, showInlineTimestamp } = item;
            const seenByCounterpart = isMessageSeenByCounterpart(
              message,
              summary.counterpart,
              currentUserId,
            );
            const reactionsForMessage = aggregateReactions(
              messageReactions[message.id],
              currentUserId,
            );
            const outgoingStatus =
              message.localState === 'failed'
                ? 'failed'
                : message.localState === 'sending'
                  ? 'sent'
                  : seenByCounterpart
                    ? 'seen'
                    : 'delivered';

            return (
              <motion.div
                key={item.key}
                layout="position"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: 'easeOut' }}
                className={cn(
                  'group relative flex items-end gap-2',
                  message.mine ? 'justify-end' : 'justify-start',
                  groupedWithPrevious ? 'mt-1' : 'mt-3',
                )}
                onMouseEnter={() => {
                  setActiveReactionPickerFor(message.id);
                }}
                onMouseLeave={() => {
                  setActiveReactionPickerFor((current) =>
                    current === message.id ? null : current,
                  );
                }}
              >
                {!message.mine ? (
                  <div className="w-8 shrink-0">
                    {showAvatar ? (
                      <Avatar className="h-8 w-8 border border-border-subtle">
                        <AvatarImage
                          src={summary.counterpart?.avatarUrl ?? undefined}
                          alt={summary.counterpart?.username ?? getConversationTitle(summary)}
                        />
                        <AvatarFallback>{getConversationAvatarFallback(summary)}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <span className="block h-8 w-8" />
                    )}
                  </div>
                ) : null}

                {!message.isDeleted ? (
                  <div
                    className={cn(
                      'pointer-events-none absolute -top-9 z-10 flex items-center gap-1 rounded-full border border-border-subtle bg-bg-surface px-1.5 py-1 shadow transition-opacity',
                      activeReactionPickerFor === message.id
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100',
                      message.mine ? 'right-10' : 'left-10',
                    )}
                  >
                    {QUICK_REACTIONS.map((emoji) => {
                      const reactionKey = `${message.id}:${emoji}`;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors hover:bg-bg-overlay sm:h-7 sm:w-7"
                          onClick={() => {
                            void toggleReaction(message.id, emoji);
                          }}
                          disabled={updatingReactionKey === reactionKey}
                          aria-label={`React with ${emoji}`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <motion.article
                  layout="position"
                  onPointerDown={(event) => {
                    if (event.pointerType !== 'touch') {
                      return;
                    }

                    if (reactionPressTimerRef.current !== null) {
                      window.clearTimeout(reactionPressTimerRef.current);
                    }

                    reactionPressTimerRef.current = window.setTimeout(() => {
                      reactionPressTimerRef.current = null;
                      setActiveReactionPickerFor(message.id);
                    }, 420);
                  }}
                  onPointerUp={() => {
                    if (reactionPressTimerRef.current !== null) {
                      window.clearTimeout(reactionPressTimerRef.current);
                      reactionPressTimerRef.current = null;
                    }
                  }}
                  onPointerCancel={() => {
                    if (reactionPressTimerRef.current !== null) {
                      window.clearTimeout(reactionPressTimerRef.current);
                      reactionPressTimerRef.current = null;
                    }
                  }}
                  className={cn(
                    'max-w-[72%] border px-3.5 py-2.5 text-sm shadow-[0_2px_7px_rgba(15,23,42,0.05)] sm:max-w-[70%]',
                    message.mine
                      ? 'ml-auto border-accent/25 bg-accent/12 rounded-[20px] rounded-br-[10px]'
                      : 'border-border-subtle bg-bg-surface rounded-[20px] rounded-bl-[10px]',
                    message.mine && groupedWithPrevious ? 'rounded-tr-[11px]' : null,
                    message.mine && groupedWithNext ? 'rounded-br-[11px]' : null,
                    !message.mine && groupedWithPrevious ? 'rounded-tl-[11px]' : null,
                    !message.mine && groupedWithNext ? 'rounded-bl-[11px]' : null,
                    message.localState === 'sending' ? 'opacity-75' : null,
                  )}
                >
                  <p className="whitespace-pre-wrap break-words leading-6 text-text-primary">{message.text}</p>

                  <div className={cn('mt-1.5 flex items-center gap-1.5 text-[11px] text-text-tertiary', message.mine ? 'justify-end' : 'justify-start')}>
                    {isHydrated && showInlineTimestamp ? (
                      <span className="md:hidden">{getMessageTimeLabel(message.createdAt)}</span>
                    ) : null}
                    {isHydrated ? (
                      <span className="hidden transition-opacity md:inline md:opacity-0 md:group-hover:opacity-100">
                        {getMessageTimeLabel(message.createdAt)}
                      </span>
                    ) : null}

                    {message.mine ? (
                      <AnimatePresence mode="wait" initial={false}>
                        {outgoingStatus === 'sent' ? (
                          <motion.span
                            key="sent"
                            initial={prefersReducedMotion ? false : { opacity: 0, y: 2 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
                            transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
                            className="inline-flex min-w-[4.7rem] items-center justify-end gap-1 text-text-tertiary"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Sent
                          </motion.span>
                        ) : null}
                        {outgoingStatus === 'delivered' ? (
                          <motion.span
                            key="delivered"
                            initial={prefersReducedMotion ? false : { opacity: 0, y: 2 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
                            transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
                            className="inline-flex min-w-[4.7rem] items-center justify-end gap-1 text-text-secondary"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Delivered
                          </motion.span>
                        ) : null}
                        {outgoingStatus === 'seen' ? (
                          <motion.span
                            key="seen"
                            initial={prefersReducedMotion ? false : { opacity: 0, y: 2 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
                            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                            className="inline-flex min-w-[4.7rem] items-center justify-end gap-1 text-sky-500"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Seen
                          </motion.span>
                        ) : null}
                        {outgoingStatus === 'failed' ? (
                          <motion.span
                            key="failed"
                            initial={prefersReducedMotion ? false : { opacity: 0, y: 2 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
                            transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
                            className="inline-flex min-w-[4.7rem] items-center justify-end gap-1 text-danger"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Failed
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                    ) : null}
                  </div>

                  {message.mine && message.localState === 'failed' ? (
                    <div className="mt-2 flex justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="border-danger/30 text-danger hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                        onClick={() => {
                          void sendMessage({
                            plaintext: decryptedText[message.id] ?? '',
                            clientGeneratedId: message.clientGeneratedId ?? generateClientGeneratedId(),
                            optimisticMessageId: message.id,
                          });
                        }}
                        loading={Boolean(
                          message.clientGeneratedId && sendingClientIds[message.clientGeneratedId],
                        )}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Retry
                      </Button>
                    </div>
                  ) : null}

                  {reactionsForMessage.length > 0 ? (
                    <div className={cn('mt-2 flex flex-wrap gap-1.5', message.mine ? 'justify-end' : 'justify-start')}>
                      {reactionsForMessage.map((reaction) => {
                        const reactionKey = `${message.id}:${reaction.emoji}`;
                        return (
                          <button
                            key={reaction.emoji}
                            type="button"
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                              reaction.reactedByMe
                                ? 'border-accent/35 bg-accent/12 text-accent'
                                : 'border-border-subtle bg-bg-overlay/70 text-text-tertiary hover:text-text-primary',
                            )}
                            onClick={() => {
                              void toggleReaction(message.id, reaction.emoji);
                            }}
                            disabled={updatingReactionKey === reactionKey}
                            aria-label={`Toggle ${reaction.emoji} reaction`}
                          >
                            <span>{reaction.emoji}</span>
                            <span>{reaction.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </motion.article>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {pendingBelowCount > 0 ? (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 -translate-x-1/2">
          <button
            type="button"
            className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-border-subtle bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary shadow"
            onClick={() => {
              const container = messagesContainerRef.current;
              if (!container) {
                return;
              }

              container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth',
              });
              setPendingBelowCount(0);
            }}
          >
            <ArrowDown className="h-3.5 w-3.5" />
            New messages
          </button>
        </div>
      ) : null}

      <div className="sticky bottom-0 border-t border-border-subtle bg-bg-surface/95 p-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:p-3 sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
        <AnimatePresence initial={false}>
          {typingIndicatorVisible && typingIndicatorLabel ? (
            <motion.div
              key="typing-indicator"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: 'easeOut' }}
              className="mb-2 flex items-center gap-2 text-xs text-text-tertiary"
            >
              <span className="sr-only">{typingIndicatorLabel}</span>
              <span className="inline-flex items-center gap-1">
                {[0, 1, 2].map((index) => (
                  <motion.span
                    key={index}
                    className="h-1.5 w-1.5 rounded-full bg-text-tertiary"
                    animate={
                      prefersReducedMotion
                        ? { opacity: 0.85 }
                        : { opacity: [0.35, 1, 0.35], y: [0, -1, 0] }
                    }
                    transition={{
                      duration: prefersReducedMotion ? 0 : 0.9,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: index * 0.12,
                    }}
                  />
                ))}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Textarea
              ref={composerRef}
              value={draft}
              disabled={composerDisabled}
              onChange={(event) => {
                const next = event.target.value;
                setDraft(next);
                queueTypingSignal(next);
              }}
              onBlur={() => {
                queueTypingSignal('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={composerDisabled ? 'Connecting...' : 'Write a message...'}
              className="min-h-[52px] max-h-[180px] resize-none rounded-[20px] border-border-subtle pr-2 transition-[height] duration-150"
            />
          </div>

          <Button
            onClick={() => {
              void sendMessage();
            }}
            loading={isSending}
            disabled={!draft.trim() || composerDisabled}
            className="h-12 min-w-12 shrink-0 rounded-xl px-3 shadow-[0_0_0_0_rgba(99,102,241,0)] transition-all hover:shadow-[0_0_0_4px_rgba(99,102,241,0.16)] active:scale-[0.96]"
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
