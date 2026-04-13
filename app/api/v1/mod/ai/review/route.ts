import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import { isAiFeatureEnabled } from '@/lib/ai/config';
import { getAiRunExecutor } from '@/lib/ai/executor';
import { isAiRuntimeError } from '@/lib/ai/errors';
import {
  getModerationReviewState,
  queueModerationReviewRun,
} from '@/lib/ai/features/moderation-review/service';
import { ModerationReviewRequestSchema } from '@/lib/ai/features/moderation-review/schema';
import { fail, handleApiError, ok } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireModeratorAccess } from '@/lib/supabase/moderation';
import { logError, logInfo } from '@/lib/utils/logger';

const ModerationReviewQuerySchema = z.object({
  reportId: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = ModerationReviewQuerySchema.parse({
      reportId: url.searchParams.get('reportId') ?? undefined,
    });

    const supabase = await createServerSupabaseClient();
    const access = await requireModeratorAccess();

    logInfo('moderation-ai-route', 'Moderation AI GET requested', {
      method: 'GET',
      userId: access.user.id,
      reportId: query.reportId,
    });

    const state = await getModerationReviewState({
      supabase,
      moderatorUserId: access.user.id,
      reportId: query.reportId,
      allowedCommunityIds: access.communityIds,
    });

    if (!state) {
      return fail('NOT_FOUND', 'Moderation report not found.', 404);
    }

    return ok(state);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'Moderator access is required.', 403);
    }

    if (isAiRuntimeError(error)) {
      return fail(error.code, error.message, error.status, error.details, error.suggestedAction);
    }

    if (error instanceof ZodError) {
      return fail('VALIDATION_ERROR', error.issues[0]?.message ?? 'Validation error.', 400);
    }

    logError('moderation-ai-route', 'Moderation AI GET failed', {
      method: 'GET',
      error: error instanceof Error ? error.message : String(error),
    });

    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!isAiFeatureEnabled('moderation_review')) {
      return fail('AI_FEATURE_DISABLED', 'Moderation AI review is currently disabled.', 503);
    }

    const body = ModerationReviewRequestSchema.parse((await request.json()) as unknown);
    const supabase = await createServerSupabaseClient();
    const access = await requireModeratorAccess();

    logInfo('moderation-ai-route', 'Moderation AI POST requested', {
      method: 'POST',
      userId: access.user.id,
      reportId: body.reportId,
      regenerate: body.regenerate ?? false,
    });

    const limit = await enforceRateLimit('ai_moderation_review', access.user.id);

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many AI requests. Try again shortly.', 429, {
        feature: 'moderation_review',
      });
    }

    const queued = await queueModerationReviewRun({
      supabase,
      moderatorUserId: access.user.id,
      reportId: body.reportId,
      allowedCommunityIds: access.communityIds,
      regenerate: body.regenerate,
      traceId: randomUUID(),
    });

    if (!queued.reused) {
      const executor = getAiRunExecutor();
      await executor.enqueue({
        runId: queued.run.id,
        feature: queued.run.feature,
        requestedBy: access.user.id,
        subjectType: queued.run.subjectType,
        subjectId: queued.run.subjectId,
      });
    }

    return ok({
      run: queued.run,
      reused: queued.reused,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'Moderator access is required.', 403);
    }

    if (isAiRuntimeError(error)) {
      return fail(error.code, error.message, error.status, error.details, error.suggestedAction);
    }

    if (error instanceof ZodError) {
      return fail('VALIDATION_ERROR', error.issues[0]?.message ?? 'Validation error.', 400);
    }

    logError('moderation-ai-route', 'Moderation AI POST failed', {
      method: 'POST',
      error: error instanceof Error ? error.message : String(error),
    });

    return handleApiError(error);
  }
}
