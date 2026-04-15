import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import { isAiFeatureEnabled, resolveAiRuntimeConfigOrThrow } from '@/lib/ai/config';
import { getAiRunExecutor } from '@/lib/ai/executor';
import { AiRuntimeError, isAiRuntimeError } from '@/lib/ai/errors';
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
import { getRequiredSupabaseBrowserConfig } from '@/lib/supabase/env';
import { getRequiredUser } from '@/lib/supabase/helpers';
import type { Database } from '@/lib/supabase/types';
import {
  logError,
  logInfo,
  logRunLifecycle,
  writeDbRunSnapshot,
  writeNetworkResponseSnapshot,
} from '@/lib/utils/logger';

const TRANSIENT_ROUTE_ERROR_PATTERNS = [
  'und_err_connect_timeout',
  'und_err_socket',
  'econnreset',
  'etimedout',
  'socket',
  'fetch failed',
  'network',
  'connection closed',
  'auth_session_timeout',
];

function resolveCorsAllowedOrigin(request: Request) {
  const configured = process.env.CORS_ALLOWED_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || null;
  const origin = request.headers.get('origin')?.trim() ?? null;

  if (!origin) {
    return configured ?? '*';
  }

  if (configured && origin === configured) {
    return configured;
  }

  return configured ?? origin;
}

function buildCorsHeaders(request: Request) {
  return {
    'Access-Control-Allow-Origin': resolveCorsAllowedOrigin(request),
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-credvia-ai-feedback-source',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function withCors(request: Request, response: Response) {
  const headers = buildCorsHeaders(request);
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

function okWithCors<T>(request: Request, data: T) {
  return withCors(request, ok(data));
}

function failWithCors(
  request: Request,
  code: Parameters<typeof fail>[0],
  message: Parameters<typeof fail>[1],
  status: Parameters<typeof fail>[2],
  details?: Parameters<typeof fail>[3],
  suggestedAction?: Parameters<typeof fail>[4],
) {
  return withCors(request, fail(code, message, status, details, suggestedAction));
}

function handleApiErrorWithCors(request: Request, error: unknown) {
  return withCors(request, handleApiError(error));
}

function extractBearerToken(request: Request) {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const prefix = 'bearer ';

  if (!authorization.toLowerCase().startsWith(prefix)) {
    return null;
  }

  const token = authorization.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

async function createSupabaseClientForRequest(request: Request) {
  const bearerToken = extractBearerToken(request);

  if (!bearerToken) {
    throw new Error('MISSING_BEARER_TOKEN');
  }

  const browserConfig = getRequiredSupabaseBrowserConfig();

  return createClient<Database>(
    browserConfig.url,
    browserConfig.key,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      },
    },
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    return typeof value === 'string' ? value : '';
  }

  return '';
}

function isTransientRouteError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return TRANSIENT_ROUTE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function snapshotResponse(method: 'GET' | 'POST', status: number, payload: Record<string, unknown>) {
  writeNetworkResponseSnapshot({
    route: '/api/v1/ideas/[id]/ai-feedback',
    method,
    status,
    payload,
    timestamp: new Date().toISOString(),
  });
}

interface RunClaimabilityDebugRow {
  id: string;
  status: string;
  attempt_count: number;
  lease_expires_at: string | null;
}

async function readRunClaimabilityDebug(
  supabase: SupabaseClient<Database>,
  runId: string,
): Promise<RunClaimabilityDebugRow | null> {
  const queryClient = supabase as unknown as { from?: unknown };
  if (typeof queryClient.from !== 'function') {
    return null;
  }

  const result = await supabase
    .from('ai_runs')
    .select('id, status, attempt_count, lease_expires_at')
    .eq('id', runId)
    .maybeSingle();

  if (result.error) {
    logError('idea-ai-feedback-post', 'Failed to read run claimability debug row', {
      method: 'POST',
      runId,
      error: result.error.message,
    });
    return null;
  }

  if (!result.data) {
    return null;
  }

  return result.data as RunClaimabilityDebugRow;
}

function isFreshRunClaimable(row: RunClaimabilityDebugRow | null) {
  if (!row) {
    return false;
  }

  return row.status === 'queued' && row.attempt_count === 0 && row.lease_expires_at === null;
}

function resolveFounderRunDecisionReason(args: {
  reused: boolean;
  runStatus: string | null | undefined;
  explicitReason: string | null | undefined;
  regenerate: boolean;
}) {
  if (args.explicitReason) {
    return args.explicitReason;
  }

  if (args.reused) {
    if (args.runStatus === 'succeeded') {
      return 'reused_success_cache';
    }

    if (args.runStatus === 'queued' || args.runStatus === 'running') {
      return 'reused_in_progress';
    }

    return 'reused_in_progress';
  }

  return args.regenerate ? 'force_new_regenerate' : 'created_new';
}

export async function OPTIONS(request: Request) {
  return withCors(request, new Response(null, { status: 200 }));
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const parsed = FounderReviewRouteParamsSchema.parse(params);
    const supabase = await createSupabaseClientForRequest(request);
    const user = await getRequiredUser(supabase, {
      timeoutMs: 2500,
      retries: 1,
    });

    const state = await getFounderIdeaFeedbackState({
      supabase,
      postId: parsed.id,
      founderUserId: user.id,
    });

    if (!state) {
      snapshotResponse('GET', 404, {
        error: {
          code: 'NOT_FOUND',
          message: 'Startup idea not found.',
        },
      });
      return failWithCors(request, 'NOT_FOUND', 'Startup idea not found.', 404);
    }

    if (process.env.NODE_ENV !== 'production') {
      logInfo('idea-ai-feedback-get', 'Founder ai-feedback GET resolved', {
        method: 'GET',
        postId: parsed.id,
        userId: user.id,
        state: state.state,
        terminal: state.terminal,
        hasRun: Boolean(state.latestRun),
        hasReview: Boolean(state.review),
      });
    }

    snapshotResponse('GET', 200, { data: state });
    return okWithCors(request, state);
  } catch (error) {
    if (error instanceof Error && error.message === 'MISSING_BEARER_TOKEN') {
      snapshotResponse('GET', 401, {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing bearer token.',
        },
      });
      return failWithCors(request, 'UNAUTHORIZED', 'Missing bearer token.', 401);
    }

    if (error instanceof Error && error.message === 'AUTH_SESSION_UNAVAILABLE') {
      snapshotResponse('GET', 503, {
        error: {
          code: 'ANALYSIS_SERVICE_UNAVAILABLE',
          message: 'Authentication service is temporarily unavailable. Retry in a moment.',
        },
      });
      return failWithCors(
        request,
        'ANALYSIS_SERVICE_UNAVAILABLE',
        'Authentication service is temporarily unavailable. Retry in a moment.',
        503,
        { transient: true },
        'Retry this request shortly.',
      );
    }

    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      snapshotResponse('GET', 401, {
        error: {
          code: 'UNAUTHORIZED',
          message: 'You need to sign in.',
        },
      });
      return failWithCors(request, 'UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (isTransientRouteError(error)) {
      snapshotResponse('GET', 503, {
        error: {
          code: 'ANALYSIS_SERVICE_UNAVAILABLE',
          message: 'Founder feedback is temporarily unavailable. Please retry shortly.',
        },
      });
      return failWithCors(
        request,
        'ANALYSIS_SERVICE_UNAVAILABLE',
        'Founder feedback is temporarily unavailable. Please retry shortly.',
        503,
        { transient: true },
        'Retry this request shortly.',
      );
    }

    if (isAiRuntimeError(error)) {
      snapshotResponse('GET', error.status, {
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      });
      return failWithCors(request, error.code, error.message, error.status, error.details, error.suggestedAction);
    }

    if (error instanceof ZodError) {
      snapshotResponse('GET', 400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: error.issues[0]?.message ?? 'Validation error.',
        },
      });
      return failWithCors(request, 'VALIDATION_ERROR', error.issues[0]?.message ?? 'Validation error.', 400);
    }

    if (process.env.NODE_ENV !== 'production') {
      logError('idea-ai-feedback-get', 'Unhandled founder ai-feedback GET error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    snapshotResponse('GET', 500, {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    return handleApiErrorWithCors(request, error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAiFeatureEnabled('founder_idea_feedback')) {
      snapshotResponse('POST', 503, {
        error: {
          code: 'AI_FEATURE_DISABLED',
          message: 'Founder AI feedback is currently disabled.',
        },
      });
      return failWithCors(request, 'AI_FEATURE_DISABLED', 'Founder AI feedback is currently disabled.', 503);
    }

    const runtimeConfig = resolveAiRuntimeConfigOrThrow();
    logInfo('idea-ai-feedback-post', 'Founder ai-feedback runtime configuration validated', {
      method: 'POST',
      provider: runtimeConfig.provider,
      model: runtimeConfig.model,
      apiKeySource: runtimeConfig.apiKeySource,
      timeoutMs: runtimeConfig.timeoutMs,
      maxRetries: runtimeConfig.maxRetries,
      warnings: runtimeConfig.warnings,
    });

    const parsed = FounderReviewRouteParamsSchema.parse(params);
    const body = FounderReviewRequestSchema.parse((await request.json()) as unknown);
    const requestedForceNewRun = Boolean(body.forceNewRun || body.regenerate);

    const supabase = await createSupabaseClientForRequest(request);
    const user = await getRequiredUser(supabase, {
      timeoutMs: 2500,
      retries: 1,
    });
    const limit = await enforceRateLimit('ai_founder_feedback', user.id);

    if (!limit.success) {
      snapshotResponse('POST', 429, {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many AI requests. Try again shortly.',
        },
      });
      return failWithCors(request, 'RATE_LIMITED', 'Too many AI requests. Try again shortly.', 429, {
        feature: 'founder_idea_feedback',
      });
    }

    logInfo('idea-ai-feedback-post', 'Founder ai-feedback queue attempt started', {
      method: 'POST',
      postId: parsed.id,
      userId: user.id,
      requestedForceNewRun,
      aiExecutorInlineEnv: process.env.AI_EXECUTOR_INLINE ?? null,
      aiProviderEnv: process.env.AI_PROVIDER ?? null,
    });

    let queued = await queueFounderIdeaFeedbackRun({
      supabase,
      postId: parsed.id,
      founderUserId: user.id,
      regenerate: requestedForceNewRun,
      traceId: randomUUID(),
    });

    logInfo('idea-ai-feedback-post', 'Founder ai-feedback queue attempt completed', {
      method: 'POST',
      postId: parsed.id,
      userId: user.id,
      runId: queued.run.id,
      runStatus: queued.run.status,
      reused: queued.reused,
      decisionReason: queued.decisionReason ?? null,
    });
    let existingRunId = queued.reused ? queued.run.id : null;
    let existingStatus = queued.reused ? queued.run.status : null;

    if (queued.reused && queued.run.status === 'failed') {
      logInfo('idea-ai-feedback-post', 'Founder ai-feedback detected reused failed run; forcing fresh run', {
        method: 'POST',
        postId: parsed.id,
        userId: user.id,
        staleRunId: queued.run.id,
        staleRunStatus: queued.run.status,
      });

      queued = await queueFounderIdeaFeedbackRun({
        supabase,
        postId: parsed.id,
        founderUserId: user.id,
        regenerate: true,
        traceId: randomUUID(),
      });

      existingRunId = existingRunId ?? queued.run.parentRunId ?? null;
      existingStatus = existingStatus ?? 'failed';
    }
    const decisionReason = resolveFounderRunDecisionReason({
      reused: queued.reused,
      runStatus: queued.run.status,
      explicitReason: queued.decisionReason ?? null,
      regenerate: requestedForceNewRun,
    });
    const createdFreshRun = decisionReason === 'force_new_regenerate'
      || decisionReason === 'skipped_failed_terminal_created_new'
      || decisionReason === 'skipped_cancelled_created_new';
    const decision = queued.reused ? 'reused' : 'new';

    if (
      queued.run.feature !== 'founder_idea_feedback'
      || queued.run.subjectType !== 'startup_idea'
      || queued.run.subjectId !== parsed.id
    ) {
      throw new AiRuntimeError(
        'INTERNAL_ERROR',
        'Queued run payload did not match founder feedback request.',
        500,
        {
          requestedPostId: parsed.id,
          runId: queued.run.id,
          runFeature: queued.run.feature,
          runSubjectType: queued.run.subjectType,
          runSubjectId: queued.run.subjectId,
        },
      );
    }

    const runClaimability = await readRunClaimabilityDebug(supabase, queued.run.id);

    if (!queued.reused && runClaimability && !isFreshRunClaimable(runClaimability)) {
      throw new AiRuntimeError(
        'INTERNAL_ERROR',
        'Newly created founder AI run is not immediately claimable.',
        500,
        {
          runId: queued.run.id,
          status: runClaimability.status,
          attemptCount: runClaimability.attempt_count,
          leaseExpiresAt: runClaimability.lease_expires_at,
        },
      );
    }

    if (!queued.reused) {
      const executor = getAiRunExecutor();
      logInfo('idea-ai-feedback-post', 'Founder ai-feedback executor enqueue started', {
        method: 'POST',
        postId: parsed.id,
        userId: user.id,
        runId: queued.run.id,
        runStatus: queued.run.status,
      });
      await executor.enqueue({
        runId: queued.run.id,
        feature: queued.run.feature,
        requestedBy: user.id,
        subjectType: queued.run.subjectType,
        subjectId: queued.run.subjectId,
      });
      logInfo('idea-ai-feedback-post', 'Founder ai-feedback executor enqueue completed', {
        method: 'POST',
        postId: parsed.id,
        userId: user.id,
        runId: queued.run.id,
      });
    }

    if (process.env.NODE_ENV !== 'production') {
      logInfo('idea-ai-feedback-post', 'Founder ai-feedback POST reuse decision', {
        method: 'POST',
        postId: parsed.id,
        userId: user.id,
        inputHash: queued.run.inputHash ?? null,
        existingRunId,
        existingStatus,
        decision,
        reason: decisionReason,
        reused: queued.reused,
        forceNewRun: createdFreshRun,
        priorRunId: queued.run.parentRunId ?? null,
      });

      logInfo('idea-ai-feedback-post', 'Founder ai-feedback POST queued', {
        method: 'POST',
        postId: parsed.id,
        userId: user.id,
        runId: queued.run.id,
        priorRunId: queued.run.parentRunId ?? null,
        runStatus: queued.run.status,
        reused: queued.reused,
        decision,
        reason: decisionReason,
        forceNewRun: createdFreshRun,
        runClaimability,
      });
    }

    logRunLifecycle({
      runId: queued.run.id,
      traceId: queued.run.traceId ?? null,
      status: queued.run.status === 'queued' || queued.run.status === 'running'
        ? 'queued'
        : queued.run.status === 'failed'
          ? 'failed'
          : 'succeeded',
      attemptCount: queued.run.attemptCount ?? null,
      errorCode: queued.run.errorCode ?? null,
      errorMessage: queued.run.errorMessage ?? null,
    });
    writeDbRunSnapshot({
      ...queued.run,
      timestamp: new Date().toISOString(),
      reused: queued.reused,
      decisionReason,
      forceNewRun: createdFreshRun,
      runClaimability,
    });

    snapshotResponse('POST', 200, {
      data: {
        run: queued.run,
        reused: queued.reused,
        debug: {
          runClaimability,
        },
      },
    });

    return okWithCors(request, {
      run: queued.run,
      reused: queued.reused,
      debug: {
        runClaimability,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'MISSING_BEARER_TOKEN') {
      snapshotResponse('POST', 401, {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing bearer token.',
        },
      });
      return failWithCors(request, 'UNAUTHORIZED', 'Missing bearer token.', 401);
    }

    if (error instanceof SyntaxError) {
      snapshotResponse('POST', 400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body must be valid JSON.',
        },
      });
      return failWithCors(request, 'VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }

    if (error instanceof Error && error.message === 'AUTH_SESSION_UNAVAILABLE') {
      snapshotResponse('POST', 503, {
        error: {
          code: 'ANALYSIS_SERVICE_UNAVAILABLE',
          message: 'Authentication service is temporarily unavailable. Retry in a moment.',
        },
      });
      return failWithCors(
        request,
        'ANALYSIS_SERVICE_UNAVAILABLE',
        'Authentication service is temporarily unavailable. Retry in a moment.',
        503,
        { transient: true },
        'Retry this request shortly.',
      );
    }

    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      snapshotResponse('POST', 401, {
        error: {
          code: 'UNAUTHORIZED',
          message: 'You need to sign in.',
        },
      });
      return failWithCors(request, 'UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (isTransientRouteError(error)) {
      snapshotResponse('POST', 503, {
        error: {
          code: 'ANALYSIS_SERVICE_UNAVAILABLE',
          message: 'Founder feedback is temporarily unavailable. Please retry shortly.',
        },
      });
      return failWithCors(
        request,
        'ANALYSIS_SERVICE_UNAVAILABLE',
        'Founder feedback is temporarily unavailable. Please retry shortly.',
        503,
        { transient: true },
        'Retry this request shortly.',
      );
    }

    if (isAiRuntimeError(error)) {
      snapshotResponse('POST', error.status, {
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      });
      return failWithCors(request, error.code, error.message, error.status, error.details, error.suggestedAction);
    }

    if (error instanceof ZodError) {
      snapshotResponse('POST', 400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: error.issues[0]?.message ?? 'Validation error.',
        },
      });
      return failWithCors(request, 'VALIDATION_ERROR', error.issues[0]?.message ?? 'Validation error.', 400);
    }

    if (process.env.NODE_ENV !== 'production') {
      logError('idea-ai-feedback-post', 'Unhandled founder ai-feedback POST error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    snapshotResponse('POST', 500, {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    return handleApiErrorWithCors(request, error);
  }
}
