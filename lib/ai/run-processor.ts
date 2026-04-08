import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import type { AiRunSummary } from '@/lib/types';
import { AiRuntimeError } from '@/lib/ai/errors';
import { processCareerCopilotRun } from '@/lib/ai/features/career-copilot/service';
import { processFounderIdeaFeedbackRun } from '@/lib/ai/features/founder-feedback/service';
import { processModerationReviewRun } from '@/lib/ai/features/moderation-review/service';

export interface ProcessAiRunResult {
  provider?: string | null;
  model?: string | null;
  modelVersion?: string | null;
  latencyMs?: number | null;
  providerMetadata?: Record<string, unknown>;
}

export interface ProcessAiRunInput {
  supabase: SupabaseClient<Database>;
  run: AiRunSummary;
}

export async function processAiRunByFeature(
  input: ProcessAiRunInput,
): Promise<ProcessAiRunResult> {
  if (input.run.feature === 'founder_idea_feedback') {
    return processFounderIdeaFeedbackRun({
      supabase: input.supabase,
      run: input.run,
    });
  }

  if (input.run.feature === 'career_copilot') {
    return processCareerCopilotRun({
      supabase: input.supabase,
      run: input.run,
    });
  }

  if (input.run.feature === 'moderation_review') {
    return processModerationReviewRun({
      supabase: input.supabase,
      run: input.run,
    });
  }

  throw new AiRuntimeError(
    'AI_FEATURE_UNSUPPORTED',
    'No AI processor is registered for this feature yet.',
    501,
  );
}
