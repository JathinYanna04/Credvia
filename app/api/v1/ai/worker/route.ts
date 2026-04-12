import { z } from 'zod';
import {
  assertAiWorkerSecretConfigured,
  getAiRuntimeDiagnostics,
  getAiWorkerConfig,
} from '@/lib/ai/config';
import { isAiRuntimeError } from '@/lib/ai/errors';
import { processAiWorkerBatch } from '@/lib/ai/worker';
import { fail, handleApiError, ok } from '@/lib/api';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logError, logInfo } from '@/lib/utils/logger';

const TriggerWorkerSchema = z
  .object({
    batchSize: z.number().int().min(1).max(100).optional(),
    leaseSeconds: z.number().int().min(10).max(600).optional(),
    parallelism: z.number().int().min(1).max(32).optional(),
  })
  .strict();

function isAuthorized(request: Request) {
  const secret = process.env.AI_WORKER_SECRET?.trim();

  if (!secret) {
    return false;
  }

  const received = request.headers.get('x-ai-worker-secret')?.trim();
  if (received && received === secret) {
    return true;
  }

  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const bearerPrefix = 'bearer ';

  if (authorization.toLowerCase().startsWith(bearerPrefix)) {
    const token = authorization.slice(bearerPrefix.length).trim();
    return token.length > 0 && token === secret;
  }

  return false;
}

function toOptionalInt(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseGetOverrides(request: Request) {
  const url = new URL(request.url);

  return TriggerWorkerSchema.parse({
    batchSize: toOptionalInt(url.searchParams.get('batchSize')),
    leaseSeconds: toOptionalInt(url.searchParams.get('leaseSeconds')),
    parallelism: toOptionalInt(url.searchParams.get('parallelism')),
  });
}

async function runWorkerTrigger(request: Request, method: 'GET' | 'POST') {
  try {
    assertAiWorkerSecretConfigured();

    const hasWorkerHeader = Boolean(request.headers.get('x-ai-worker-secret'));
    const hasBearerHeader = Boolean(request.headers.get('authorization'));

    const triggerSource = hasWorkerHeader
      ? 'worker-loop'
      : hasBearerHeader
        ? 'cron'
        : 'unknown';

    logInfo('ai-worker-route', 'Worker route request received', {
      method,
      triggerSource,
      hasWorkerSecretHeader: hasWorkerHeader,
      hasAuthorizationHeader: hasBearerHeader,
    });

    if (!isAuthorized(request)) {
      return fail('UNAUTHORIZED', 'Invalid AI worker credentials.', 401);
    }

    const body = method === 'POST'
      ? TriggerWorkerSchema.parse((await request.json().catch(() => ({}))) as unknown)
      : parseGetOverrides(request);

    const supabase = createServiceRoleClient();

    if (!supabase) {
      return fail('AI_EXECUTOR_UNAVAILABLE', 'AI worker requires service-role Supabase credentials.', 503);
    }

    const defaults = getAiWorkerConfig();
    const processorId = `worker-${process.pid}-${Date.now()}`;
    const effectiveBatchSize = Math.min(2, Math.max(1, body.batchSize ?? defaults.batchSize));
    const effectiveParallelism = Math.min(
      effectiveBatchSize,
      Math.min(2, Math.max(1, body.parallelism ?? defaults.parallelism)),
    );
    const effectiveLeaseSeconds = body.leaseSeconds ?? defaults.leaseSeconds;

    const diagnostics = getAiRuntimeDiagnostics();
    logInfo('ai-worker-route', 'Worker batch trigger accepted', {
      method,
      triggerSource,
      provider: diagnostics.provider,
      providerConfigured: diagnostics.providerConfigured,
      workerSecretConfigured: diagnostics.workerSecretConfigured,
      batchSize: effectiveBatchSize,
      leaseSeconds: effectiveLeaseSeconds,
      parallelism: effectiveParallelism,
    });

    const result = await processAiWorkerBatch(supabase, {
      processorId,
      batchSize: effectiveBatchSize,
      leaseSeconds: effectiveLeaseSeconds,
      maxAttempts: defaults.maxRetries,
      timeoutMs: defaults.timeoutMs,
      backoffBaseMs: defaults.backoffBaseMs,
      parallelism: effectiveParallelism,
    });

    return ok({
      processorId,
      result,
    });
  } catch (error) {
    if (isAiRuntimeError(error)) {
      return fail(error.code, error.message, error.status, error.details, error.suggestedAction);
    }

    if (
      error instanceof Error
      && /claim_ai_runs|ai_runs|function\s+public\.claim_ai_runs|does not exist/i.test(error.message)
    ) {
      return fail(
        'AI_EXECUTOR_UNAVAILABLE',
        'AI worker dependencies are not ready. Apply AI runtime migrations and retry.',
        503,
      );
    }

    logError('ai-worker-route', 'Worker route failed unexpectedly', {
      method,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return handleApiError(error);
  }
}

export async function GET(request: Request) {
  return runWorkerTrigger(request, 'GET');
}

export async function POST(request: Request) {
  return runWorkerTrigger(request, 'POST');
}
