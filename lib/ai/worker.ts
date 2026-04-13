import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { AiRuntimeError, isAiRuntimeError } from '@/lib/ai/errors';
import { classifyAiRetryDecision } from '@/lib/ai/retry-policy';
import {
  claimAiRuns,
  heartbeatAiRunLease,
  markAiRunFailed,
  markAiRunSucceeded,
  requeueAiRun,
} from '@/lib/ai/runs-repo';
import { processAiRunByFeature } from '@/lib/ai/run-processor';
import type { AiRunSummary } from '@/lib/types';
import {
  logError,
  logInfo,
  logRunLifecycle,
  writeDbRunSnapshot,
} from '@/lib/utils/logger';

export interface AiWorkerOptions {
  processorId: string;
  batchSize: number;
  leaseSeconds: number;
  maxAttempts: number;
  timeoutMs: number;
  backoffBaseMs: number;
  parallelism?: number;
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

interface ClaimabilitySummary {
  totalQueued: number;
  eligible: number;
  filteredByLease: number;
  filteredByAttempts: number;
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
      details: null,
      suggestedAction: null,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Unknown AI worker failure.',
    details: null,
    suggestedAction: null,
  };
}

function toFailureProviderMetadata(payload: ReturnType<typeof toErrorPayload>) {
  const details = payload.details && typeof payload.details === 'object'
    ? (payload.details as Record<string, unknown>)
    : {};
  const strictFailure = details.strictFailure && typeof details.strictFailure === 'object'
    ? (details.strictFailure as Record<string, unknown>)
    : null;
  const fallbackFailure = details.fallbackFailure && typeof details.fallbackFailure === 'object'
    ? (details.fallbackFailure as Record<string, unknown>)
    : null;
  const activeFailure = fallbackFailure ?? strictFailure ?? details;
  const retryAfterSeconds = Number(details.retryAfterSeconds ?? 0);

  const provider = typeof details.provider === 'string'
    ? details.provider
    : typeof activeFailure.provider === 'string'
      ? activeFailure.provider
      : null;
  const model = typeof details.model === 'string'
    ? details.model
    : typeof activeFailure.model === 'string'
      ? activeFailure.model
      : null;
  const requestId = typeof details.requestId === 'string'
    ? details.requestId
    : typeof activeFailure.requestId === 'string'
      ? activeFailure.requestId
      : null;
  const parseIssues = Array.isArray(activeFailure.parseIssues)
    ? activeFailure.parseIssues.filter((item): item is string => typeof item === 'string').slice(0, 8)
    : [];
  const validationIssues = Array.isArray(activeFailure.validationIssues)
    ? activeFailure.validationIssues.filter((item): item is string => typeof item === 'string').slice(0, 8)
    : [];
  const parseFailureCount = Number(activeFailure.parseFailureCount ?? 0);
  const validationFailureCount = Number(activeFailure.validationFailureCount ?? 0);
  const repairCount = Number(activeFailure.repairCount ?? 0);
  const lastOutputLength = Number(activeFailure.lastOutputLength ?? 0);

  return {
    errorCode: payload.code,
    errorMessage: payload.message,
    suggestedAction: payload.suggestedAction ?? null,
    requestId,
    provider,
    model,
    status: Number(details.status ?? 0) || null,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds
      : null,
    rateLimitHeaders: details.rateLimitHeaders && typeof details.rateLimitHeaders === 'object'
      ? details.rateLimitHeaders
      : null,
    parseFailureCount: Number.isFinite(parseFailureCount) && parseFailureCount > 0
      ? parseFailureCount
      : null,
    validationFailureCount: Number.isFinite(validationFailureCount) && validationFailureCount > 0
      ? validationFailureCount
      : null,
    repairCount: Number.isFinite(repairCount) && repairCount >= 0
      ? repairCount
      : null,
    parseIssues,
    validationIssues,
    lastError: typeof activeFailure.lastError === 'string' ? activeFailure.lastError : null,
    lastOutputHash: typeof activeFailure.lastOutputHash === 'string' ? activeFailure.lastOutputHash : null,
    lastOutputLength: Number.isFinite(lastOutputLength) && lastOutputLength > 0
      ? lastOutputLength
      : null,
    lastOutputPreview: typeof activeFailure.lastOutputPreview === 'string'
      ? activeFailure.lastOutputPreview
      : null,
    strictFailure: strictFailure
      ? {
          provider: typeof strictFailure.provider === 'string' ? strictFailure.provider : null,
          model: typeof strictFailure.model === 'string' ? strictFailure.model : null,
          requestId: typeof strictFailure.requestId === 'string' ? strictFailure.requestId : null,
          lastError: typeof strictFailure.lastError === 'string' ? strictFailure.lastError : null,
          parseIssues: Array.isArray(strictFailure.parseIssues)
            ? strictFailure.parseIssues.filter((item): item is string => typeof item === 'string').slice(0, 8)
            : [],
          validationIssues: Array.isArray(strictFailure.validationIssues)
            ? strictFailure.validationIssues.filter((item): item is string => typeof item === 'string').slice(0, 8)
            : [],
        }
      : null,
    fallbackFailure: fallbackFailure
      ? {
          provider: typeof fallbackFailure.provider === 'string' ? fallbackFailure.provider : null,
          model: typeof fallbackFailure.model === 'string' ? fallbackFailure.model : null,
          requestId: typeof fallbackFailure.requestId === 'string' ? fallbackFailure.requestId : null,
          lastError: typeof fallbackFailure.lastError === 'string' ? fallbackFailure.lastError : null,
          parseIssues: Array.isArray(fallbackFailure.parseIssues)
            ? fallbackFailure.parseIssues.filter((item): item is string => typeof item === 'string').slice(0, 8)
            : [],
          validationIssues: Array.isArray(fallbackFailure.validationIssues)
            ? fallbackFailure.validationIssues.filter((item): item is string => typeof item === 'string').slice(0, 8)
            : [],
        }
      : null,
  };
}

function computeBackoffMs(attemptCount: number, baseMs: number) {
  const exponent = Math.max(0, attemptCount - 1);
  return Math.min(baseMs * (2 ** exponent), 120000);
}

function resolveRequeueBackoffMs(args: {
  attemptCount: number;
  baseMs: number;
  retryAfterSeconds: number | null;
}) {
  if (typeof args.retryAfterSeconds === 'number' && Number.isFinite(args.retryAfterSeconds) && args.retryAfterSeconds > 0) {
    return Math.min(120000, Math.floor(args.retryAfterSeconds * 1000));
  }

  return computeBackoffMs(args.attemptCount, args.baseMs);
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

async function runWithConcurrency<T>(args: {
  items: T[];
  concurrency: number;
  handler: (item: T) => Promise<void>;
}) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, args.concurrency) }, async () => {
    while (true) {
      const current = index;
      index += 1;

      if (current >= args.items.length) {
        return;
      }

      const item = args.items[current];
      if (item === undefined) {
        return;
      }

      await args.handler(item);
    }
  });

  await Promise.all(workers);
}

function toCount(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.trunc(parsed);
}

async function collectClaimabilitySummary(
  supabase: SupabaseClient<Database>,
): Promise<ClaimabilitySummary | null> {
  const rpcClient = supabase as unknown as {
    rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };

  if (typeof rpcClient.rpc !== 'function') {
    return null;
  }

  try {
    const result = await rpcClient.rpc('get_ai_run_claimability_metrics');

    if (result.error) {
      throw new Error(result.error.message);
    }

    const row = Array.isArray(result.data)
      ? result.data[0] as Record<string, unknown> | undefined
      : result.data as Record<string, unknown> | null;

    if (!row) {
      return null;
    }

    return {
      totalQueued: toCount(row.total_queued),
      eligible: toCount(row.eligible),
      filteredByLease: toCount(row.filtered_by_lease),
      filteredByAttempts: toCount(row.filtered_by_attempts),
    };
  } catch (error) {
    logError('ai-worker-batch', 'Unable to collect claimability summary', {
      error: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
}

async function processClaimedRun(
  supabase: SupabaseClient<Database>,
  run: AiRunSummary,
  options: AiWorkerOptions,
): Promise<'succeeded' | 'retried' | 'failed'> {
  const startedAt = Date.now();

  if (!run.processorId || !run.leaseToken || !run.leaseExpiresAt) {
    throw new AiRuntimeError(
      'AI_RUN_CLAIM_CONFLICT',
      'Claimed run is missing lease metadata.',
      409,
      { runId: run.id },
    );
  }

  logInfo('ai-worker-run', 'AI run processing started', {
    runId: run.id,
    traceId: run.traceId ?? null,
    feature: run.feature,
    subjectType: run.subjectType,
    subjectId: run.subjectId,
    promptVersion: run.promptVersion,
    promptKey: run.promptKey ?? null,
    attemptCount: run.attemptCount ?? null,
    maxAttempts: run.maxAttempts ?? null,
    processorId: options.processorId,
  });
  logRunLifecycle({
    runId: run.id,
    traceId: run.traceId ?? null,
    status: 'running',
    attemptCount: run.attemptCount ?? null,
  });

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

    logInfo('ai-worker-run', 'AI run processing succeeded', {
      runId: run.id,
      traceId: run.traceId ?? null,
      feature: run.feature,
      subjectType: run.subjectType,
      subjectId: run.subjectId,
      provider: result.provider ?? null,
      model: result.modelVersion ?? result.model ?? null,
      processorId: options.processorId,
      durationMs: Date.now() - startedAt,
    });
    logRunLifecycle({
      runId: run.id,
      traceId: run.traceId ?? null,
      status: 'succeeded',
      attemptCount: run.attemptCount ?? null,
      latencyMs: Date.now() - startedAt,
    });
    writeDbRunSnapshot({
      runId: run.id,
      status: 'succeeded',
      feature: run.feature,
      subjectType: run.subjectType,
      subjectId: run.subjectId,
      requestedBy: run.requestedBy,
      promptVersion: run.promptVersion,
      promptKey: run.promptKey ?? null,
      inputHash: run.inputHash ?? null,
      runIdentity: run.runIdentity ?? null,
      attemptCount: run.attemptCount ?? null,
      maxAttempts: run.maxAttempts ?? null,
      provider: result.provider ?? null,
      model: result.modelVersion ?? result.model ?? null,
      requestId: typeof result.providerMetadata?.requestId === 'string'
        ? result.providerMetadata.requestId
        : null,
      latencyMs: Date.now() - startedAt,
      providerMetadata: result.providerMetadata ?? {},
      timestamp: new Date().toISOString(),
    });

    return 'succeeded';
  } catch (error) {
    const payload = toErrorPayload(error);
    const attemptCount = run.attemptCount ?? 1;
    const maxAttempts = run.maxAttempts ?? options.maxAttempts;
    const failureProviderMetadata = toFailureProviderMetadata(payload);
    const details = payload.details && typeof payload.details === 'object'
      ? (payload.details as Record<string, unknown>)
      : {};
    const retryDecision = classifyAiRetryDecision({
      code: payload.code,
      status: Number(details.status ?? 0) || null,
      transient: typeof details.transient === 'boolean' ? details.transient : null,
      attemptCount,
      maxAttempts,
    });

    logInfo('ai-worker-retry', 'AI retry decision evaluated', {
      runId: run.id,
      traceId: run.traceId ?? null,
      feature: run.feature,
      subjectType: run.subjectType,
      subjectId: run.subjectId,
      errorCode: payload.code,
      errorMessage: payload.message,
      retryable: retryDecision.retry,
      retryReason: retryDecision.reason,
      attemptCount,
      maxAttempts,
      retryAfterSeconds: failureProviderMetadata.retryAfterSeconds,
    });

    if (retryDecision.retry) {
      const backoffMs = resolveRequeueBackoffMs({
        attemptCount,
        baseMs: options.backoffBaseMs,
        retryAfterSeconds: failureProviderMetadata.retryAfterSeconds,
      });
      const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

      const requeued = await requeueAiRun(supabase, {
        runId: run.id,
        processorId: options.processorId,
        leaseToken: run.leaseToken,
        errorCode: payload.code,
        errorMessage: payload.message,
        backoffMs,
        providerMetadata: failureProviderMetadata,
      });

      if (requeued) {
        logInfo('ai-worker-run', 'AI run requeued for retry', {
          runId: run.id,
          traceId: run.traceId ?? null,
          feature: run.feature,
          subjectType: run.subjectType,
          subjectId: run.subjectId,
          processorId: options.processorId,
          errorCode: payload.code,
          errorMessage: payload.message,
          attemptCount,
          maxAttempts,
          retryDecision: retryDecision.reason,
          backoffMs,
          nextRetryAt,
          retryAfterSeconds: failureProviderMetadata.retryAfterSeconds,
          requestId: failureProviderMetadata.requestId,
          rateLimitHeaders: failureProviderMetadata.rateLimitHeaders,
          durationMs: Date.now() - startedAt,
        });

        return 'retried';
      }
    }

    const failed = await markAiRunFailed(supabase, {
      runId: run.id,
      processorId: options.processorId,
      leaseToken: run.leaseToken,
      errorCode: payload.code,
      errorMessage: payload.message,
      providerMetadata: failureProviderMetadata,
    });

    if (!failed) {
      throw new AiRuntimeError(
        'AI_RUN_CLAIM_CONFLICT',
        'Run failure persistence failed because lease claim changed.',
        409,
        {
          runId: run.id,
          processorId: options.processorId,
        },
      );
    }

    logError('ai-worker-run', 'AI run processing failed terminally', {
      runId: run.id,
      traceId: run.traceId ?? null,
      feature: run.feature,
      subjectType: run.subjectType,
      subjectId: run.subjectId,
      processorId: options.processorId,
      errorCode: payload.code,
      errorMessage: payload.message,
      retryAfterSeconds: failureProviderMetadata.retryAfterSeconds,
      requestId: failureProviderMetadata.requestId,
      rateLimitHeaders: failureProviderMetadata.rateLimitHeaders,
      retryDecision: retryDecision.reason,
      attemptCount,
      maxAttempts,
      durationMs: Date.now() - startedAt,
    });
    logRunLifecycle({
      runId: run.id,
      traceId: run.traceId ?? null,
      status: 'failed',
      attemptCount: run.attemptCount ?? null,
      latencyMs: Date.now() - startedAt,
      errorCode: payload.code,
      errorMessage: payload.message,
    });
    writeDbRunSnapshot({
      runId: run.id,
      status: 'failed',
      feature: run.feature,
      subjectType: run.subjectType,
      subjectId: run.subjectId,
      requestedBy: run.requestedBy,
      promptVersion: run.promptVersion,
      promptKey: run.promptKey ?? null,
      inputHash: run.inputHash ?? null,
      runIdentity: run.runIdentity ?? null,
      attemptCount: run.attemptCount ?? null,
      maxAttempts: run.maxAttempts ?? null,
      errorCode: payload.code,
      errorMessage: payload.message,
      latencyMs: Date.now() - startedAt,
      providerMetadata: failureProviderMetadata,
      timestamp: new Date().toISOString(),
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
  const startedAt = Date.now();

  logInfo('ai-worker-batch', 'AI worker batch started', {
    processorId: options.processorId,
    batchSize: options.batchSize,
    leaseSeconds: options.leaseSeconds,
    maxAttempts: options.maxAttempts,
    timeoutMs: options.timeoutMs,
  });

  logInfo('ai-worker-batch', 'AI worker claim attempt started', {
    processorId: options.processorId,
    batchSize: options.batchSize,
    leaseSeconds: options.leaseSeconds,
    maxAttempts: options.maxAttempts,
  });

  const claimabilitySummary = await collectClaimabilitySummary(supabase);

  if (claimabilitySummary) {
    logInfo('ai-worker-batch', 'AI worker candidate pool', {
      processorId: options.processorId,
      totalQueued: claimabilitySummary.totalQueued,
      eligible: claimabilitySummary.eligible,
      filteredByLease: claimabilitySummary.filteredByLease,
      filteredByAttempts: claimabilitySummary.filteredByAttempts,
    });
  }

  const claimedRuns = await claimAiRuns(supabase, {
    processorId: options.processorId,
    batchSize: options.batchSize,
    leaseSeconds: options.leaseSeconds,
    maxAttempts: options.maxAttempts,
  });

  logInfo('ai-worker-batch', 'AI worker claim attempt completed', {
    processorId: options.processorId,
    totalQueued: claimabilitySummary?.totalQueued ?? null,
    eligible: claimabilitySummary?.eligible ?? null,
    filteredByLease: claimabilitySummary?.filteredByLease ?? null,
    filteredByAttempts: claimabilitySummary?.filteredByAttempts ?? null,
    claimed: claimedRuns.length,
  });

  if (claimedRuns.length === 0) {
    logInfo('ai-worker-batch', 'AI worker found no claimable runs', {
      processorId: options.processorId,
      totalQueued: claimabilitySummary?.totalQueued ?? null,
      eligible: claimabilitySummary?.eligible ?? null,
      filteredByLease: claimabilitySummary?.filteredByLease ?? null,
      filteredByAttempts: claimabilitySummary?.filteredByAttempts ?? null,
      claimed: 0,
    });
  }

  const seenRunIds = new Set<string>();
  const uniqueRuns: AiRunSummary[] = [];

  for (const run of claimedRuns) {
    if (seenRunIds.has(run.id)) {
      logError('ai-worker-batch', 'Duplicate claimed run skipped', {
        processorId: options.processorId,
        runId: run.id,
        traceId: run.traceId ?? null,
        feature: run.feature,
        subjectType: run.subjectType,
        subjectId: run.subjectId,
      });
      continue;
    }

    seenRunIds.add(run.id);
    uniqueRuns.push(run);
  }

  const result: AiWorkerBatchResult = {
    claimed: uniqueRuns.length,
    succeeded: 0,
    retried: 0,
    failed: 0,
  };

  const parallelism = Math.max(
    1,
    Math.min(options.parallelism ?? Math.min(4, options.batchSize), Math.max(1, uniqueRuns.length)),
  );

  await runWithConcurrency({
    items: uniqueRuns,
    concurrency: parallelism,
    handler: async (run) => {
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
          traceId: run.traceId ?? null,
          feature: run.feature,
          subjectType: run.subjectType,
          subjectId: run.subjectId,
          outcome,
          processorId: options.processorId,
        });
      } catch (error) {
        result.failed += 1;
        logError('ai-worker', 'AI worker processing crashed for run', {
          runId: run.id,
          traceId: run.traceId ?? null,
          feature: run.feature,
          subjectType: run.subjectType,
          subjectId: run.subjectId,
          processorId: options.processorId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  logInfo('ai-worker-batch', 'AI worker batch completed', {
    processorId: options.processorId,
    durationMs: Date.now() - startedAt,
    parallelism,
    claimed: result.claimed,
    succeeded: result.succeeded,
    retried: result.retried,
    failed: result.failed,
  });

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
