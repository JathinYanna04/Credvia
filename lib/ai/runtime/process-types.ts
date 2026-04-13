import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import type { AiRunSummary } from '@/lib/types';

export interface ProcessOutputQualitySignal {
  confidence: number;
  reasoning: string[];
  stability: 'high' | 'medium' | 'low';
  repairCount: number;
  providerAttemptCount: number;
  parseFailureCount: number;
  validationFailureCount: number;
  missingFieldCount: number;
  outputLength: number;
}

export interface ProcessAiRunResult {
  provider?: string | null;
  model?: string | null;
  modelVersion?: string | null;
  latencyMs?: number | null;
  providerMetadata?: Record<string, unknown>;
  qualitySignal?: ProcessOutputQualitySignal;
}

export interface ProcessAiRunInput {
  supabase: SupabaseClient<Database>;
  run: AiRunSummary;
}