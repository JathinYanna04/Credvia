import { beforeEach, describe, expect, it, vi } from 'vitest';

const processFounderIdeaFeedbackRun = vi.fn();
const processCareerCopilotRun = vi.fn();
const processModerationReviewRun = vi.fn();

vi.mock('@/lib/ai/features/founder-feedback/service', () => ({
  processFounderIdeaFeedbackRun,
}));

vi.mock('@/lib/ai/features/career-copilot/service', () => ({
  processCareerCopilotRun,
}));

vi.mock('@/lib/ai/features/moderation-review/service', () => ({
  processModerationReviewRun,
}));

describe('run processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processFounderIdeaFeedbackRun.mockReset();
    processCareerCopilotRun.mockReset();
    processModerationReviewRun.mockReset();
  });

  it('processes founder feature through workflow graph', async () => {
    processFounderIdeaFeedbackRun.mockResolvedValue({
      provider: 'groq',
      model: 'llama-3.3-70b',
      modelVersion: 'llama-3.3-70b',
      latencyMs: 180,
      providerMetadata: {
        requestId: 'req-run-1',
      },
    });

    const { processAiRunByFeature } = await import('@/lib/ai/run-processor');

    const result = await processAiRunByFeature({
      supabase: {} as never,
      run: {
        id: 'run-processor-1',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-1',
        requestedBy: 'user-1',
        status: 'running',
        promptVersion: 'founder-v1',
        createdAt: new Date().toISOString(),
      },
    });

    expect(processFounderIdeaFeedbackRun).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        provider: 'groq',
        model: 'llama-3.3-70b',
      }),
    );
  });

  it('returns deterministic unsupported feature failure', async () => {
    const { processAiRunByFeature } = await import('@/lib/ai/run-processor');

    await expect(
      processAiRunByFeature({
        supabase: {} as never,
        run: {
          id: 'run-processor-unsupported',
          feature: 'unsupported_feature',
          subjectType: 'startup_idea',
          subjectId: 'entity-1',
          status: 'running',
          promptVersion: 'v1',
          createdAt: new Date().toISOString(),
        } as never,
      }),
    ).rejects.toMatchObject({
      code: 'AI_FEATURE_UNSUPPORTED',
    });
  });
});
