import { fail, ok } from '@/lib/api';
import { ChatServiceError } from '@/lib/chat/errors';
import { handleChatApiError } from '@/lib/chat/api';
import { createOrJoinIdeaConversation, getConversationSummary } from '@/lib/chat/queries';
import { JoinIdeaGroupSchema } from '@/lib/schemas/chat';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const rawBody = await request.text();
    const body = rawBody
      ? JoinIdeaGroupSchema.parse(JSON.parse(rawBody) as unknown)
      : { join: true };

    const privilegedClient = createServiceRoleClient() ?? supabase;
    const conversation = await createOrJoinIdeaConversation(privilegedClient, {
      requesterUserId: user.id,
      ideaId: params.id,
      join: body.join ?? true,
      wrappedKeys: body.wrappedKeys,
    });

    const summary = await getConversationSummary(supabase, user.id, conversation.id);

    if (!summary) {
      throw new ChatServiceError(
        'FORBIDDEN',
        'You are not a participant in this conversation.',
        403,
      );
    }

    return ok(summary);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleChatApiError(error);
  }
}
