import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiRuntimeError } from '@/lib/ai/errors';

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
    const markSucceededArgs = markAiRunSucceeded.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(markSucceededArgs).toEqual(
      expect.objectContaining({
        runId: 'run-1',
        processorId: 'worker-1',
        leaseToken: 'lease-1',
        provider: 'openai',
        model: 'gpt-test',
        modelVersion: 'gpt-test-1',
        latencyMs: 100,
        providerMetadata: {},
      }),
    );
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

  it('requeues rate-limited provider failures and honors retry-after', async () => {
    claimAiRuns.mockResolvedValue([
      {
        id: 'run-rate-limit-1',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-rate-limit-1',
        requestedBy: 'user-rate-limit-1',
        status: 'running',
        promptVersion: 'v1',
        createdAt: new Date().toISOString(),
        processorId: 'worker-rate-limit-1',
        leaseToken: 'lease-rate-limit-1',
        leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
        attemptCount: 1,
        maxAttempts: 3,
      },
    ]);

    processAiRunByFeature.mockRejectedValue(
      new AiRuntimeError(
        'RATE_LIMITED',
        'AI review is temporarily rate-limited. Please retry in a few seconds.',
        429,
        {
          provider: 'groq',
          status: 429,
          requestId: 'req-rate-limit-1',
          retryAfterSeconds: 6,
          rateLimitHeaders: {
            'retry-after': '6',
          },
        },
      ),
    );
    requeueAiRun.mockResolvedValue(true);

    const { processAiWorkerBatch } = await import('@/lib/ai/worker');

    const result = await processAiWorkerBatch({} as never, {
      processorId: 'worker-rate-limit-1',
      batchSize: 5,
      leaseSeconds: 30,
      maxAttempts: 3,
      timeoutMs: 2000,
      backoffBaseMs: 1000,
    });

    expect(result).toEqual({ claimed: 1, succeeded: 0, retried: 1, failed: 0 });
    expect(markAiRunFailed).not.toHaveBeenCalled();
    expect(requeueAiRun).toHaveBeenCalledTimes(1);
    const requeueArgs = requeueAiRun.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(requeueArgs.backoffMs).toBe(6000);
    expect(requeueArgs.providerMetadata).toEqual(
      expect.objectContaining({
        errorCode: 'RATE_LIMITED',
        retryAfterSeconds: 6,
        requestId: 'req-rate-limit-1',
        rateLimitHeaders: expect.objectContaining({
          'retry-after': '6',
        }),
      }),
    );
  });

  it('does not retry provider-not-configured failures and marks run failed immediately', async () => {
    claimAiRuns.mockResolvedValue([
      {
        id: 'run-config-missing-1',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-config-missing-1',
        requestedBy: 'user-config-missing-1',
        status: 'running',
        promptVersion: 'v1',
        createdAt: new Date().toISOString(),
        processorId: 'worker-config-missing-1',
        leaseToken: 'lease-config-missing-1',
        leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
        attemptCount: 1,
        maxAttempts: 3,
      },
    ]);

    processAiRunByFeature.mockRejectedValue(
      new AiRuntimeError(
        'AI_PROVIDER_NOT_CONFIGURED',
        'AI review is not configured yet. Groq is selected, but no API key is available to process this request.',
        503,
        {
          provider: 'groq',
          requiredEnvVars: ['AI_GROQ_API_KEY'],
        },
      ),
    );
    markAiRunFailed.mockResolvedValue(true);

    const { processAiWorkerBatch } = await import('@/lib/ai/worker');

    const result = await processAiWorkerBatch({} as never, {
      processorId: 'worker-config-missing-1',
      batchSize: 5,
      leaseSeconds: 30,
      maxAttempts: 3,
      timeoutMs: 2000,
      backoffBaseMs: 1000,
    });

    expect(result).toEqual({ claimed: 1, succeeded: 0, retried: 0, failed: 1 });
    expect(requeueAiRun).not.toHaveBeenCalled();
    expect(markAiRunFailed).toHaveBeenCalledTimes(1);
    const markFailedArgs = markAiRunFailed.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(markFailedArgs.providerMetadata).toEqual(
      expect.objectContaining({
        errorCode: 'AI_PROVIDER_NOT_CONFIGURED',
        provider: 'groq',
      }),
    );
  });

  it('does not retry validation failures and marks run failed immediately', async () => {
    claimAiRuns.mockResolvedValue([
      {
        id: 'run-validation-failure-1',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-validation-failure-1',
        requestedBy: 'user-validation-failure-1',
        status: 'running',
        promptVersion: 'v1',
        createdAt: new Date().toISOString(),
        processorId: 'worker-validation-failure-1',
        leaseToken: 'lease-validation-failure-1',
        leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
        attemptCount: 1,
        maxAttempts: 3,
      },
    ]);

    processAiRunByFeature.mockRejectedValue(
      new AiRuntimeError(
        'VALIDATION_ERROR',
        'Structured output payload did not satisfy schema constraints.',
        400,
      ),
    );
    markAiRunFailed.mockResolvedValue(true);

    const { processAiWorkerBatch } = await import('@/lib/ai/worker');

    const result = await processAiWorkerBatch({} as never, {
      processorId: 'worker-validation-failure-1',
      batchSize: 5,
      leaseSeconds: 30,
      maxAttempts: 3,
      timeoutMs: 2000,
      backoffBaseMs: 1000,
    });

    expect(result).toEqual({ claimed: 1, succeeded: 0, retried: 0, failed: 1 });
    expect(requeueAiRun).not.toHaveBeenCalled();
    expect(markAiRunFailed).toHaveBeenCalledTimes(1);
  });

  it('persists structured-output repair diagnostics on terminal repair failure', async () => {
    claimAiRuns.mockResolvedValue([
      {
        id: 'run-repair-failure-1',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-repair-failure-1',
        requestedBy: 'user-repair-failure-1',
        status: 'running',
        promptVersion: 'v1',
        createdAt: new Date().toISOString(),
        processorId: 'worker-repair-failure-1',
        leaseToken: 'lease-repair-failure-1',
        leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
        attemptCount: 1,
        maxAttempts: 3,
      },
    ]);

    processAiRunByFeature.mockRejectedValue(
      new AiRuntimeError(
        'AI_OUTPUT_REPAIR_FAILED',
        'The model output did not pass schema validation after strict and fallback repair attempts.',
        422,
        {
          provider: 'groq',
          model: 'llama-3.3-70b',
          requestId: 'req-fallback-terminal',
          strictFailure: {
            provider: 'groq',
            model: 'llama-3.3-70b',
            requestId: 'req-strict-terminal',
            validationIssues: ['summary: Required'],
          },
          fallbackFailure: {
            provider: 'groq',
            model: 'llama-3.3-70b',
            requestId: 'req-fallback-terminal',
            parseIssues: ['direct: Unexpected token'],
            validationIssues: ['rewrite: Expected string'],
            parseFailureCount: 1,
            validationFailureCount: 1,
            repairCount: 1,
            lastOutputHash: 'hash-terminal',
            lastOutputLength: 178,
          },
        },
      ),
    );
    markAiRunFailed.mockResolvedValue(true);

    const { processAiWorkerBatch } = await import('@/lib/ai/worker');

    const result = await processAiWorkerBatch({} as never, {
      processorId: 'worker-repair-failure-1',
      batchSize: 5,
      leaseSeconds: 30,
      maxAttempts: 3,
      timeoutMs: 2000,
      backoffBaseMs: 1000,
    });

    expect(result).toEqual({ claimed: 1, succeeded: 0, retried: 0, failed: 1 });
    expect(requeueAiRun).not.toHaveBeenCalled();
    expect(markAiRunFailed).toHaveBeenCalledTimes(1);

    const markFailedArgs = markAiRunFailed.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(markFailedArgs.providerMetadata).toEqual(
      expect.objectContaining({
        errorCode: 'AI_OUTPUT_REPAIR_FAILED',
        provider: 'groq',
        model: 'llama-3.3-70b',
        requestId: 'req-fallback-terminal',
        parseFailureCount: 1,
        validationFailureCount: 1,
        repairCount: 1,
        parseIssues: expect.arrayContaining(['direct: Unexpected token']),
        validationIssues: expect.arrayContaining(['rewrite: Expected string']),
        strictFailure: expect.objectContaining({
          requestId: 'req-strict-terminal',
        }),
        fallbackFailure: expect.objectContaining({
          requestId: 'req-fallback-terminal',
        }),
      }),
    );
  });

  it('marks rate-limited runs failed after max attempts are reached', async () => {
    claimAiRuns.mockResolvedValue([
      {
        id: 'run-rate-limit-max-attempts-1',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-rate-limit-max-attempts-1',
        requestedBy: 'user-rate-limit-max-attempts-1',
        status: 'running',
        promptVersion: 'v1',
        createdAt: new Date().toISOString(),
        processorId: 'worker-rate-limit-max-attempts-1',
        leaseToken: 'lease-rate-limit-max-attempts-1',
        leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
        attemptCount: 3,
        maxAttempts: 3,
      },
    ]);

    processAiRunByFeature.mockRejectedValue(
      new AiRuntimeError(
        'RATE_LIMITED',
        'AI review is temporarily rate-limited. Please retry in a few seconds.',
        429,
        {
          provider: 'groq',
          status: 429,
          requestId: 'req-rate-limit-max-attempts-1',
          retryAfterSeconds: 6,
        },
      ),
    );
    markAiRunFailed.mockResolvedValue(true);

    const { processAiWorkerBatch } = await import('@/lib/ai/worker');

    const result = await processAiWorkerBatch({} as never, {
      processorId: 'worker-rate-limit-max-attempts-1',
      batchSize: 5,
      leaseSeconds: 30,
      maxAttempts: 3,
      timeoutMs: 2000,
      backoffBaseMs: 1000,
    });

    expect(result).toEqual({ claimed: 1, succeeded: 0, retried: 0, failed: 1 });
    expect(requeueAiRun).not.toHaveBeenCalled();
    expect(markAiRunFailed).toHaveBeenCalledTimes(1);
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

  it('deduplicates duplicate claimed run ids in a single batch', async () => {
    const duplicatedRun = {
      id: 'run-dup-1',
      feature: 'founder_idea_feedback',
      subjectType: 'startup_idea',
      subjectId: 'idea-dup-1',
      requestedBy: 'user-dup-1',
      status: 'running',
      promptVersion: 'v1',
      createdAt: new Date().toISOString(),
      processorId: 'worker-dup-1',
      leaseToken: 'lease-dup-1',
      leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
      attemptCount: 1,
      maxAttempts: 3,
    };

    claimAiRuns.mockResolvedValue([
      duplicatedRun,
      duplicatedRun,
      {
        ...duplicatedRun,
        id: 'run-dup-2',
        subjectId: 'idea-dup-2',
        leaseToken: 'lease-dup-2',
      },
    ]);

    processAiRunByFeature.mockResolvedValue({
      provider: 'groq',
      model: 'llama-3.3-70b',
      modelVersion: 'llama-3.3-70b',
      latencyMs: 90,
      providerMetadata: {},
    });
    markAiRunSucceeded.mockResolvedValue(true);

    const { processAiWorkerBatch } = await import('@/lib/ai/worker');

    const result = await processAiWorkerBatch({} as never, {
      processorId: 'worker-dup-1',
      batchSize: 5,
      leaseSeconds: 30,
      maxAttempts: 3,
      timeoutMs: 2000,
      backoffBaseMs: 1000,
      parallelism: 2,
    });

    expect(result).toEqual({ claimed: 2, succeeded: 2, retried: 0, failed: 0 });
    expect(processAiRunByFeature).toHaveBeenCalledTimes(2);
  });

  it('requeues run when completion fails due lease conflict before terminal failure', async () => {
    claimAiRuns.mockResolvedValue([
      {
        id: 'run-conflict-1',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-conflict-1',
        requestedBy: 'user-conflict-1',
        status: 'running',
        promptVersion: 'v1',
        createdAt: new Date().toISOString(),
        processorId: 'worker-conflict-1',
        leaseToken: 'lease-conflict-1',
        leaseExpiresAt: new Date(Date.now() + 10000).toISOString(),
        attemptCount: 1,
        maxAttempts: 3,
      },
    ]);
    processAiRunByFeature.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-test',
      modelVersion: 'gpt-test-1',
      latencyMs: 80,
      providerMetadata: {},
    });
    markAiRunSucceeded.mockResolvedValue(false);
    requeueAiRun.mockResolvedValue(true);

    const { processAiWorkerBatch } = await import('@/lib/ai/worker');

    const result = await processAiWorkerBatch({} as never, {
      processorId: 'worker-conflict-1',
      batchSize: 1,
      leaseSeconds: 30,
      maxAttempts: 3,
      timeoutMs: 2000,
      backoffBaseMs: 1000,
    });

    expect(result).toEqual({ claimed: 1, succeeded: 0, retried: 1, failed: 0 });
    expect(requeueAiRun).toHaveBeenCalledTimes(1);
  });
});
