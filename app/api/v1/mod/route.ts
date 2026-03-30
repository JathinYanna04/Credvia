import { z } from 'zod';
import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import {
  applyModerationAction,
  getModerationActions,
  getModerationQueue,
} from '@/lib/supabase/moderation';

const ModerationActionSchema = z
  .object({
    reportId: z.string().uuid(),
    action: z.enum(['dismiss', 'hide', 'remove']),
    reason: z.string().max(500).optional(),
  })
  .strict();

export async function GET() {
  try {
    const [reports, actions] = await Promise.all([
      getModerationQueue(),
      getModerationActions(),
    ]);

    return ok({ reports, actions });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'Moderator access is required.', 403);
    }

    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await parseJson(request, ModerationActionSchema);
    await applyModerationAction(body);
    return ok({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'Moderator access is required.', 403);
    }

    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return fail('NOT_FOUND', 'Report not found.', 404);
    }

    return handleApiError(error);
  }
}
