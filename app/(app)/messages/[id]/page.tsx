import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ConversationThreadClient } from '../../../../components/chat/ConversationThreadClient';
import { ConversationInboxClient } from '../../../../components/chat/ConversationInboxClient';
import { ChatServiceError } from '@/lib/chat/errors';
import {
  getConversationSummary,
  getConversationThreadPage,
  listConversationSummaries,
} from '@/lib/chat/queries';
import {
  getRequiredUser,
  isRecoverableSupabaseReadError,
} from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function getOriginLabel(sourceType: string | null) {
  if (sourceType === 'idea') {
    return 'From Startup Idea';
  }

  if (sourceType === 'opportunity') {
    return 'From Job Opportunity';
  }

  if (sourceType === 'career_match') {
    return 'From Career Match';
  }

  if (sourceType === 'community') {
    return 'From Community';
  }

  return 'General conversation';
}

export default async function MessageConversationPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getRequiredUser(supabase);

  try {
    const [conversation, thread, conversationsList] = await Promise.all([
      getConversationSummary(supabase, user.id, params.id),
      getConversationThreadPage(supabase, user.id, params.id, {
        limit: 50,
      }),
      listConversationSummaries(supabase, user.id, {
        cursor: 0,
        limit: 40,
      }),
    ]);

    if (!conversation) {
      notFound();
    }

    return (
      <div className="mx-auto w-full max-w-[1480px] space-y-0 lg:space-y-4">
        <section className="surface-panel premium-soft-gradient hidden px-4 py-3 sm:px-5 sm:py-3.5 lg:block">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Conversation</div>
          <h1 className="mt-1 text-xl font-semibold text-text-primary sm:text-2xl">Messages</h1>
        </section>

        <div className="space-y-0 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-3.5 lg:space-y-0">
          <ConversationInboxClient
            userId={user.id}
            initialConversations={conversationsList.conversations}
            selectedConversationId={conversation.id}
            className="hidden h-[calc(100dvh-16rem)] lg:flex"
          />

          <div className="space-y-3">
            <ConversationThreadClient
              conversationId={conversation.id}
              currentUserId={user.id}
              conversation={conversation}
              initialMessages={thread.messages}
              initialNextCursor={thread.nextCursor}
              showBackLink
            />

            <details className="surface-panel hidden lg:block">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-text-primary">
                Show thread details
              </summary>
              <div className="space-y-3 border-t border-border-subtle p-4">
                <div className="rounded-xl border border-border-subtle bg-bg-overlay/40 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Origin</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">{getOriginLabel(conversation.sourceType)}</p>
                </div>

                {conversation.sourceContext?.title ? (
                  <div className="rounded-xl border border-border-subtle bg-bg-overlay/40 p-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Source</p>
                    <p className="mt-1 text-sm font-medium text-text-primary">{conversation.sourceContext.title}</p>
                    {conversation.sourceContext.href ? (
                      <Link
                        href={conversation.sourceContext.href}
                        className="mt-2 inline-flex text-xs font-medium text-accent hover:underline"
                      >
                        Open source context
                      </Link>
                    ) : null}
                  </div>
                ) : null}

                {conversation.counterpart ? (
                  <div className="rounded-xl border border-border-subtle bg-bg-overlay/40 p-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Profile</p>
                    <p className="mt-1 text-sm font-medium text-text-primary">
                      {conversation.counterpart.fullName ?? conversation.counterpart.username}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">@{conversation.counterpart.username}</p>
                    {conversation.counterpart.headline ? (
                      <p className="mt-2 text-xs text-text-secondary">{conversation.counterpart.headline}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </details>
          </div>
        </div>
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
          <section className="surface-panel p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Conversation</div>
            <h1 className="mt-2 text-3xl font-semibold text-text-primary">Messages</h1>
            <p className="mt-2 text-sm text-text-secondary">Messaging setup is not ready yet.</p>
          </section>

          <section className="surface-panel border-amber-300/40 bg-amber-50/70 p-5 text-sm text-amber-900">
            <p className="font-semibold">Messaging data is still being prepared for this environment.</p>
            <p className="mt-2">Run the latest project migrations, then refresh this page.</p>
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
