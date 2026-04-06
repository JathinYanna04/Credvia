import { fail, ok, parseJson } from '@/lib/api';
import { handleChatApiError } from '@/lib/chat/api';
import { getUserKeypair, upsertUserKeypair } from '@/lib/chat/queries';
import { UpsertChatUserKeypairSchema } from '@/lib/schemas/chat';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const keypair = await getUserKeypair(supabase, user.id);

    return ok(
      keypair
        ? {
            userId: keypair.user_id,
            publicKey: keypair.public_key,
            algorithm: keypair.algorithm,
            keyVersion: keypair.key_version,
            createdAt: keypair.created_at,
            updatedAt: keypair.updated_at,
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

export async function PUT(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, UpsertChatUserKeypairSchema);

    const keypair = await upsertUserKeypair(supabase, user.id, {
      publicKey: body.publicKey,
      algorithm: body.algorithm,
      keyVersion: body.keyVersion,
    });

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
