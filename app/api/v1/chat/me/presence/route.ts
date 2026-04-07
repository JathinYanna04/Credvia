import { fail, ok, parseJson } from '@/lib/api';
import { handleChatApiError } from '@/lib/chat/api';
import { updateChatPresence } from '@/lib/chat/queries';
import { UpdateChatPresenceSchema } from '@/lib/schemas/chat';
import {
  getRequiredUser,
  isRecoverableSupabaseReadError,
} from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PUT(request: Request) {
  let userId: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    userId = user.id;
    const body = await parseJson(request, UpdateChatPresenceSchema);

    const result = await updateChatPresence(supabase, {
      userId: user.id,
      status: body.status,
      heartbeatOnly: body.heartbeatOnly,
    });

    return ok(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (isRecoverableSupabaseReadError(error as { message?: string; code?: string })) {
      const now = new Date().toISOString();
      return ok({
        userId: userId ?? 'unknown',
        status: 'offline' as const,
        lastSeenAt: now,
        updatedAt: now,
        degraded: true,
      });
    }

    return handleChatApiError(error);
  }
}
