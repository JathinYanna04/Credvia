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

      {!schemaUnavailable ? (
        <ConversationInboxClient
          userId={user.id}
          initialConversations={conversations}
        />
      ) : null}
    </div>
  );
}
