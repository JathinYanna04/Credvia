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
import { logInfo } from '@/lib/utils/logger';

const TriggerWorkerSchema = z
  .object({
    batchSize: z.number().int().min(1).max(100).optional(),
    leaseSeconds: z.number().int().min(10).max(600).optional(),
  })
  .strict();

function isAuthorized(request: Request) {
  const secret = process.env.AI_WORKER_SECRET?.trim();

  if (!secret) {
    return false;
  }

  const received = request.headers.get('x-ai-worker-secret')?.trim();
  return Boolean(received) && received === secret;
}

export async function POST(request: Request) {
  try {
    assertAiWorkerSecretConfigured();

    if (!isAuthorized(request)) {
      return fail('UNAUTHORIZED', 'Invalid AI worker credentials.', 401);
    }

    const body = TriggerWorkerSchema.parse((await request.json().catch(() => ({}))) as unknown);
    const supabase = createServiceRoleClient();

    if (!supabase) {
      return fail('AI_EXECUTOR_UNAVAILABLE', 'AI worker requires service-role Supabase credentials.', 503);
    }

    const defaults = getAiWorkerConfig();
    const processorId = `worker-${process.pid}-${Date.now()}`;

    const diagnostics = getAiRuntimeDiagnostics();
    logInfo('ai-worker-route', 'Worker batch trigger accepted', {
      provider: diagnostics.provider,
      providerConfigured: diagnostics.providerConfigured,
      workerSecretConfigured: diagnostics.workerSecretConfigured,
      batchSize: body.batchSize ?? defaults.batchSize,
      leaseSeconds: body.leaseSeconds ?? defaults.leaseSeconds,
    });

    const result = await processAiWorkerBatch(supabase, {
      processorId,
      batchSize: body.batchSize ?? defaults.batchSize,
      leaseSeconds: body.leaseSeconds ?? defaults.leaseSeconds,
      maxAttempts: defaults.maxRetries,
      timeoutMs: defaults.timeoutMs,
      backoffBaseMs: defaults.backoffBaseMs,
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

    return handleApiError(error);
  }
}
