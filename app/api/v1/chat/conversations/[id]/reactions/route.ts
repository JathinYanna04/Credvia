import { fail, ok } from '@/lib/api';
import { handleChatApiError } from '@/lib/chat/api';
import { listConversationMessageReactions } from '@/lib/chat/queries';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function parseMessageIds(searchParams: URLSearchParams) {
  const raw = searchParams.getAll('messageId');
  if (raw.length > 0) {
    return raw;
  }

  const compact = searchParams.get('messageIds');
  if (!compact) {
    return [];
  }

  return compact
    .split(',')
    .map((value) => value.trim())
    .filter((value) => Boolean(value));
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const { searchParams } = new URL(request.url);

    const messageIds = parseMessageIds(searchParams).slice(0, 120);

    const data = await listConversationMessageReactions(
      supabase,
      user.id,
      params.id,
      {
        messageIds,
      },
    );

    return ok(data, {
      total: data.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleChatApiError(error);
  }
}
