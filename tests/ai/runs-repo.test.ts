import { describe, expect, it, vi } from 'vitest';
import { createOrReuseAiRun, isReusableAiRunStatus } from '@/lib/ai/runs-repo';

function buildRunRow(
  status: 'queued' | 'running' | 'succeeded' | 'failed',
  overrides: Record<string, unknown> = {},
) {
  const now = new Date().toISOString();

  return {
    id: `run-${status}`,
    feature: 'founder_idea_feedback',
    subject_type: 'startup_idea',
    subject_id: 'idea-1',
    requested_by: 'user-1',
    status,
    provider: null,
    model: null,
    model_version: null,
    prompt_version: 'founder-v1',
    prompt_key: 'founder-feedback-core',
    input_hash: 'hash-1',
    run_identity: 'identity-1',
    input_schema_version: 'v1',
    output_schema_version: 'v1',
    request_id: null,
    trace_id: 'trace-1',
    error_code: status === 'failed' ? 'AI_PROVIDER_NOT_CONFIGURED' : null,
    error_message:
      status === 'failed'
        ? 'AI review is not configured yet. Groq is selected, but no API key is available to process this request.'
        : null,
    metadata: {},
    provider_metadata: {},
    attempt_count: status === 'failed' ? 2 : 0,
    max_attempts: 3,
    latency_ms: null,
    created_at: now,
    started_at: status === 'running' ? now : null,
    completed_at: status === 'succeeded' ? now : null,
    failed_at: status === 'failed' ? now : null,
    next_retry_at: now,
    lease_token: null,
    processor_id: null,
    lease_expires_at: null,
    last_heartbeat_at: null,
    timeout_at: null,
    parent_run_id: null,
    output_checksum: null,
    completed_reason: null,
    ...overrides,
  };
}

function createSupabaseStub(args: {
  maybeSingleQueue: Array<{ data: unknown; error: { message: string } | null }>;
  insertSingleQueue: Array<{ data: unknown; error: { message: string } | null }>;
}) {
  const maybeSingleQueue = [...args.maybeSingleQueue];
  const insertSingleQueue = [...args.insertSingleQueue];
  const insertPayloads: Array<Record<string, unknown>> = [];

  const maybeSingle = vi.fn(async () => {
    return maybeSingleQueue.shift() ?? { data: null, error: null };
  });

  const single = vi.fn(async () => {
    return insertSingleQueue.shift() ?? { data: null, error: null };
  });

  const selectBuilder = {
    eq: vi.fn(() => selectBuilder),
    in: vi.fn(() => selectBuilder),
    order: vi.fn(() => selectBuilder),
    limit: vi.fn(() => selectBuilder),
    gte: vi.fn(() => selectBuilder),
    maybeSingle,
  };

  const insertBuilder = {
    select: vi.fn(() => ({ single })),
  };

  const tableBuilder = {
    select: vi.fn(() => selectBuilder),
    insert: vi.fn((payload: Record<string, unknown>) => {
      insertPayloads.push(payload);
      return insertBuilder;
    }),
  };

  return {
    client: {
      from: vi.fn(() => tableBuilder),
    } as unknown as Parameters<typeof createOrReuseAiRun>[0],
    insertPayloads,
  };
}

describe('runs repo reuse policy', () => {
  it('uses strict reusable status allowlist', () => {
    expect(isReusableAiRunStatus('queued')).toBe(true);
    expect(isReusableAiRunStatus('running')).toBe(true);
    expect(isReusableAiRunStatus('succeeded')).toBe(true);
    expect(isReusableAiRunStatus('failed')).toBe(false);
    expect(isReusableAiRunStatus('cancelled')).toBe(false);
    expect(isReusableAiRunStatus(null)).toBe(false);
  });

  it('inserts new runs with claimable defaults', async () => {
    const queuedRun = buildRunRow('queued', { id: 'run-created-1' });

    const supabase = createSupabaseStub({
      maybeSingleQueue: [
        { data: null, error: null },
        { data: null, error: null },
      ],
      insertSingleQueue: [{ data: queuedRun, error: null }],
    });

    const result = await createOrReuseAiRun(supabase.client, {
      feature: 'founder_idea_feedback',
      subjectType: 'startup_idea',
      subjectId: 'idea-1',
      requestedBy: 'user-1',
      promptVersion: 'founder-v1',
      promptKey: 'founder-feedback-core',
      inputHash: 'hash-1',
      runIdentity: 'identity-claimable-defaults',
    });

    expect(result.reused).toBe(false);
    expect(result.run.id).toBe('run-created-1');

    const insertPayload = supabase.insertPayloads[0] ?? {};
    expect(insertPayload).toEqual(expect.objectContaining({
      status: 'queued',
      attempt_count: 0,
      lease_expires_at: null,
      lease_token: null,
      processor_id: null,
    }));
    expect(typeof insertPayload.created_at).toBe('string');
  });

  it('does not reuse failed run on duplicate identity and creates a fresh retry run', async () => {
    const failedRun = buildRunRow('failed', { id: 'run-failed-1' });
    const newQueuedRun = buildRunRow('queued', {
      id: 'run-new-1',
      run_identity: 'identity-1:retry:1',
      parent_run_id: 'run-failed-1',
    });

    const supabase = createSupabaseStub({
      maybeSingleQueue: [
        { data: null, error: null },
        { data: null, error: null },
        { data: failedRun, error: null },
      ],
      insertSingleQueue: [
        { data: null, error: { message: 'duplicate key value violates unique constraint' } },
        { data: newQueuedRun, error: null },
      ],
    });

    const result = await createOrReuseAiRun(supabase.client, {
      feature: 'founder_idea_feedback',
      subjectType: 'startup_idea',
      subjectId: 'idea-1',
      requestedBy: 'user-1',
      promptVersion: 'founder-v1',
      promptKey: 'founder-feedback-core',
      inputHash: 'hash-1',
      runIdentity: 'identity-1',
    });

    expect(result.reused).toBe(false);
    expect(result.run.id).toBe('run-new-1');
    expect(result.decisionReason).toBe('skipped_failed_terminal_created_new');
    expect(supabase.insertPayloads.length).toBe(2);
    expect(supabase.insertPayloads[1]?.parent_run_id).toBe('run-failed-1');
    expect(String(supabase.insertPayloads[1]?.run_identity)).toMatch(/^identity-1:retry:/);
  });

  it('reuses queued run with same identity', async () => {
    const queuedRun = buildRunRow('queued', { id: 'run-queued-1' });

    const supabase = createSupabaseStub({
      maybeSingleQueue: [{ data: queuedRun, error: null }],
      insertSingleQueue: [],
    });

    const result = await createOrReuseAiRun(supabase.client, {
      feature: 'founder_idea_feedback',
      subjectType: 'startup_idea',
      subjectId: 'idea-1',
      requestedBy: 'user-1',
      promptVersion: 'founder-v1',
      promptKey: 'founder-feedback-core',
      inputHash: 'hash-1',
      runIdentity: 'identity-1',
    });

    expect(result.reused).toBe(true);
    expect(result.run.id).toBe('run-queued-1');
    expect(result.decisionReason).toBe('reused_in_progress');
    expect(supabase.insertPayloads.length).toBe(0);
  });

  it('reuses running run with same identity', async () => {
    const runningRun = buildRunRow('running', { id: 'run-running-1' });

    const supabase = createSupabaseStub({
      maybeSingleQueue: [{ data: runningRun, error: null }],
      insertSingleQueue: [],
    });

    const result = await createOrReuseAiRun(supabase.client, {
      feature: 'founder_idea_feedback',
      subjectType: 'startup_idea',
      subjectId: 'idea-1',
      requestedBy: 'user-1',
      promptVersion: 'founder-v1',
      promptKey: 'founder-feedback-core',
      inputHash: 'hash-1',
      runIdentity: 'identity-1',
    });

    expect(result.reused).toBe(true);
    expect(result.run.id).toBe('run-running-1');
    expect(result.decisionReason).toBe('reused_in_progress');
    expect(supabase.insertPayloads.length).toBe(0);
  });

  it('reuses succeeded run as deliberate success cache behavior', async () => {
    const succeededRun = buildRunRow('succeeded', { id: 'run-succeeded-1' });

    const supabase = createSupabaseStub({
      maybeSingleQueue: [
        { data: null, error: null },
        { data: succeededRun, error: null },
      ],
      insertSingleQueue: [],
    });

    const result = await createOrReuseAiRun(supabase.client, {
      feature: 'founder_idea_feedback',
      subjectType: 'startup_idea',
      subjectId: 'idea-1',
      requestedBy: 'user-1',
      promptVersion: 'founder-v1',
      promptKey: 'founder-feedback-core',
      inputHash: 'hash-1',
      runIdentity: 'identity-1',
    });

    expect(result.reused).toBe(true);
    expect(result.run.id).toBe('run-succeeded-1');
    expect(result.decisionReason).toBe('reused_success_cache');
    expect(supabase.insertPayloads.length).toBe(0);
  });
});
