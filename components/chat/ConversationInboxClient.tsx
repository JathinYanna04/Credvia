'use client';

import { useRouter } from 'next/navigation';
import {
  Pin,
  Search,
  Signal,
  SignalHigh,
  SignalMedium,
  SignalZero,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import type { ChatConversationSummary } from '@/lib/chat/contracts';
import type { Database } from '@/lib/supabase/types';
import type { ApiResponse } from '@/lib/types';
import { cn } from '@/lib/utils/cn';
import { formatCompactRelativeTime } from '@/lib/utils/format';

type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
type ChatParticipantRow = Database['public']['Tables']['chat_participants']['Row'];
type ChatPresenceRow = Database['public']['Tables']['chat_user_presence']['Row'];

interface ConversationInboxClientProps {
  userId: string;
  initialConversations: ChatConversationSummary[];
  selectedConversationId?: string | null;
  className?: string;
}

function toTitleCase(value: string) {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getPersonaLabel(conversation: ChatConversationSummary) {
  if (!conversation.counterpart?.primaryPersona) {
    return null;
  }

  return toTitleCase(conversation.counterpart.primaryPersona);
}

function getPresenceLabel(
  conversation: ChatConversationSummary,
  options?: { includeRelativeTime?: boolean },
) {
  if (!conversation.counterpart) {
    return null;
  }

  if (conversation.counterpart.presence === 'online') {
    return 'Active now';
  }

  if (conversation.counterpart.lastSeenAt) {
    if (!options?.includeRelativeTime) {
      return 'Active recently';
    }

    const compact = formatCompactRelativeTime(conversation.counterpart.lastSeenAt);
    return compact === 'now' ? 'Active now' : `Active ${compact}`;
  }

  if (conversation.counterpart.presence === 'away') {
    return 'Active recently';
  }

  return 'Active earlier';
}

function fuzzyMatch(haystack: string, query: string) {
  const normalizedHaystack = haystack.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  let queryIndex = 0;
  for (const character of normalizedHaystack) {
    if (character === normalizedQuery[queryIndex]) {
      queryIndex += 1;
      if (queryIndex >= normalizedQuery.length) {
        return true;
      }
    }
  }

  return false;
}

function getConversationTitle(conversation: ChatConversationSummary) {
  if (conversation.type === 'dm') {
    return (
      conversation.counterpart?.fullName ??
      conversation.counterpart?.username ??
      'Direct message'
    );
  }

  return conversation.title ?? 'Idea group';
}

function getConversationSubtitle(conversation: ChatConversationSummary) {
  if (conversation.type === 'dm') {
    return conversation.counterpart?.username
      ? `@${conversation.counterpart.username}`
      : 'direct message';
  }

  return conversation.description ?? 'Collaborative idea thread';
}

function getConversationAvatarFallback(conversation: ChatConversationSummary) {
  const title = getConversationTitle(conversation);
  const [first, second] = title.split(' ');

  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || 'CH';
}

function getPresenceDotClass(
  presence: 'online' | 'away' | 'offline' | undefined,
) {
  if (!presence) {
    return 'bg-text-tertiary';
  }

  if (presence === 'online') {
    return 'bg-success';
  }

  if (presence === 'away') {
    return 'bg-warning';
  }

  return 'bg-text-tertiary';
}

function getConnectionIcon(status: string) {
  if (status === 'connected') {
    return SignalHigh;
  }

  if (status === 'connecting') {
    return SignalMedium;
  }

  if (status === 'offline') {
    return SignalZero;
  }

  return Signal;
}

function getConnectionLabel(status: 'connecting' | 'connected' | 'offline') {
  if (status === 'connected') {
    return 'Live';
  }

  if (status === 'offline') {
    return 'Offline';
  }

  return 'Syncing';
}

function stableConversationSort(
  left: ChatConversationSummary,
  right: ChatConversationSummary,
) {
  const leftPinned = left.participant.isPinned ? 1 : 0;
  const rightPinned = right.participant.isPinned ? 1 : 0;
  if (leftPinned !== rightPinned) {
    return rightPinned - leftPinned;
  }

  const leftPinnedAt = left.participant.pinnedAt ? Date.parse(left.participant.pinnedAt) : 0;
  const rightPinnedAt = right.participant.pinnedAt ? Date.parse(right.participant.pinnedAt) : 0;
  if (leftPinnedAt !== rightPinnedAt) {
    return rightPinnedAt - leftPinnedAt;
  }

  const leftTime = left.lastMessageAt ? Date.parse(left.lastMessageAt) : 0;
  const rightTime = right.lastMessageAt ? Date.parse(right.lastMessageAt) : 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.id.localeCompare(right.id);
}

function messageRowToPreview(row: ChatMessageRow, userId: string) {
  if (row.message_type !== 'text') {
    return 'Shared an update';
  }

  if (row.sender_id === userId) {
    return 'You: Encrypted message';
  }

  return 'Encrypted message';
}

export function ConversationInboxClient({
  userId,
  initialConversations,
  selectedConversationId = null,
  className,
}: ConversationInboxClientProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState(initialConversations);
  const [isHydrated, setIsHydrated] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [updatingPreferenceFor, setUpdatingPreferenceFor] = useState<string | null>(null);
  const [recentlyUpdatedConversationId, setRecentlyUpdatedConversationId] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const refreshTimerRef = useRef<number | null>(null);
  const seenRealtimeMessageIdsRef = useRef<Set<string>>(new Set());
  const rowPulseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const refreshConversations = async () => {
    try {
      const response = await fetch('/api/v1/chat/conversations?cursor=0&limit=40', {
        method: 'GET',
      });
      const payload = (await response.json()) as ApiResponse<ChatConversationSummary[]>;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Unable to refresh conversations.');
      }

      setConversations((payload.data ?? []).sort(stableConversationSort));
      setStatusError(null);
    } catch (error) {
      setStatusError(
        error instanceof Error
          ? error.message
          : 'Unable to refresh conversations.',
      );
    }
  };

  const updateConversationPreferences = async (
    conversation: ChatConversationSummary,
    updates: {
      notificationsMuted?: boolean;
      isPinned?: boolean;
    },
  ) => {
    if (updatingPreferenceFor === conversation.id) {
      return;
    }

    const previous = conversations;
    const optimisticTimestamp = new Date().toISOString();

    setUpdatingPreferenceFor(conversation.id);
    setConversations((current) =>
      current
        .map((item) => {
          if (item.id !== conversation.id) {
            return item;
          }

          return {
            ...item,
            participant: {
              ...item.participant,
              notificationsMuted:
                typeof updates.notificationsMuted === 'boolean'
                  ? updates.notificationsMuted
                  : item.participant.notificationsMuted,
              isPinned:
                typeof updates.isPinned === 'boolean'
                  ? updates.isPinned
                  : item.participant.isPinned,
              pinnedAt:
                typeof updates.isPinned === 'boolean'
                  ? updates.isPinned
                    ? optimisticTimestamp
                    : null
                  : item.participant.pinnedAt,
            },
          };
        })
        .sort(stableConversationSort),
    );

    try {
      const response = await fetch(`/api/v1/chat/conversations/${conversation.id}/preferences`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      const payload = (await response.json()) as ApiResponse<{
        conversationId: string;
        notificationsMuted: boolean;
        isPinned: boolean;
        pinnedAt: string | null;
      }>;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to update conversation preference.');
      }

      setConversations((current) =>
        current
          .map((item) => {
            if (item.id !== conversation.id) {
              return item;
            }

            return {
              ...item,
              participant: {
                ...item.participant,
                notificationsMuted: payload.data!.notificationsMuted,
                isPinned: payload.data!.isPinned,
                pinnedAt: payload.data!.pinnedAt,
              },
            };
          })
          .sort(stableConversationSort),
      );
      setStatusError(null);
    } catch (error) {
      setConversations(previous);
      setStatusError(
        error instanceof Error
          ? error.message
          : 'Unable to update conversation preference.',
      );
    } finally {
      setUpdatingPreferenceFor(null);
    }
  };

  useEffect(() => {
    const supabase = createClient();

    const scheduleRefresh = () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        void refreshConversations();
      }, 180);
    };

    const refreshInterval = window.setInterval(() => {
      void refreshConversations();
    }, 45_000);

    const applyIncomingMessage = (row: ChatMessageRow) => {
      if (seenRealtimeMessageIdsRef.current.has(row.id)) {
        return;
      }

      seenRealtimeMessageIdsRef.current.add(row.id);

      if (seenRealtimeMessageIdsRef.current.size > 400) {
        const ids = [...seenRealtimeMessageIdsRef.current];
        seenRealtimeMessageIdsRef.current = new Set(ids.slice(ids.length - 240));
      }

      let foundConversation = false;

      setConversations((current) => {
        const next = current.map((conversation) => {
          if (conversation.id !== row.conversation_id) {
            return conversation;
          }

          foundConversation = true;
          const incomingFromOther = row.sender_id !== null && row.sender_id !== userId;
          const shouldIncrementUnread = incomingFromOther && selectedConversationId !== conversation.id;

          return {
            ...conversation,
            messageCount: Math.max(conversation.messageCount + 1, conversation.messageCount),
            lastMessageAt: row.created_at,
            lastMessageId: row.id,
            unreadCount: shouldIncrementUnread
              ? conversation.unreadCount + 1
              : conversation.unreadCount,
            lastMessage: {
              id: row.id,
              senderId: row.sender_id,
              messageType: row.message_type as 'text' | 'system' | 'context_card',
              isDeleted: row.is_deleted,
              createdAt: row.created_at,
              previewText: messageRowToPreview(row, userId),
            },
          };
        });

        if (!foundConversation) {
          return current;
        }

        return next.sort(stableConversationSort);
      });

      setRecentlyUpdatedConversationId(row.conversation_id);
      if (rowPulseTimerRef.current !== null) {
        window.clearTimeout(rowPulseTimerRef.current);
      }

      rowPulseTimerRef.current = window.setTimeout(() => {
        rowPulseTimerRef.current = null;
        setRecentlyUpdatedConversationId((current) =>
          current === row.conversation_id ? null : current,
        );
      }, 420);

      if (!foundConversation) {
        scheduleRefresh();
      }
    };

    const applyParticipantUpdate = (row: ChatParticipantRow) => {
      setConversations((current) =>
        current
          .map((conversation) => {
            if (conversation.id !== row.conversation_id) {
              return conversation;
            }

            const didReadInActiveThread = selectedConversationId === conversation.id;

            return {
              ...conversation,
              unreadCount: didReadInActiveThread ? 0 : conversation.unreadCount,
              participant: {
                ...conversation.participant,
                status: row.status as ChatConversationSummary['participant']['status'],
                role: row.role as ChatConversationSummary['participant']['role'],
                lastReadMessageId: row.last_read_message_id,
                lastReadAt: row.last_read_at,
                notificationsMuted: row.notifications_muted,
                isPinned: row.is_pinned ?? false,
                pinnedAt: row.pinned_at,
              },
            };
          })
          .sort(stableConversationSort),
      );
    };

    const applyPresenceUpdate = (row: ChatPresenceRow) => {
      setConversations((current) =>
        current.map((conversation) => {
          if (!conversation.counterpart || conversation.counterpart.userId !== row.user_id) {
            return conversation;
          }

          return {
            ...conversation,
            counterpart: {
              ...conversation.counterpart,
              presence:
                row.status === 'online' || row.status === 'away' || row.status === 'offline'
                  ? row.status
                  : 'offline',
              lastSeenAt: row.last_seen_at,
            },
          };
        }),
      );
    };

    const channel = supabase
      .channel(`chat-inbox:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          applyIncomingMessage(payload.new as ChatMessageRow);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_participants',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          applyParticipantUpdate(payload.new as ChatParticipantRow);
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_user_presence',
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            return;
          }

          applyPresenceUpdate(payload.new as ChatPresenceRow);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
          return;
        }

        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          setConnectionStatus('offline');
          return;
        }

        setConnectionStatus('connecting');
      });

    const onOffline = () => {
      setConnectionStatus('offline');
    };

    const onOnline = () => {
      setConnectionStatus('connecting');
      void refreshConversations();
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      window.clearInterval(refreshInterval);

      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      if (rowPulseTimerRef.current !== null) {
        window.clearTimeout(rowPulseTimerRef.current);
        rowPulseTimerRef.current = null;
      }

      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);

      void supabase.removeChannel(channel);
    };
  }, [selectedConversationId, userId]);

  useEffect(() => {
    setConversations(initialConversations.sort(stableConversationSort));
  }, [initialConversations]);

  const filteredConversations = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();

    return conversations.filter((conversation) => {
      if (!trimmedQuery) {
        return true;
      }

      const searchHaystack = [
        getConversationTitle(conversation),
        getConversationSubtitle(conversation),
        getPersonaLabel(conversation) ?? '',
        getPresenceLabel(conversation, { includeRelativeTime: false }) ?? '',
        conversation.lastMessage?.previewText ?? '',
        conversation.sourceContext?.title ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return searchHaystack.includes(trimmedQuery) || fuzzyMatch(searchHaystack, trimmedQuery);
    });
  }, [conversations, query]);

  const unreadTotal = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [conversations],
  );

  const pinnedConversations = filteredConversations.filter(
    (conversation) => conversation.participant.isPinned,
  );
  const otherConversations = filteredConversations.filter(
    (conversation) => !conversation.participant.isPinned,
  );

  const ConnectionIcon = getConnectionIcon(connectionStatus);
  const connectionLabel = getConnectionLabel(connectionStatus);
  const rowTransition = {
    duration: prefersReducedMotion ? 0 : 0.2,
    ease: 'easeOut' as const,
  };

  const renderConversationRow = (conversation: ChatConversationSummary) => {
    const muted = conversation.participant.notificationsMuted;
    const unread = conversation.unreadCount > 0;
    const wasJustUpdated = recentlyUpdatedConversationId === conversation.id;
    const presenceLabel =
      conversation.type === 'dm'
        ? getPresenceLabel(conversation, { includeRelativeTime: isHydrated })
        : null;
    const timestampLabel =
      conversation.lastMessageAt
        ? isHydrated
          ? formatCompactRelativeTime(conversation.lastMessageAt)
          : 'Recent'
        : 'New';

    return (
      <motion.article
        key={conversation.id}
        layout="position"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
        animate={
          prefersReducedMotion
            ? { opacity: 1, y: 0 }
            : wasJustUpdated
              ? { opacity: 1, y: [0, -2, 0] }
              : { opacity: 1, y: 0 }
        }
        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
        transition={
          wasJustUpdated
            ? {
                duration: prefersReducedMotion ? 0 : 0.26,
                ease: 'easeOut',
              }
            : rowTransition
        }
        whileHover={prefersReducedMotion ? undefined : { y: -2 }}
        className={cn(
          'group relative cursor-pointer rounded-2xl border p-3.5 transition-colors',
          selectedConversationId === conversation.id
            ? 'border-accent/35 bg-accent/10 shadow-[0_12px_26px_rgba(99,102,241,0.14)]'
            : unread
              ? 'border-accent/25 bg-bg-surface shadow-[0_10px_22px_rgba(99,102,241,0.1)] hover:border-accent/35'
              : 'border-border-subtle bg-bg-surface hover:border-border-default hover:bg-bg-overlay/40',
        )}
        onClick={() => {
          router.push(`/messages/${conversation.id}`);
        }}
      >
        <div className="flex items-start gap-3">
          <div className="relative">
            <Avatar className="h-10 w-10 border border-border-subtle">
              <AvatarImage
                src={conversation.counterpart?.avatarUrl ?? undefined}
                alt={getConversationTitle(conversation)}
              />
              <AvatarFallback>{getConversationAvatarFallback(conversation)}</AvatarFallback>
            </Avatar>
            {conversation.type === 'dm' ? (
              <span
                className={cn(
                  'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-bg-surface',
                  getPresenceDotClass(conversation.counterpart?.presence),
                )}
              />
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  'truncate text-sm text-text-primary',
                  unread ? 'font-semibold' : 'font-medium',
                )}
              >
                {getConversationTitle(conversation)}
              </p>
              {conversation.unreadCount > 0 ? (
                <motion.span
                  className="rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-semibold text-accent"
                  animate={
                    prefersReducedMotion
                      ? { scale: 1 }
                      : wasJustUpdated
                        ? { scale: [1, 1.1, 1] }
                        : { scale: 1 }
                  }
                  transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: 'easeOut' }}
                >
                  {conversation.unreadCount}
                </motion.span>
              ) : null}
              {muted ? <VolumeX className="h-3.5 w-3.5 text-text-tertiary" /> : null}
            </div>

            <p className={cn('truncate text-xs', unread ? 'text-text-secondary font-medium' : 'text-text-tertiary')}>
              {conversation.lastMessage?.previewText ?? getConversationSubtitle(conversation)}
            </p>
            {presenceLabel ? <p className="mt-1 text-[11px] text-text-tertiary">{presenceLabel}</p> : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <span className="hidden text-[11px] text-text-tertiary sm:inline">
              {timestampLabel}
            </span>
            <button
              type="button"
              aria-label={conversation.participant.isPinned ? 'Unpin conversation' : 'Pin conversation'}
              className="rounded-lg p-1 text-text-tertiary transition-colors hover:bg-bg-overlay hover:text-text-primary"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void updateConversationPreferences(conversation, {
                  isPinned: !conversation.participant.isPinned,
                });
              }}
              disabled={updatingPreferenceFor === conversation.id}
            >
              <Pin className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={muted ? 'Enable notifications' : 'Mute notifications'}
              className="rounded-lg p-1 text-text-tertiary transition-colors hover:bg-bg-overlay hover:text-text-primary"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void updateConversationPreferences(conversation, {
                  notificationsMuted: !muted,
                });
              }}
              disabled={updatingPreferenceFor === conversation.id}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </motion.article>
    );
  };

  return (
    <section className={cn('surface-panel flex min-h-[56dvh] flex-col overflow-hidden', className)}>
      <div className="space-y-3 border-b border-border-subtle p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-text-tertiary">Inbox</p>
            <h2 className="text-lg font-semibold text-text-primary">Messages</h2>
          </div>
          {unreadTotal > 0 ? (
            <Badge variant="accent" className="rounded-full px-2.5 py-1 text-[11px]">
              {unreadTotal} unread
            </Badge>
          ) : null}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            className="h-10 rounded-xl border-border-subtle pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-text-tertiary">
            <ConnectionIcon
              className={cn(
                'h-3.5 w-3.5',
                connectionStatus === 'connected'
                  ? 'text-success'
                  : connectionStatus === 'offline'
                    ? 'text-danger'
                    : 'text-warning',
              )}
            />
            {connectionLabel}
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {statusError ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
            {statusError}
          </div>
        ) : null}

        {filteredConversations.length === 0 ? (
          <div className="space-y-4 rounded-2xl border border-border-subtle bg-bg-overlay/60 p-5 text-sm text-text-secondary">
            <p>No conversations yet. Start from a profile or idea discussion.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  router.push('/explore');
                }}
              >
                Browse profiles
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  router.push('/ideas');
                }}
              >
                Explore ideas
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  router.push('/career/jobs');
                }}
              >
                View opportunities
              </Button>
            </div>
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {pinnedConversations.length > 0 ? (
            <motion.div
              key="pinned-section"
              layout
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={rowTransition}
              className="space-y-3"
            >
              <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                Pinned
              </p>
              {pinnedConversations.map((conversation) => renderConversationRow(conversation))}
            </motion.div>
          ) : null}

          {otherConversations.length > 0 ? (
            <motion.div
              key="all-section"
              layout
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={rowTransition}
              className="space-y-3"
            >
              {pinnedConversations.length > 0 ? (
                <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                  All conversations
                </p>
              ) : null}
              {otherConversations.map((conversation) => renderConversationRow(conversation))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
