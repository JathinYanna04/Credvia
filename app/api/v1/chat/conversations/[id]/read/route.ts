import { fail, ok, parseJson } from '@/lib/api';
import { handleChatApiError } from '@/lib/chat/api';
import { markConversationRead } from '@/lib/chat/queries';
import { MarkConversationReadSchema } from '@/lib/schemas/chat';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, MarkConversationReadSchema);

    const result = await markConversationRead(
      supabase,
      user.id,
      params.id,
      body.lastReadMessageId,
    );

    return ok(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleChatApiError(error);
  }
}
