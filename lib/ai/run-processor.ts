import { executeProcessAiRunWorkflow } from '@/lib/ai/graphs/process-ai-run-workflow';
import type { ProcessAiRunInput, ProcessAiRunResult } from '@/lib/ai/runtime/process-types';
import { logError, logInfo } from '@/lib/utils/logger';

export type { ProcessAiRunInput, ProcessAiRunResult } from '@/lib/ai/runtime/process-types';

export async function processAiRunByFeature(
  input: ProcessAiRunInput,
): Promise<ProcessAiRunResult> {
  logInfo('ai-run-processor', 'processAiRunByFeature started', {
    runId: input.run.id,
    feature: input.run.feature,
    subjectType: input.run.subjectType,
    subjectId: input.run.subjectId,
    attemptCount: input.run.attemptCount ?? null,
  });

  try {
    const output = await executeProcessAiRunWorkflow(input);

    logInfo('ai-run-processor', 'processAiRunByFeature completed', {
      runId: input.run.id,
      feature: input.run.feature,
      provider: output.provider ?? null,
      model: output.modelVersion ?? output.model ?? null,
    });

    return output;
  } catch (error) {
    logError('ai-run-processor', 'processAiRunByFeature failed', {
      runId: input.run.id,
      feature: input.run.feature,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
}
