'use client';

import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ChatConversationSummary } from '@/lib/chat/contracts';
import type { ApiResponse } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/format';

interface ConversationInboxClientProps {
  userId: string;
  initialConversations: ChatConversationSummary[];
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

export function ConversationInboxClient({
  userId,
  initialConversations,
}: ConversationInboxClientProps) {
  const [conversations, setConversations] = useState(initialConversations);
  const [statusError, setStatusError] = useState<string | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const refreshConversations = async () => {
    try {
      const response = await fetch('/api/v1/chat/conversations?cursor=0&limit=40', {
        method: 'GET',
      });
      const payload = (await response.json()) as ApiResponse<ChatConversationSummary[]>;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Unable to refresh conversations.');
      }

      setConversations(payload.data ?? []);
      setStatusError(null);
    } catch (error) {
      setStatusError(
        error instanceof Error
          ? error.message
          : 'Unable to refresh conversations.',
      );
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

    const channel = supabase
      .channel(`chat-inbox:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
        },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_participants',
          filter: `user_id=eq.${userId}`,
        },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <section className="space-y-3">
      {statusError ? (
        <div className="surface-panel rounded-2xl border border-border-subtle bg-bg-surface p-4 text-sm text-text-secondary">
          {statusError}
        </div>
      ) : null}

      {conversations.length === 0 ? (
        <div className="surface-panel space-y-4 p-5 text-sm text-text-secondary">
          <p>No conversations yet. Start from a profile or startup idea discussion to open a secure thread.</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/explore"
              className="inline-flex h-10 items-center rounded-full border border-border-subtle bg-bg-surface px-4 text-sm font-medium text-text-primary hover:border-border-default"
            >
              Browse profiles
            </Link>
            <Link
              href="/ideas"
              className="inline-flex h-10 items-center rounded-full border border-border-subtle bg-bg-surface px-4 text-sm font-medium text-text-primary hover:border-border-default"
            >
              Explore ideas
            </Link>
            <Link
              href="/career/jobs"
              className="inline-flex h-10 items-center rounded-full border border-border-subtle bg-bg-surface px-4 text-sm font-medium text-text-primary hover:border-border-default"
            >
              View opportunities
            </Link>
          </div>
        </div>
      ) : null}

      {conversations.map((conversation) => (
        <Link
          key={conversation.id}
          href={`/messages/${conversation.id}`}
          className="surface-panel flex items-center gap-4 p-4 transition-colors hover:border-border-default"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-text-primary">
                {getConversationTitle(conversation)}
              </p>
              {conversation.unreadCount > 0 ? (
                <span className="rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-semibold text-accent">
                  {conversation.unreadCount}
                </span>
              ) : null}
            </div>
            <p className="truncate text-xs text-text-tertiary">
              {getConversationSubtitle(conversation)}
            </p>
          </div>
          <div className="text-xs text-text-tertiary">
            {conversation.lastMessageAt
              ? formatRelativeTime(conversation.lastMessageAt)
              : 'No messages'}
          </div>
        </Link>
      ))}
    </section>
  );
}
