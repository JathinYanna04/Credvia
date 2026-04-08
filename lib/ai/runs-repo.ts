import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { assertAllowedTransition, statusTimestampPatch } from '@/lib/ai/lifecycle';
import { AiRuntimeError } from '@/lib/ai/errors';
import type { AiFeature, AiRunStatus, AiRunSummary, AiSubjectType } from '@/lib/types';

type TypedSupabaseClient = SupabaseClient<Database>;
type AiRunRow = Database['public']['Tables']['ai_runs']['Row'];

type AiRunUpdate = Database['public']['Tables']['ai_runs']['Update'];

export interface AiRunClaimedLease {
  runId: string;
  processorId: string;
  leaseToken: string;
  leaseExpiresAt: string;
}

export interface CreateAiRunInput {
  feature: AiFeature;
  subjectType: AiSubjectType;
  subjectId: string;
  requestedBy: string;
  promptVersion: string;
  promptKey: string;
  inputHash: string;
  runIdentity: string;
  forceRegenerate?: boolean;
  maxAttempts?: number;
  parentRunId?: string | null;
  traceId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateOrReuseAiRunResult {
  run: AiRunSummary;
  reused: boolean;
}

interface UpdateAiRunInput {
  runId: string;
  status: AiRunStatus;
  provider?: string | null;
  model?: string | null;
  modelVersion?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  latencyMs?: number | null;
  providerMetadata?: Record<string, unknown>;
  completedReason?: string | null;
}

export interface ClaimAiRunsInput {
  processorId: string;
  batchSize: number;
  leaseSeconds: number;
  maxAttempts: number;
}

export interface RequeueAiRunInput {
  runId: string;
  processorId: string;
  leaseToken: string;
  errorCode: string;
  errorMessage: string;
  backoffMs: number;
}

export interface CompleteAiRunInput {
  runId: string;
  processorId: string;
  leaseToken: string;
  provider?: string | null;
  model?: string | null;
  modelVersion?: string | null;
  latencyMs?: number | null;
  providerMetadata?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
}

function toRecord(value: Database['public']['Tables']['ai_runs']['Row']['metadata']) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function toAiRunSummary(row: AiRunRow): AiRunSummary {
  return {
    id: row.id,
    feature: row.feature as AiFeature,
    subjectType: row.subject_type as AiSubjectType,
    subjectId: row.subject_id,
    requestedBy: row.requested_by,
    status: row.status as AiRunStatus,
    promptVersion: row.prompt_version,
    promptKey: row.prompt_key,
    inputHash: row.input_hash,
    runIdentity: row.run_identity,
    maxAttempts: row.max_attempts,
    attemptCount: row.attempt_count,
    latencyMs: row.latency_ms,
    provider: row.provider,
    model: row.model,
    modelVersion: row.model_version,
    requestId: row.request_id,
    traceId: row.trace_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    metadata: toRecord(row.metadata),
    providerMetadata: toRecord(row.provider_metadata),
    processorId: row.processor_id,
    leaseToken: row.lease_token,
    leaseExpiresAt: row.lease_expires_at,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
  };
}

async function insertAiRun(
  supabase: TypedSupabaseClient,
  input: CreateAiRunInput,
): Promise<AiRunSummary> {
  const insertResult = await supabase
    .from('ai_runs')
    .insert({
      feature: input.feature,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      requested_by: input.requestedBy,
      status: 'queued',
      prompt_version: input.promptVersion,
      prompt_key: input.promptKey,
      input_hash: input.inputHash,
      run_identity: input.runIdentity,
      max_attempts: input.maxAttempts ?? 3,
      parent_run_id: input.parentRunId ?? null,
      trace_id: input.traceId ?? null,
      request_id: input.requestId ?? null,
      metadata: (input.metadata ?? {}) as Database['public']['Tables']['ai_runs']['Insert']['metadata'],
    })
    .select('*')
    .single();

  if (insertResult.error || !insertResult.data) {
    throw new Error(insertResult.error?.message ?? 'Failed to create AI run.');
  }

  return toAiRunSummary(insertResult.data);
}

export async function findReusableSucceededRun(
  supabase: TypedSupabaseClient,
  requestedBy: string,
  runIdentity: string,
): Promise<AiRunSummary | null> {
  const result = await supabase
    .from('ai_runs')
    .select('*')
    .eq('requested_by', requestedBy)
    .eq('run_identity', runIdentity)
    .eq('status', 'succeeded')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    return null;
  }

  return toAiRunSummary(result.data);
}

export async function createOrReuseAiRun(
  supabase: TypedSupabaseClient,
  input: CreateAiRunInput,
): Promise<CreateOrReuseAiRunResult> {
  if (!input.forceRegenerate) {
    const reusable = await findReusableSucceededRun(supabase, input.requestedBy, input.runIdentity);

    if (reusable) {
      return {
        run: reusable,
        reused: true,
      };
    }
  }

  const run = await insertAiRun(supabase, input);
  return {
    run,
    reused: false,
  };
}

export async function createAiRun(
  supabase: TypedSupabaseClient,
  input: CreateAiRunInput,
): Promise<AiRunSummary> {
  const result = await createOrReuseAiRun(supabase, input);
  return result.run;
}

export async function getAiRunById(
  supabase: TypedSupabaseClient,
  runId: string,
): Promise<AiRunSummary | null> {
  const result = await supabase
    .from('ai_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    return null;
  }

  return toAiRunSummary(result.data);
}

export async function listAiRunsByRequester(
  supabase: TypedSupabaseClient,
  requestedBy: string,
  limit = 50,
): Promise<AiRunSummary[]> {
  const result = await supabase
    .from('ai_runs')
    .select('*')
    .eq('requested_by', requestedBy)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []).map(toAiRunSummary);
}

export async function updateAiRunStatus(
  supabase: TypedSupabaseClient,
  input: UpdateAiRunInput,
): Promise<void> {
  const currentResult = await supabase
    .from('ai_runs')
    .select('id, status')
    .eq('id', input.runId)
    .maybeSingle();

  if (currentResult.error) {
    throw new Error(currentResult.error.message);
  }

  if (!currentResult.data) {
    throw new Error('AI run not found.');
  }

  assertAllowedTransition(currentResult.data.status as AiRunStatus, input.status);

  const patch: AiRunUpdate = {
    status: input.status,
    provider: input.provider ?? null,
    model: input.model ?? null,
    model_version: input.modelVersion ?? null,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    latency_ms: input.latencyMs ?? null,
    provider_metadata: (input.providerMetadata ?? {}) as AiRunUpdate['provider_metadata'],
    completed_reason: input.completedReason ?? null,
  };

  Object.assign(patch, statusTimestampPatch(input.status));

  const result = await supabase
    .from('ai_runs')
    .update(patch)
    .eq('id', input.runId)
    .eq('status', currentResult.data.status);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function claimAiRuns(
  supabase: TypedSupabaseClient,
  input: ClaimAiRunsInput,
): Promise<AiRunSummary[]> {
  const result = await supabase.rpc('claim_ai_runs', {
    p_worker_id: input.processorId,
    p_batch_size: input.batchSize,
    p_lease_seconds: input.leaseSeconds,
    p_max_attempts: input.maxAttempts,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []).map((row) => toAiRunSummary(row as AiRunRow));
}

export async function heartbeatAiRunLease(
  supabase: TypedSupabaseClient,
  input: {
    runId: string;
    processorId: string;
    leaseToken: string;
    leaseSeconds: number;
  },
): Promise<boolean> {
  const nextLease = new Date(Date.now() + input.leaseSeconds * 1000).toISOString();

  const result = await supabase
    .from('ai_runs')
    .update({
      lease_expires_at: nextLease,
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq('id', input.runId)
    .eq('processor_id', input.processorId)
    .eq('lease_token', input.leaseToken)
    .eq('status', 'running')
    .select('id')
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return Boolean(result.data);
}

export async function requeueAiRun(
  supabase: TypedSupabaseClient,
  input: RequeueAiRunInput,
): Promise<boolean> {
  const nextRetryAt = new Date(Date.now() + input.backoffMs).toISOString();

  const result = await supabase
    .from('ai_runs')
    .update({
      status: 'queued',
      error_code: input.errorCode,
      error_message: input.errorMessage,
      next_retry_at: nextRetryAt,
      processor_id: null,
      lease_token: null,
      lease_expires_at: null,
      completed_at: null,
      failed_at: null,
    })
    .eq('id', input.runId)
    .eq('processor_id', input.processorId)
    .eq('lease_token', input.leaseToken)
    .eq('status', 'running')
    .select('id')
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return Boolean(result.data);
}

export async function markAiRunSucceeded(
  supabase: TypedSupabaseClient,
  input: CompleteAiRunInput,
): Promise<boolean> {
  const patch: AiRunUpdate = {
    status: 'succeeded',
    provider: input.provider ?? null,
    model: input.model ?? null,
    model_version: input.modelVersion ?? null,
    latency_ms: input.latencyMs ?? null,
    provider_metadata: (input.providerMetadata ?? {}) as AiRunUpdate['provider_metadata'],
    completed_at: new Date().toISOString(),
    failed_at: null,
    error_code: null,
    error_message: null,
    processor_id: null,
    lease_token: null,
    lease_expires_at: null,
    completed_reason: 'succeeded',
  };

  const result = await supabase
    .from('ai_runs')
    .update(patch)
    .eq('id', input.runId)
    .eq('processor_id', input.processorId)
    .eq('lease_token', input.leaseToken)
    .eq('status', 'running')
    .select('id')
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return Boolean(result.data);
}

export async function markAiRunFailed(
  supabase: TypedSupabaseClient,
  input: CompleteAiRunInput,
): Promise<boolean> {
  const patch: AiRunUpdate = {
    status: 'failed',
    provider: input.provider ?? null,
    model: input.model ?? null,
    model_version: input.modelVersion ?? null,
    latency_ms: input.latencyMs ?? null,
    provider_metadata: (input.providerMetadata ?? {}) as AiRunUpdate['provider_metadata'],
    error_code: input.errorCode ?? 'AI_PROVIDER_UNAVAILABLE',
    error_message: input.errorMessage ?? 'AI run failed.',
    completed_at: new Date().toISOString(),
    failed_at: new Date().toISOString(),
    processor_id: null,
    lease_token: null,
    lease_expires_at: null,
    completed_reason: 'failed',
  };

  const result = await supabase
    .from('ai_runs')
    .update(patch)
    .eq('id', input.runId)
    .eq('processor_id', input.processorId)
    .eq('lease_token', input.leaseToken)
    .eq('status', 'running')
    .select('id')
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return Boolean(result.data);
}

export function assertRunClaimed(run: AiRunSummary) {
  if (!run.processorId || !run.leaseToken || !run.leaseExpiresAt) {
    throw new AiRuntimeError(
      'AI_RUN_CLAIM_CONFLICT',
      'AI run has no active lease claim.',
      409,
      { runId: run.id },
    );
  }
}
