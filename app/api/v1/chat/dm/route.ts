import { fail, ok, parseJson } from '@/lib/api';
import { handleChatApiError } from '@/lib/chat/api';
import { createOrGetDmConversation, getConversationSummary } from '@/lib/chat/queries';
import { CreateDmConversationSchema } from '@/lib/schemas/chat';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, CreateDmConversationSchema);

    const privilegedClient = createServiceRoleClient() ?? supabase;
    const conversation = await createOrGetDmConversation(privilegedClient, {
      requesterUserId: user.id,
      targetUserId: body.targetUserId,
      wrappedKeys: body.wrappedKeys,
    });

    const summary = await getConversationSummary(supabase, user.id, conversation.id);
    return ok(summary);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleChatApiError(error);
  }
}
