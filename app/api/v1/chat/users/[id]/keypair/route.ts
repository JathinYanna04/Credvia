import { fail, ok } from '@/lib/api';
import { ChatServiceError } from '@/lib/chat/errors';
import { handleChatApiError } from '@/lib/chat/api';
import { getUserPublicKey } from '@/lib/chat/queries';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    await getRequiredUser(supabase);
    const keypair = await getUserPublicKey(supabase, params.id);

    if (!keypair) {
      throw new ChatServiceError(
        'NOT_FOUND',
        'Chat keypair not found for this user.',
        404,
      );
    }

    return ok({
      userId: keypair.user_id,
      publicKey: keypair.public_key,
      algorithm: keypair.algorithm,
      keyVersion: keypair.key_version,
      createdAt: keypair.created_at,
      updatedAt: keypair.updated_at,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleChatApiError(error);
  }
}
