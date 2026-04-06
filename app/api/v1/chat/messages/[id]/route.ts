import { fail, ok } from '@/lib/api';
import { handleChatApiError } from '@/lib/chat/api';
import { softDeleteOwnMessage } from '@/lib/chat/queries';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);

    const message = await softDeleteOwnMessage(supabase, params.id, user.id);
    return ok(message);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleChatApiError(error);
  }
}
