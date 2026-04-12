import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { isAiFeatureEnabled } from '@/lib/ai/config';
import { getAiRunExecutor } from '@/lib/ai/executor';
import { isAiRuntimeError } from '@/lib/ai/errors';
import {
  getCareerCopilotState,
  queueCareerCopilotRun,
} from '@/lib/ai/features/career-copilot/service';
import {
  CareerCopilotCreateRequestSchema,
  CareerCopilotQuerySchema,
} from '@/lib/ai/features/career-copilot/schema';
import { fail, handleApiError, ok } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logError, logInfo } from '@/lib/utils/logger';

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const url = new URL(request.url);
    const query = CareerCopilotQuerySchema.parse({
      sessionId: url.searchParams.get('sessionId') ?? undefined,
    });

    logInfo('career-copilot-route', 'Career Copilot GET requested', {
      method: 'GET',
      userId: user.id,
      sessionId: query.sessionId ?? null,
    });

    const state = await getCareerCopilotState({
      supabase,
      userId: user.id,
      sessionId: query.sessionId,
    });

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

    logError('career-copilot-route', 'Career Copilot GET failed', {
      method: 'GET',
      error: error instanceof Error ? error.message : String(error),
    });

    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!isAiFeatureEnabled('career_copilot')) {
      return fail('AI_FEATURE_DISABLED', 'Career Copilot is currently disabled.', 503);
    }

    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = CareerCopilotCreateRequestSchema.parse((await request.json()) as unknown);

    logInfo('career-copilot-route', 'Career Copilot POST requested', {
      method: 'POST',
      userId: user.id,
      mode: body.mode,
      sessionId: body.sessionId ?? null,
      resumeId: body.resumeId ?? null,
      matchId: body.matchId ?? null,
      regenerate: body.regenerate ?? false,
    });

    const limit = await enforceRateLimit('ai_career_copilot', user.id);

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many AI requests. Try again shortly.', 429, {
        feature: 'career_copilot',
      });
    }

    const queued = await queueCareerCopilotRun({
      supabase,
      userId: user.id,
      mode: body.mode,
      resumeId: body.resumeId,
      matchId: body.matchId,
      sessionId: body.sessionId,
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
      sessionId: queued.sessionId,
      mode: queued.mode,
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

    logError('career-copilot-route', 'Career Copilot POST failed', {
      method: 'POST',
      error: error instanceof Error ? error.message : String(error),
    });

    return handleApiError(error);
  }
}
