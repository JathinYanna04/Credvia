import { executeProcessAiRunWorkflow } from '@/lib/ai/graphs/process-ai-run-workflow';
import type { ProcessAiRunInput, ProcessAiRunResult } from '@/lib/ai/runtime/process-types';

export type { ProcessAiRunInput, ProcessAiRunResult } from '@/lib/ai/runtime/process-types';

export async function processAiRunByFeature(
  input: ProcessAiRunInput,
): Promise<ProcessAiRunResult> {
  return executeProcessAiRunWorkflow(input);
}
