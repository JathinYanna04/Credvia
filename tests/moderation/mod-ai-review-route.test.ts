import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const requireModeratorAccess = vi.fn();
const enforceRateLimit = vi.fn();
const isAiFeatureEnabled = vi.fn();
const queueModerationReviewRun = vi.fn();
const getModerationReviewState = vi.fn();
const enqueue = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/moderation', () => ({
  requireModeratorAccess,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
}));

vi.mock('@/lib/ai/config', () => ({
  isAiFeatureEnabled,
}));

vi.mock('@/lib/ai/features/moderation-review/service', () => ({
  queueModerationReviewRun,
  getModerationReviewState,
}));

vi.mock('@/lib/ai/executor', () => ({
  getAiRunExecutor: () => ({ enqueue }),
}));

describe('moderation ai review route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAiFeatureEnabled.mockReturnValue(true);
    createServerSupabaseClient.mockResolvedValue({});
    requireModeratorAccess.mockResolvedValue({
      user: { id: 'moderator-1' },
      communityIds: ['community-1'],
    });
  });

  it('returns moderation ai state for GET', async () => {
    getModerationReviewState.mockResolvedValue({
      latestRun: null,
      review: null,
    });

    const { GET } = await import('@/app/api/v1/mod/ai/review/route');
    const response = await GET(
      new Request('http://localhost:3000/api/v1/mod/ai/review?reportId=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.review).toBeNull();
  });

  it('queues moderation ai run for POST', async () => {
    enforceRateLimit.mockResolvedValue({ success: true });
    queueModerationReviewRun.mockResolvedValue({
      run: {
        id: 'run-mod-1',
        feature: 'moderation_review',
        subjectType: 'report',
        subjectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      },
      reused: false,
    });

    const { POST } = await import('@/app/api/v1/mod/ai/review/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/mod/ai/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          regenerate: false,
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(queueModerationReviewRun).toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalled();
    expect(payload.data.run.id).toBe('run-mod-1');
  });

  it('denies non-moderator access', async () => {
    requireModeratorAccess.mockRejectedValue(new Error('FORBIDDEN'));

    const { GET } = await import('@/app/api/v1/mod/ai/review/route');
    const response = await GET(
      new Request('http://localhost:3000/api/v1/mod/ai/review?reportId=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe('FORBIDDEN');
  });

  it('returns AI_FEATURE_DISABLED when moderation feature is off', async () => {
    isAiFeatureEnabled.mockReturnValue(false);

    const { POST } = await import('@/app/api/v1/mod/ai/review/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/mod/ai/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('AI_FEATURE_DISABLED');
    expect(queueModerationReviewRun).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
