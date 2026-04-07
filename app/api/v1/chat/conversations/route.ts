import { fail, ok } from '@/lib/api';
import { handleChatApiError, toClampedInt } from '@/lib/chat/api';
import { listConversationSummaries } from '@/lib/chat/queries';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const { searchParams } = new URL(request.url);

    const cursor = toClampedInt(searchParams.get('cursor'), 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = toClampedInt(searchParams.get('limit'), 20, 1, 50);

    const result = await listConversationSummaries(supabase, user.id, {
      cursor,
      limit,
    });

    return ok(result.conversations, {
      cursor: result.nextCursor,
      total: result.conversations.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleChatApiError(error);
  }
}
