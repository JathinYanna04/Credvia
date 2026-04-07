import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { logError } from '@/lib/utils/logger';

const FeedSignalSchema = z
  .object({
    postId: z.string().uuid().optional(),
    signalType: z.enum(['impression', 'open', 'dwell', 'save', 'share', 'dismiss']),
    durationMs: z.number().int().nonnegative().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, FeedSignalSchema);

    const result = await supabase.from('feed_signal_events').insert({
      user_id: user.id,
      post_id: body.postId ?? null,
      signal_type: body.signalType,
      duration_ms: body.durationMs ?? null,
      metadata: body.metadata ?? {},
    });

    if (result.error) {
      logError('feed-signals', 'Failed to persist feed signal event', {
        userId: user.id,
        postId: body.postId ?? null,
        signalType: body.signalType,
        errorMessage: result.error.message,
        errorCode: result.error.code,
      });

      return ok({
        recorded: false,
        degraded: true,
        reason: 'signal_store_unavailable',
      });
    }

    return ok({ recorded: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
