import { fail, ok, parseJson } from '@/lib/api';
import { handleChatApiError, toClampedInt } from '@/lib/chat/api';
import { getConversationThreadPage, sendEncryptedMessage } from '@/lib/chat/queries';
import { SendChatMessageSchema } from '@/lib/schemas/chat';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const { searchParams } = new URL(request.url);

    const limit = toClampedInt(searchParams.get('limit'), 40, 1, 100);
    const cursor = searchParams.get('cursor');

    const page = await getConversationThreadPage(supabase, user.id, params.id, {
      cursor,
      limit,
    });

    return ok(page.messages, {
      cursor: page.nextCursor,
      total: page.messages.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleChatApiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, SendChatMessageSchema);

    const message = await sendEncryptedMessage(supabase, {
      conversationId: params.id,
      senderId: user.id,
      ciphertext: body.ciphertext,
      iv: body.iv,
      algorithm: body.algorithm,
      keyVersion: body.keyVersion,
      clientGeneratedId: body.clientGeneratedId,
      payloadMeta: body.payloadMeta,
      replyToMessageId: body.replyToMessageId,
    });

    return ok(message);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleChatApiError(error);
  }
}
