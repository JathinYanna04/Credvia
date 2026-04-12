import { beforeEach, describe, expect, it, vi } from 'vitest';

const claimAiRuns = vi.fn();
const heartbeatAiRunLease = vi.fn();
const markAiRunFailed = vi.fn();
const markAiRunSucceeded = vi.fn();
const requeueAiRun = vi.fn();

const processFounderIdeaFeedbackRun = vi.fn();
const processCareerCopilotRun = vi.fn();
const processModerationReviewRun = vi.fn();

vi.mock('@/lib/ai/runs-repo', () => ({
  claimAiRuns,
  heartbeatAiRunLease,
  markAiRunFailed,
  markAiRunSucceeded,
  requeueAiRun,
}));

vi.mock('@/lib/ai/features/founder-feedback/service', () => ({
  processFounderIdeaFeedbackRun,
}));

vi.mock('@/lib/ai/features/career-copilot/service', () => ({
  processCareerCopilotRun,
}));

vi.mock('@/lib/ai/features/moderation-review/service', () => ({
  processModerationReviewRun,
}));

describe('worker graph integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimAiRuns.mockReset();
    heartbeatAiRunLease.mockReset();
    markAiRunFailed.mockReset();
    markAiRunSucceeded.mockReset();
    requeueAiRun.mockReset();
    processFounderIdeaFeedbackRun.mockReset();
    processCareerCopilotRun.mockReset();
    processModerationReviewRun.mockReset();
  });

  it('processes a claimed founder run through graph path and marks it succeeded', async () => {
    claimAiRuns.mockResolvedValue([
      {
        id: 'run-graph-1',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-graph-1',
        requestedBy: 'user-graph-1',
        status: 'running',
        promptVersion: 'founder-v1',
        promptKey: 'founder-feedback-core',
        attemptCount: 1,
        maxAttempts: 3,
        traceId: 'trace-graph-1',
        createdAt: new Date().toISOString(),
        processorId: 'worker-graph-1',
        leaseToken: 'lease-graph-1',
        leaseExpiresAt: new Date(Date.now() + 15000).toISOString(),
      },
    ]);

    processFounderIdeaFeedbackRun.mockResolvedValue({
      provider: 'groq',
      model: 'llama-3.3-70b',
      modelVersion: 'llama-3.3-70b',
      latencyMs: 95,
      providerMetadata: {
        requestId: 'req-graph-1',
      },
    });

    markAiRunSucceeded.mockResolvedValue(true);

    const { processAiWorkerBatch } = await import('@/lib/ai/worker');

    const result = await processAiWorkerBatch({} as never, {
      processorId: 'worker-graph-1',
      batchSize: 5,
      leaseSeconds: 45,
      maxAttempts: 3,
      timeoutMs: 5000,
      backoffBaseMs: 1000,
    });

    expect(processFounderIdeaFeedbackRun).toHaveBeenCalledTimes(1);
    expect(markAiRunSucceeded).toHaveBeenCalledTimes(1);
    expect(markAiRunFailed).not.toHaveBeenCalled();
    expect(requeueAiRun).not.toHaveBeenCalled();
    expect(result).toEqual({ claimed: 1, succeeded: 1, retried: 0, failed: 0 });
  });
});
