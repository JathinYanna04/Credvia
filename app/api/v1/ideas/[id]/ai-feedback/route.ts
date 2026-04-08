import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { isAiFeatureEnabled } from '@/lib/ai/config';
import { getAiRunExecutor } from '@/lib/ai/executor';
import { isAiRuntimeError } from '@/lib/ai/errors';
import {
  getFounderIdeaFeedbackState,
  queueFounderIdeaFeedbackRun,
} from '@/lib/ai/features/founder-feedback/service';
import {
  FounderReviewRequestSchema,
  FounderReviewRouteParamsSchema,
} from '@/lib/ai/features/founder-feedback/schema';
import { fail, handleApiError, ok } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const parsed = FounderReviewRouteParamsSchema.parse(params);
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);

    const state = await getFounderIdeaFeedbackState({
      supabase,
      postId: parsed.id,
      founderUserId: user.id,
    });

    if (!state) {
      return fail('NOT_FOUND', 'Startup idea not found.', 404);
    }

    return ok(state);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (isAiRuntimeError(error)) {
      return fail(error.code, error.message, error.status, error.details, error.suggestedAction);
    }

    if (error instanceof ZodError) {
      return fail('VALIDATION_ERROR', error.issues[0]?.message ?? 'Validation error.', 400);
    }

    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAiFeatureEnabled('founder_idea_feedback')) {
      return fail('AI_FEATURE_DISABLED', 'Founder AI feedback is currently disabled.', 503);
    }

    const parsed = FounderReviewRouteParamsSchema.parse(params);
    const body = FounderReviewRequestSchema.parse((await request.json()) as unknown);

    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const limit = await enforceRateLimit('ai_founder_feedback', user.id);

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many AI requests. Try again shortly.', 429, {
        feature: 'founder_idea_feedback',
      });
    }

    const queued = await queueFounderIdeaFeedbackRun({
      supabase,
      postId: parsed.id,
      founderUserId: user.id,
      regenerate: body.regenerate,
      traceId: randomUUID(),
    });

    if (!queued.reused) {
      const executor = getAiRunExecutor();
      await executor.enqueue({
        runId: queued.run.id,
        feature: queued.run.feature,
        requestedBy: user.id,
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

    if (isAiRuntimeError(error)) {
      return fail(error.code, error.message, error.status, error.details, error.suggestedAction);
    }

    if (error instanceof ZodError) {
      return fail('VALIDATION_ERROR', error.issues[0]?.message ?? 'Validation error.', 400);
    }

    return handleApiError(error);
  }
}
