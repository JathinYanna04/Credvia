import { fail, ok } from '@/lib/api';
import { handleChatApiError } from '@/lib/chat/api';
import { getConversationSummary } from '@/lib/chat/queries';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const conversation = await getConversationSummary(supabase, user.id, params.id);

    return ok(conversation);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleChatApiError(error);
  }
}
