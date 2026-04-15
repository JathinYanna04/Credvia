import type { AiFeature, AiSubjectType } from '@/lib/types';
import { getAiWorkerConfig } from '@/lib/ai/config';
import { processAiWorkerBatch } from '@/lib/ai/worker';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logError, logInfo } from '@/lib/utils/logger';

export interface EnqueueAiRunInput {
  runId: string;
  feature: AiFeature;
  requestedBy: string;
  subjectType: AiSubjectType;
  subjectId: string;
}

export interface AiRunExecutor {
  enqueue(input: EnqueueAiRunInput): Promise<{ accepted: boolean; mode: 'db-backed' }>;
}

const INLINE_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isInlineExecutionEnabled() {
  const raw = process.env.AI_EXECUTOR_INLINE;
  return raw ? INLINE_TRUE_VALUES.has(raw.trim().toLowerCase()) : false;
}

class DbBackedAiRunExecutor implements AiRunExecutor {
  async enqueue(input: EnqueueAiRunInput): Promise<{ accepted: boolean; mode: 'db-backed' }> {
    const inlineEnabled = isInlineExecutionEnabled();

    logInfo('ai-executor', 'Queued AI run for db-backed async processing', {
      runId: input.runId,
      feature: input.feature,
      requestedBy: input.requestedBy,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      inlineExecutionEnabled: inlineEnabled,
      inlineEnvRaw: process.env.AI_EXECUTOR_INLINE ?? null,
    });

    if (inlineEnabled) {
      logInfo('ai-executor', 'Inline execution branch selected', {
        runId: input.runId,
        feature: input.feature,
      });

      const serviceClient = createServiceRoleClient();

      if (!serviceClient) {
        logError('ai-executor', 'Inline execution is enabled but service role client could not be initialized', {
          runId: input.runId,
          feature: input.feature,
          hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
          hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        });

        throw new Error('AI inline executor is enabled but service-role Supabase client is unavailable.');
      }

      const workerConfig = getAiWorkerConfig();
      const inlineProcessorId = `inline-force-${process.pid}-${Date.now()}`;

      const result = await processAiWorkerBatch(serviceClient, {
        processorId: inlineProcessorId,
        batchSize: 1,
        leaseSeconds: workerConfig.leaseSeconds,
        maxAttempts: workerConfig.maxRetries,
        timeoutMs: workerConfig.timeoutMs,
        backoffBaseMs: workerConfig.backoffBaseMs,
        parallelism: 1,
      });

      logInfo('ai-executor', 'Inline execution batch completed', {
        runId: input.runId,
        feature: input.feature,
        processorId: inlineProcessorId,
        claimed: result.claimed,
        succeeded: result.succeeded,
        retried: result.retried,
        failed: result.failed,
      });
    } else {
      logInfo('ai-executor', 'AI run awaiting external worker claim', {
        runId: input.runId,
        feature: input.feature,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        inlineEnvRaw: process.env.AI_EXECUTOR_INLINE ?? null,
      });
    }

    return { accepted: true, mode: 'db-backed' };
  }
}

let activeExecutor: AiRunExecutor | null = null;

export function getAiRunExecutor(): AiRunExecutor {
  if (!activeExecutor) {
    activeExecutor = new DbBackedAiRunExecutor();
  }

  return activeExecutor;
}
