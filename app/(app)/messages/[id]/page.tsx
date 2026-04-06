import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { ConversationThreadClient } from '@/components/chat/ConversationThreadClient';
import { ChatServiceError } from '@/lib/chat/errors';
import { getConversationSummary, getConversationThreadPage } from '@/lib/chat/queries';
import {
  getRequiredUser,
  isRecoverableSupabaseReadError,
} from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function MessageConversationPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getRequiredUser(supabase);

  try {
    const [conversation, thread] = await Promise.all([
      getConversationSummary(supabase, user.id, params.id),
      getConversationThreadPage(supabase, user.id, params.id, {
        limit: 50,
      }),
    ]);

    if (!conversation) {
      notFound();
    }

    const title =
      conversation.type === 'dm'
        ? conversation.counterpart?.fullName ?? conversation.counterpart?.username ?? 'Direct message'
        : conversation.title ?? 'Idea group chat';

    const subtitle =
      conversation.type === 'dm'
        ? conversation.counterpart?.username
          ? `@${conversation.counterpart.username}`
          : 'Direct message'
        : conversation.description ?? 'Encrypted idea collaboration';

    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="surface-panel flex items-start gap-4 p-4">
          <Link
            href="/messages"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-bg-surface text-text-secondary hover:border-border-default hover:text-text-primary"
            aria-label="Back to messages"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-text-primary">{title}</h1>
            <p className="truncate text-sm text-text-secondary">{subtitle}</p>
          </div>
        </section>

        <ConversationThreadClient
          conversationId={conversation.id}
          currentUserId={user.id}
          initialMessages={thread.messages}
          initialNextCursor={thread.nextCursor}
        />
      </div>
    );
  } catch (error) {
    const recoverableCandidate =
      error instanceof Error
        ? error
        : typeof error === 'object' && error !== null
          ? (error as { message?: string; code?: string })
          : undefined;

    if (isRecoverableSupabaseReadError(recoverableCandidate)) {
      return (
        <div className="mx-auto max-w-4xl space-y-4">
          <section className="surface-panel flex items-start gap-4 p-4">
            <Link
              href="/messages"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-bg-surface text-text-secondary hover:border-border-default hover:text-text-primary"
              aria-label="Back to messages"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold text-text-primary">Messages</h1>
              <p className="truncate text-sm text-text-secondary">Chat schema unavailable</p>
            </div>
          </section>

          <section className="surface-panel border-amber-300/40 bg-amber-50/70 p-5 text-sm text-amber-900">
            <p className="font-semibold">Chat schema is not provisioned yet for this project.</p>
            <p className="mt-2">
              Apply Supabase migrations to create chat tables (`020_chat_core.sql` and `021_chat_rls.sql`) and then reload this page.
            </p>
          </section>
        </div>
      );
    }

    if (error instanceof ChatServiceError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}
