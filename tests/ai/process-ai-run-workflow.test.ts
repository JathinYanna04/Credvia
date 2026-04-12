import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiRuntimeError } from '@/lib/ai/errors';
import type { AiRunSummary } from '@/lib/types';

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

describe('process ai run workflow graph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processFounderIdeaFeedbackRun.mockReset();
    processCareerCopilotRun.mockReset();
    processModerationReviewRun.mockReset();
  });

  it('routes founder run through founder workflow handler and returns provider metadata', async () => {
    processFounderIdeaFeedbackRun.mockResolvedValue({
      provider: 'groq',
      model: 'llama-3.3-70b',
      modelVersion: 'llama-3.3-70b',
      latencyMs: 120,
      providerMetadata: {
        requestId: 'req-founder-1',
      },
    });

    const { executeProcessAiRunWorkflow } = await import('@/lib/ai/graphs/process-ai-run-workflow');

    const run: AiRunSummary = {
      id: 'run-1',
      feature: 'founder_idea_feedback',
      subjectType: 'startup_idea',
      subjectId: 'idea-1',
      requestedBy: 'user-1',
      status: 'running',
      promptVersion: 'founder-v1',
      promptKey: 'founder-feedback-core',
      createdAt: new Date().toISOString(),
    };

    const result = await executeProcessAiRunWorkflow({
      supabase: {} as never,
      run,
    });

    expect(processFounderIdeaFeedbackRun).toHaveBeenCalledWith(
      expect.objectContaining({
        run,
      }),
    );
    expect(processCareerCopilotRun).not.toHaveBeenCalled();
    expect(processModerationReviewRun).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        provider: 'groq',
        model: 'llama-3.3-70b',
      }),
    );
  });

  it('throws deterministic unsupported-feature code when no workflow is registered', async () => {
    const { executeProcessAiRunWorkflow } = await import('@/lib/ai/graphs/process-ai-run-workflow');

    const run = {
      id: 'run-unsupported-1',
      feature: 'unsupported_feature',
      subjectType: 'startup_idea',
      subjectId: 'entity-1',
      status: 'running',
      promptVersion: 'v1',
      createdAt: new Date().toISOString(),
    } as unknown as Parameters<typeof executeProcessAiRunWorkflow>[0]['run'];

    await expect(
      executeProcessAiRunWorkflow({
        supabase: {} as never,
        run,
      }),
    ).rejects.toMatchObject({
      code: 'AI_FEATURE_UNSUPPORTED',
    });
  });

  it('propagates feature handler runtime failures with original typed error', async () => {
    processCareerCopilotRun.mockRejectedValue(
      new AiRuntimeError('AI_PROVIDER_UNAVAILABLE', 'Provider timed out.', 503),
    );

    const { executeProcessAiRunWorkflow } = await import('@/lib/ai/graphs/process-ai-run-workflow');

    const run: AiRunSummary = {
      id: 'run-career-1',
      feature: 'career_copilot',
      subjectType: 'resume',
      subjectId: 'resume-1',
      requestedBy: 'user-2',
      status: 'running',
      promptVersion: 'career-v1',
      promptKey: 'career-copilot:fit_explanation',
      createdAt: new Date().toISOString(),
    };

    await expect(
      executeProcessAiRunWorkflow({
        supabase: {} as never,
        run,
      }),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
      message: 'Provider timed out.',
    });
  });
});
