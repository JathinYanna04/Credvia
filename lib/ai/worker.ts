import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { AiRuntimeError, isAiRuntimeError } from '@/lib/ai/errors';
import {
  claimAiRuns,
  heartbeatAiRunLease,
  markAiRunFailed,
  markAiRunSucceeded,
  requeueAiRun,
} from '@/lib/ai/runs-repo';
import { processAiRunByFeature } from '@/lib/ai/run-processor';
import type { AiRunSummary } from '@/lib/types';
import { logError, logInfo } from '@/lib/utils/logger';

export interface AiWorkerOptions {
  processorId: string;
  batchSize: number;
  leaseSeconds: number;
  maxAttempts: number;
  timeoutMs: number;
  backoffBaseMs: number;
}

export interface AiWorkerBatchResult {
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
}

export interface AiWorkerLoopOptions extends AiWorkerOptions {
  pollIntervalMs: number;
  maxCycles?: number;
}

function toErrorPayload(error: unknown) {
  if (isAiRuntimeError(error)) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      suggestedAction: error.suggestedAction,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Unknown AI worker failure.',
  };
}

function computeBackoffMs(attemptCount: number, baseMs: number) {
  const exponent = Math.max(0, attemptCount - 1);
  return Math.min(baseMs * (2 ** exponent), 120000);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new AiRuntimeError(
          'AI_PROVIDER_UNAVAILABLE',
          `AI run timed out after ${timeoutMs}ms.`,
          504,
          { timeoutMs },
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function processClaimedRun(
  supabase: SupabaseClient<Database>,
  run: AiRunSummary,
  options: AiWorkerOptions,
): Promise<'succeeded' | 'retried' | 'failed'> {
  if (!run.processorId || !run.leaseToken || !run.leaseExpiresAt) {
    throw new AiRuntimeError(
      'AI_RUN_CLAIM_CONFLICT',
      'Claimed run is missing lease metadata.',
      409,
      { runId: run.id },
    );
  }

  const heartbeatInterval = Math.max(2000, Math.floor((options.leaseSeconds * 1000) / 2));
  const heartbeat = setInterval(() => {
    void heartbeatAiRunLease(supabase, {
      runId: run.id,
      processorId: options.processorId,
      leaseToken: run.leaseToken ?? '',
      leaseSeconds: options.leaseSeconds,
    }).catch((error) => {
      logError('ai-worker', 'Lease heartbeat failed', {
        runId: run.id,
        processorId: options.processorId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, heartbeatInterval);

  try {
    const result = await withTimeout(
      processAiRunByFeature({
        supabase,
        run,
      }),
      options.timeoutMs,
    );

    const saved = await markAiRunSucceeded(supabase, {
      runId: run.id,
      processorId: options.processorId,
      leaseToken: run.leaseToken,
      provider: result.provider,
      model: result.model,
      modelVersion: result.modelVersion,
      latencyMs: result.latencyMs,
      providerMetadata: result.providerMetadata,
    });

    if (!saved) {
      throw new AiRuntimeError(
        'AI_RUN_CLAIM_CONFLICT',
        'Run completion failed because lease claim changed.',
        409,
        { runId: run.id },
      );
    }

    return 'succeeded';
  } catch (error) {
    const payload = toErrorPayload(error);
    const attemptCount = run.attemptCount ?? 1;
    const maxAttempts = run.maxAttempts ?? options.maxAttempts;

    if (attemptCount < maxAttempts) {
      const requeued = await requeueAiRun(supabase, {
        runId: run.id,
        processorId: options.processorId,
        leaseToken: run.leaseToken,
        errorCode: payload.code,
        errorMessage: payload.message,
        backoffMs: computeBackoffMs(attemptCount, options.backoffBaseMs),
      });

      if (requeued) {
        return 'retried';
      }
    }

    await markAiRunFailed(supabase, {
      runId: run.id,
      processorId: options.processorId,
      leaseToken: run.leaseToken,
      errorCode: payload.code,
      errorMessage: payload.message,
    });

    return 'failed';
  } finally {
    clearInterval(heartbeat);
  }
}

export async function processAiWorkerBatch(
  supabase: SupabaseClient<Database>,
  options: AiWorkerOptions,
): Promise<AiWorkerBatchResult> {
  const claimedRuns = await claimAiRuns(supabase, {
    processorId: options.processorId,
    batchSize: options.batchSize,
    leaseSeconds: options.leaseSeconds,
    maxAttempts: options.maxAttempts,
  });

  const result: AiWorkerBatchResult = {
    claimed: claimedRuns.length,
    succeeded: 0,
    retried: 0,
    failed: 0,
  };

  for (const run of claimedRuns) {
    try {
      const outcome = await processClaimedRun(supabase, run, options);

      if (outcome === 'succeeded') {
        result.succeeded += 1;
      }

      if (outcome === 'retried') {
        result.retried += 1;
      }

      if (outcome === 'failed') {
        result.failed += 1;
      }

      logInfo('ai-worker', 'AI run processed', {
        runId: run.id,
        feature: run.feature,
        outcome,
        processorId: options.processorId,
      });
    } catch (error) {
      result.failed += 1;
      logError('ai-worker', 'AI worker processing crashed for run', {
        runId: run.id,
        feature: run.feature,
        processorId: options.processorId,
        error: error instanceof Error ? error.message : String(error),
      });
     }
   }

   return result;
 }

export async function runAiWorkerLoop(
  supabase: SupabaseClient<Database>,
  options: AiWorkerLoopOptions,
) {
  let cycles = 0;

  while (true) {
    const result = await processAiWorkerBatch(supabase, options);

    cycles += 1;

    if (options.maxCycles && cycles >= options.maxCycles) {
      return;
    }

    if (result.claimed === 0) {
      await sleep(options.pollIntervalMs);
    }
  }
}
