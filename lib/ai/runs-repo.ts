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
  decisionReason?:
    | 'reused_in_progress'
    | 'reused_success_cache'
    | 'created_new'
    | 'force_new_regenerate'
    | 'skipped_failed_terminal_created_new'
    | 'skipped_cancelled_created_new';
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
  providerMetadata?: Record<string, unknown>;
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

const REUSABLE_AI_RUN_STATUSES = new Set<AiRunStatus>([
  'queued',
  'running',
  'succeeded',
]);

export function isReusableAiRunStatus(status: string | null | undefined) {
  if (!status) {
    return false;
  }

  if (status === 'cancelled' || status === 'canceled') {
    return false;
  }

  return REUSABLE_AI_RUN_STATUSES.has(status as AiRunStatus);
}

function isTerminalNonReusableStatus(status: string | null | undefined) {
  return status === 'failed' || status === 'cancelled' || status === 'canceled';
}

function toRecord(value: Database['public']['Tables']['ai_runs']['Row']['metadata']) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function toAiRunSummary(row: AiRunRow): AiRunSummary {
  return {
    id: row.id,
    parentRunId: row.parent_run_id,
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
  const createdAt = new Date().toISOString();
  const insertResult = await supabase
    .from('ai_runs')
    .insert({
      feature: input.feature,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      requested_by: input.requestedBy,
      status: 'queued',
      attempt_count: 0,
      lease_expires_at: null,
      lease_token: null,
      processor_id: null,
      prompt_version: input.promptVersion,
      prompt_key: input.promptKey,
      input_hash: input.inputHash,
      run_identity: input.runIdentity,
      max_attempts: input.maxAttempts ?? 3,
      next_retry_at: createdAt,
      created_at: createdAt,
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

  const inserted = toAiRunSummary(insertResult.data);

  if (
    inserted.status !== 'queued'
    || inserted.attemptCount !== 0
    || inserted.leaseExpiresAt !== null
  ) {
    throw new AiRuntimeError(
      'AI_RUN_STATE_INVALID',
      'Inserted run is not claimable immediately after creation.',
      500,
      {
        runId: inserted.id,
        status: inserted.status,
        attemptCount: inserted.attemptCount,
        leaseExpiresAt: inserted.leaseExpiresAt,
      },
    );
  }

  return inserted;
}

function isDuplicateInsertError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('duplicate key') || normalized.includes('23505');
}

async function findLatestRunByIdentity(
  supabase: TypedSupabaseClient,
  requestedBy: string,
  runIdentity: string,
): Promise<AiRunSummary | null> {
  const result = await supabase
    .from('ai_runs')
    .select('*')
    .eq('requested_by', requestedBy)
    .eq('run_identity', runIdentity)
    .order('created_at', { ascending: false })
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

export async function findReusableActiveRun(
  supabase: TypedSupabaseClient,
  requestedBy: string,
  runIdentity: string,
): Promise<AiRunSummary | null> {
  const result = await supabase
    .from('ai_runs')
    .select('*')
    .eq('requested_by', requestedBy)
    .eq('run_identity', runIdentity)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
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

function buildRetryRunIdentity(baseRunIdentity: string) {
  return `${baseRunIdentity}:retry:${Date.now()}`;
}

export async function createOrReuseAiRun(
  supabase: TypedSupabaseClient,
  input: CreateAiRunInput,
): Promise<CreateOrReuseAiRunResult> {
  if (!input.forceRegenerate) {
    const activeRun = await findReusableActiveRun(supabase, input.requestedBy, input.runIdentity);

    if (activeRun) {
      return {
        run: activeRun,
        reused: true,
        decisionReason: 'reused_in_progress',
      };
    }

    const reusable = await findReusableSucceededRun(supabase, input.requestedBy, input.runIdentity);

    if (reusable) {
      return {
        run: reusable,
        reused: true,
        decisionReason: 'reused_success_cache',
      };
    }
  }

  try {
    const run = await insertAiRun(supabase, input);
    return {
      run,
      reused: false,
      decisionReason: input.forceRegenerate ? 'force_new_regenerate' : 'created_new',
    };
  } catch (error) {
    if (!isDuplicateInsertError(error)) {
      throw error;
    }

    if (input.forceRegenerate) {
      const regenerateRun = await insertAiRun(supabase, {
        ...input,
        runIdentity: `${input.runIdentity}:regen:${Date.now()}`,
      });

      return {
        run: regenerateRun,
        reused: false,
        decisionReason: 'force_new_regenerate',
      };
    }

    const latest = await findLatestRunByIdentity(supabase, input.requestedBy, input.runIdentity);
    if (!latest) {
      throw error;
    }

    if (isTerminalNonReusableStatus(latest.status)) {
      const retryRun = await insertAiRun(supabase, {
        ...input,
        runIdentity: buildRetryRunIdentity(input.runIdentity),
        parentRunId: latest.id,
      });

      return {
        run: retryRun,
        reused: false,
        decisionReason: latest.status === 'failed'
          ? 'skipped_failed_terminal_created_new'
          : 'skipped_cancelled_created_new',
      };
    }

    if (isReusableAiRunStatus(latest.status)) {
      return {
        run: latest,
        reused: true,
        decisionReason: latest.status === 'succeeded' ? 'reused_success_cache' : 'reused_in_progress',
      };
    }

    throw error;
  }
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
      provider_metadata: (input.providerMetadata ?? {}) as AiRunUpdate['provider_metadata'],
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
