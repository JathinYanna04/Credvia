import { beforeEach, describe, expect, it, vi } from 'vitest';

const claimAiRuns = vi.fn();
const heartbeatAiRunLease = vi.fn();
const markAiRunFailed = vi.fn();
const markAiRunSucceeded = vi.fn();
const requeueAiRun = vi.fn();
const processAiRunByFeature = vi.fn();

vi.mock('@/lib/ai/runs-repo', () => ({
  claimAiRuns,
  heartbeatAiRunLease,
  markAiRunFailed,
  markAiRunSucceeded,
  requeueAiRun,
}));

vi.mock('@/lib/ai/run-processor', () => ({
  processAiRunByFeature,
}));

describe('ai worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks run succeeded when processing succeeds', async () => {
    claimAiRuns.mockResolvedValue([
      {
        id: 'run-1',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-1',
        requestedBy: 'user-1',
        status: 'running',
        promptVersion: 'v1',
        createdAt: new Date().toISOString(),
        processorId: 'worker-1',
        leaseToken: 'lease-1',
        leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
        attemptCount: 1,
        maxAttempts: 3,
      },
    ]);
    processAiRunByFeature.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-test',
      modelVersion: 'gpt-test-1',
      latencyMs: 100,
      providerMetadata: {},
    });
    markAiRunSucceeded.mockResolvedValue(true);

    const { processAiWorkerBatch } = await import('@/lib/ai/worker');

    const result = await processAiWorkerBatch({} as never, {
      processorId: 'worker-1',
      batchSize: 5,
      leaseSeconds: 30,
      maxAttempts: 3,
      timeoutMs: 2000,
      backoffBaseMs: 1000,
    });

    expect(result).toEqual({ claimed: 1, succeeded: 1, retried: 0, failed: 0 });
    expect(markAiRunSucceeded).toHaveBeenCalled();
  });

  it('requeues transient failures before max attempts', async () => {
    claimAiRuns.mockResolvedValue([
      {
        id: 'run-2',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-2',
        requestedBy: 'user-2',
        status: 'running',
        promptVersion: 'v1',
        createdAt: new Date().toISOString(),
        processorId: 'worker-2',
        leaseToken: 'lease-2',
        leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
        attemptCount: 1,
        maxAttempts: 3,
      },
    ]);
    processAiRunByFeature.mockRejectedValue(new Error('temporary failure'));
    requeueAiRun.mockResolvedValue(true);

    const { processAiWorkerBatch } = await import('@/lib/ai/worker');

    const result = await processAiWorkerBatch({} as never, {
      processorId: 'worker-2',
      batchSize: 5,
      leaseSeconds: 30,
      maxAttempts: 3,
      timeoutMs: 2000,
      backoffBaseMs: 1000,
    });

    expect(result).toEqual({ claimed: 1, succeeded: 0, retried: 1, failed: 0 });
    expect(requeueAiRun).toHaveBeenCalled();
    expect(markAiRunFailed).not.toHaveBeenCalled();
  });

  it('marks run failed when max attempts are reached', async () => {
    claimAiRuns.mockResolvedValue([
      {
        id: 'run-3',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-3',
        requestedBy: 'user-3',
        status: 'running',
        promptVersion: 'v1',
        createdAt: new Date().toISOString(),
        processorId: 'worker-3',
        leaseToken: 'lease-3',
        leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
        attemptCount: 3,
        maxAttempts: 3,
      },
    ]);
    processAiRunByFeature.mockRejectedValue(new Error('hard failure'));
    markAiRunFailed.mockResolvedValue(true);

    const { processAiWorkerBatch } = await import('@/lib/ai/worker');

    const result = await processAiWorkerBatch({} as never, {
      processorId: 'worker-3',
      batchSize: 5,
      leaseSeconds: 30,
      maxAttempts: 3,
      timeoutMs: 2000,
      backoffBaseMs: 1000,
    });

    expect(result).toEqual({ claimed: 1, succeeded: 0, retried: 0, failed: 1 });
    expect(requeueAiRun).not.toHaveBeenCalled();
    expect(markAiRunFailed).toHaveBeenCalled();
  });

  it('processes multiple claimed runs in one batch', async () => {
    claimAiRuns.mockResolvedValue([
      {
        id: 'run-4',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-4',
        requestedBy: 'user-4',
        status: 'running',
        promptVersion: 'v1',
        createdAt: new Date().toISOString(),
        processorId: 'worker-4',
        leaseToken: 'lease-4',
        leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
        attemptCount: 1,
        maxAttempts: 3,
      },
      {
        id: 'run-5',
        feature: 'moderation_review',
        subjectType: 'report',
        subjectId: 'report-5',
        requestedBy: 'moderator-5',
        status: 'running',
        promptVersion: 'v1',
        createdAt: new Date().toISOString(),
        processorId: 'worker-4',
        leaseToken: 'lease-5',
        leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
        attemptCount: 1,
        maxAttempts: 3,
      },
    ]);

    processAiRunByFeature
      .mockResolvedValueOnce({
        provider: 'groq',
        model: 'llama-3.3-70b',
        modelVersion: 'llama-3.3-70b',
        latencyMs: 110,
        providerMetadata: {},
      })
      .mockResolvedValueOnce({
        provider: 'groq',
        model: 'llama-3.3-70b',
        modelVersion: 'llama-3.3-70b',
        latencyMs: 95,
        providerMetadata: {},
      });

    markAiRunSucceeded.mockResolvedValue(true);

    const { processAiWorkerBatch } = await import('@/lib/ai/worker');

    const result = await processAiWorkerBatch({} as never, {
      processorId: 'worker-4',
      batchSize: 5,
      leaseSeconds: 30,
      maxAttempts: 3,
      timeoutMs: 2000,
      backoffBaseMs: 1000,
    });

    expect(result).toEqual({ claimed: 2, succeeded: 2, retried: 0, failed: 0 });
    expect(markAiRunSucceeded).toHaveBeenCalledTimes(2);
  });
});
