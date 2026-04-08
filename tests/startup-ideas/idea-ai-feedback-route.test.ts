import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const queueFounderIdeaFeedbackRun = vi.fn();
const getFounderIdeaFeedbackState = vi.fn();
const enqueue = vi.fn();
const isAiFeatureEnabled = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
}));

vi.mock('@/lib/ai/config', () => ({
  isAiFeatureEnabled,
}));

vi.mock('@/lib/ai/features/founder-feedback/service', () => ({
  queueFounderIdeaFeedbackRun,
  getFounderIdeaFeedbackState,
}));

vi.mock('@/lib/ai/executor', () => ({
  getAiRunExecutor: () => ({ enqueue }),
}));

describe('idea ai feedback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAiFeatureEnabled.mockReturnValue(true);
  });

  it('returns founder feedback state', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'founder-1' });
    getFounderIdeaFeedbackState.mockResolvedValue({
      latestRun: { id: 'run-1', status: 'succeeded' },
      review: { id: 'review-1' },
      stale: false,
    });

    const { GET } = await import('@/app/api/v1/ideas/[id]/ai-feedback/route');
    const response = await GET(new Request('http://localhost:3000/api/v1/ideas/idea-1/ai-feedback'), {
      params: { id: '11111111-1111-1111-1111-111111111111' },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.review.id).toBe('review-1');
  });

  it('queues founder feedback and enqueues worker execution', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'founder-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    queueFounderIdeaFeedbackRun.mockResolvedValue({
      run: {
        id: 'run-queued',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: '11111111-1111-1111-1111-111111111111',
      },
      reused: false,
    });

    const { POST } = await import('@/app/api/v1/ideas/[id]/ai-feedback/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/ideas/11111111-1111-1111-1111-111111111111/ai-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: false }),
      }),
      { params: { id: '11111111-1111-1111-1111-111111111111' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(queueFounderIdeaFeedbackRun).toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalled();
    expect(payload.data.run.id).toBe('run-queued');
  });

  it('returns AI_FEATURE_DISABLED when founder feature flag is off', async () => {
    isAiFeatureEnabled.mockReturnValue(false);

    const { POST } = await import('@/app/api/v1/ideas/[id]/ai-feedback/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/ideas/11111111-1111-1111-1111-111111111111/ai-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: false }),
      }),
      { params: { id: '11111111-1111-1111-1111-111111111111' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('AI_FEATURE_DISABLED');
    expect(queueFounderIdeaFeedbackRun).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
