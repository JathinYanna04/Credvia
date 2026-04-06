import { fail, ok, parseJson } from '@/lib/api';
import { handleChatApiError } from '@/lib/chat/api';
import {
  getLatestConversationKeyForUser,
  upsertConversationKeys,
} from '@/lib/chat/queries';
import { UpsertConversationKeySchema } from '@/lib/schemas/chat';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const key = await getLatestConversationKeyForUser(supabase, params.id, user.id);

    return ok(
      key
        ? {
            conversationId: key.conversation_id,
            userId: key.user_id,
            encryptedConversationKey: key.encrypted_conversation_key,
            keyEncryptionAlgorithm: key.key_encryption_algorithm,
            keyVersion: key.key_version,
            createdAt: key.created_at,
            rotatedAt: key.rotated_at,
          }
        : null,
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleChatApiError(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, UpsertConversationKeySchema);

    await upsertConversationKeys(supabase, [
      {
        conversationId: params.id,
        userId: user.id,
        encryptedConversationKey: body.encryptedConversationKey,
        keyEncryptionAlgorithm: body.keyEncryptionAlgorithm,
        keyVersion: body.keyVersion,
      },
    ]);

    const key = await getLatestConversationKeyForUser(supabase, params.id, user.id);

    return ok(
      key
        ? {
            conversationId: key.conversation_id,
            userId: key.user_id,
            encryptedConversationKey: key.encrypted_conversation_key,
            keyEncryptionAlgorithm: key.key_encryption_algorithm,
            keyVersion: key.key_version,
            createdAt: key.created_at,
            rotatedAt: key.rotated_at,
          }
        : null,
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleChatApiError(error);
  }
}
