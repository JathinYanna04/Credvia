import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { listConversationSummaries } from '@/lib/chat/queries';
import {
  getRequiredUser,
  isRecoverableSupabaseReadError,
} from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { formatRelativeTime } from '@/lib/utils/format';

export default async function MessagesPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getRequiredUser(supabase);
  let conversations: Awaited<
    ReturnType<typeof listConversationSummaries>
  >['conversations'] = [];
  let schemaUnavailable = false;

  try {
    const listResult = await listConversationSummaries(supabase, user.id, {
      cursor: 0,
      limit: 40,
    });
    conversations = listResult.conversations;
  } catch (error) {
    const recoverableCandidate =
      error instanceof Error
        ? error
        : typeof error === 'object' && error !== null
          ? (error as { message?: string; code?: string })
          : undefined;

    if (isRecoverableSupabaseReadError(recoverableCandidate)) {
      schemaUnavailable = true;
    } else {
      throw error;
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="surface-panel p-5">
        <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Private channels</div>
        <h1 className="mt-2 text-3xl font-semibold text-text-primary">Messages</h1>
        <p className="mt-2 text-sm text-text-secondary">
          End-to-end encrypted conversations. Only ciphertext is persisted server-side.
        </p>
      </section>

      {schemaUnavailable ? (
        <section className="surface-panel border-amber-300/40 bg-amber-50/70 p-5 text-sm text-amber-900">
          <p className="font-semibold">Chat schema is not provisioned yet for this project.</p>
          <p className="mt-2">
            Apply Supabase migrations to create chat tables (`020_chat_core.sql` and `021_chat_rls.sql`) and then reload this page.
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        {conversations.length === 0 ? (
          <div className="surface-panel p-5 text-sm text-text-secondary">
            No conversations yet. Start from a profile or startup idea discussion to open a secure thread.
          </div>
        ) : null}

        {conversations.map((conversation) => {
          const title =
            conversation.type === 'dm'
              ? conversation.counterpart?.fullName ?? conversation.counterpart?.username ?? 'Direct message'
              : conversation.title ?? 'Idea group';

          const subtitle =
            conversation.type === 'dm'
              ? conversation.counterpart?.username
                ? `@${conversation.counterpart.username}`
                : 'direct message'
              : conversation.description ?? 'Collaborative idea thread';

          return (
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
                  <p className="truncate text-sm font-semibold text-text-primary">{title}</p>
                  {conversation.unreadCount > 0 ? (
                    <span className="rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-semibold text-accent">
                      {conversation.unreadCount}
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-xs text-text-tertiary">{subtitle}</p>
              </div>
              <div className="text-xs text-text-tertiary">
                {conversation.lastMessageAt ? formatRelativeTime(conversation.lastMessageAt) : 'No messages'}
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
