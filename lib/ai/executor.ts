import type { AiFeature, AiSubjectType } from '@/lib/types';
import { getAiWorkerConfig } from '@/lib/ai/config';
import { processAiWorkerBatch } from '@/lib/ai/worker';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logInfo } from '@/lib/utils/logger';

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

class DbBackedAiRunExecutor implements AiRunExecutor {
  async enqueue(input: EnqueueAiRunInput): Promise<{ accepted: boolean; mode: 'db-backed' }> {
    logInfo('ai-executor', 'Queued AI run for db-backed async processing', {
      runId: input.runId,
      feature: input.feature,
      requestedBy: input.requestedBy,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
    });

    if (process.env.AI_EXECUTOR_INLINE === '1') {
      const serviceClient = createServiceRoleClient();

      if (serviceClient) {
        const workerConfig = getAiWorkerConfig();

        await processAiWorkerBatch(serviceClient, {
          processorId: `inline-${process.pid}-${Date.now()}`,
          batchSize: 1,
          leaseSeconds: workerConfig.leaseSeconds,
          maxAttempts: workerConfig.maxRetries,
          timeoutMs: workerConfig.timeoutMs,
          backoffBaseMs: workerConfig.backoffBaseMs,
        });
      }
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
