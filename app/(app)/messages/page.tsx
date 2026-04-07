import { ConversationInboxClient } from '@/components/chat/ConversationInboxClient';
import { listConversationSummaries } from '@/lib/chat/queries';
import {
  getRequiredUser,
  isRecoverableSupabaseReadError,
} from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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
    <div className="mx-auto w-full max-w-[1500px] space-y-3 sm:space-y-4">
      <section className="surface-panel premium-soft-gradient px-4 py-3 sm:px-5 sm:py-3.5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-text-tertiary">Conversations</p>
        <h1 className="mt-1 text-xl font-semibold text-text-primary sm:text-2xl">Messages</h1>
      </section>

      {schemaUnavailable ? (
        <section className="surface-panel border-amber-300/40 bg-amber-50/70 p-5 text-sm text-amber-900">
          <p className="font-semibold">Messaging data is still being prepared for this environment.</p>
          <p className="mt-2">Run the latest project migrations, then refresh this page.</p>
        </section>
      ) : null}

      {!schemaUnavailable ? (
        <div className="grid min-h-[60dvh] gap-3 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-3.5">
          <ConversationInboxClient
            userId={user.id}
            initialConversations={conversations}
            selectedConversationId={null}
            className="min-h-[58dvh] lg:max-h-[calc(100dvh-11.25rem)]"
          />

          <section className="surface-panel hidden min-h-[58dvh] items-center justify-center px-6 py-8 text-center lg:flex">
            <div className="space-y-3">
              <div className="mx-auto inline-flex rounded-full border border-border-subtle bg-bg-overlay/60 px-4 py-2 text-sm text-text-tertiary">
                Open a conversation
              </div>
              <h2 className="text-xl font-semibold text-text-primary">Select a thread to start messaging</h2>
              <p className="mx-auto max-w-md text-sm text-text-secondary">
                Conversation stays in focus with instant message updates.
              </p>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
