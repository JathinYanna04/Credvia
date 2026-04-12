import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const queueFounderIdeaFeedbackRun = vi.fn();
const getFounderIdeaFeedbackState = vi.fn();
const enqueue = vi.fn();
const isAiFeatureEnabled = vi.fn();
const resolveAiRuntimeConfigOrThrow = vi.fn();

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
  resolveAiRuntimeConfigOrThrow,
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
    resolveAiRuntimeConfigOrThrow.mockReturnValue({
      provider: 'groq',
      apiKey: 'test-key',
      apiKeySource: 'AI_GROQ_API_KEY',
      model: 'llama-3.3-70b-versatile',
      baseUrl: 'https://api.groq.com/openai/v1',
      timeoutMs: 30000,
      maxRetries: 2,
      warnings: [],
    });
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

  it('returns VALIDATION_ERROR for invalid idea id route param', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'founder-1' });

    const { POST } = await import('@/app/api/v1/ideas/[id]/ai-feedback/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/ideas/not-a-uuid/ai-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: false }),
      }),
      { params: { id: 'not-a-uuid' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns UNAUTHORIZED when user session is missing', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockRejectedValue(new Error('UNAUTHORIZED'));

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

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('UNAUTHORIZED');
    expect(queueFounderIdeaFeedbackRun).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('returns ANALYSIS_SERVICE_UNAVAILABLE when auth session lookup is transiently unavailable on GET', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockRejectedValue(new Error('AUTH_SESSION_UNAVAILABLE'));

    const { GET } = await import('@/app/api/v1/ideas/[id]/ai-feedback/route');
    const response = await GET(
      new Request('http://localhost:3000/api/v1/ideas/11111111-1111-1111-1111-111111111111/ai-feedback'),
      {
        params: { id: '11111111-1111-1111-1111-111111111111' },
      },
    );

    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('ANALYSIS_SERVICE_UNAVAILABLE');
  });

  it('returns ANALYSIS_SERVICE_UNAVAILABLE when transient transport error happens on GET state fetch', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'founder-1' });
    getFounderIdeaFeedbackState.mockRejectedValue(new Error('UND_ERR_CONNECT_TIMEOUT'));

    const { GET } = await import('@/app/api/v1/ideas/[id]/ai-feedback/route');
    const response = await GET(
      new Request('http://localhost:3000/api/v1/ideas/11111111-1111-1111-1111-111111111111/ai-feedback'),
      {
        params: { id: '11111111-1111-1111-1111-111111111111' },
      },
    );

    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('ANALYSIS_SERVICE_UNAVAILABLE');
  });

  it('returns queued founder feedback state when run exists but review is missing', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'founder-1' });
    getFounderIdeaFeedbackState.mockResolvedValue({
      latestRun: {
        id: 'run-queued-1',
        status: 'queued',
        feature: 'founder_idea_feedback',
      },
      review: null,
      stale: false,
      snapshot: {
        postId: '11111111-1111-1111-1111-111111111111',
      },
    });

    const { GET } = await import('@/app/api/v1/ideas/[id]/ai-feedback/route');
    const response = await GET(
      new Request('http://localhost:3000/api/v1/ideas/11111111-1111-1111-1111-111111111111/ai-feedback'),
      {
        params: { id: '11111111-1111-1111-1111-111111111111' },
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.review).toBeNull();
    expect(payload.data.latestRun.status).toBe('queued');
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

  it('honors forceNewRun and queues regenerate path', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'founder-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    queueFounderIdeaFeedbackRun.mockResolvedValue({
      run: {
        id: 'run-force-new',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: '11111111-1111-1111-1111-111111111111',
        status: 'queued',
      },
      reused: false,
      decisionReason: 'force_new_regenerate',
    });

    const { POST } = await import('@/app/api/v1/ideas/[id]/ai-feedback/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/ideas/11111111-1111-1111-1111-111111111111/ai-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: false, forceNewRun: true }),
      }),
      { params: { id: '11111111-1111-1111-1111-111111111111' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.run.id).toBe('run-force-new');
    expect(queueFounderIdeaFeedbackRun).toHaveBeenCalledWith(
      expect.objectContaining({
        regenerate: true,
      }),
    );
  });

  it('reuses duplicate founder feedback request and does not enqueue twice', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'founder-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    queueFounderIdeaFeedbackRun.mockResolvedValue({
      run: {
        id: 'run-duplicate-existing',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: '11111111-1111-1111-1111-111111111111',
        status: 'queued',
        inputHash: 'same-input-hash',
      },
      reused: true,
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
    expect(payload.data.reused).toBe(true);
    expect(payload.data.run.id).toBe('run-duplicate-existing');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('forces a fresh run when a reused failed run is returned', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'founder-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    queueFounderIdeaFeedbackRun
      .mockResolvedValueOnce({
        run: {
          id: 'run-failed-stale',
          feature: 'founder_idea_feedback',
          subjectType: 'startup_idea',
          subjectId: '11111111-1111-1111-1111-111111111111',
          status: 'failed',
        },
        reused: true,
        decisionReason: 'reused_in_progress',
      })
      .mockResolvedValueOnce({
        run: {
          id: 'run-fresh-queued',
          feature: 'founder_idea_feedback',
          subjectType: 'startup_idea',
          subjectId: '11111111-1111-1111-1111-111111111111',
          status: 'queued',
        },
        reused: false,
        decisionReason: 'skipped_failed_terminal_created_new',
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
    expect(payload.data.run.id).toBe('run-fresh-queued');
    expect(queueFounderIdeaFeedbackRun).toHaveBeenCalledTimes(2);
    expect(queueFounderIdeaFeedbackRun.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        regenerate: true,
      }),
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('supports immediate GET polling after POST trigger before completion', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'founder-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    queueFounderIdeaFeedbackRun.mockResolvedValue({
      run: {
        id: 'run-queued-2',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: '11111111-1111-1111-1111-111111111111',
        status: 'queued',
      },
      reused: false,
    });
    getFounderIdeaFeedbackState.mockResolvedValue({
      latestRun: {
        id: 'run-queued-2',
        status: 'queued',
        feature: 'founder_idea_feedback',
      },
      review: null,
      stale: false,
      snapshot: {
        postId: '11111111-1111-1111-1111-111111111111',
      },
    });

    const { POST, GET } = await import('@/app/api/v1/ideas/[id]/ai-feedback/route');

    const postResponse = await POST(
      new Request('http://localhost:3000/api/v1/ideas/11111111-1111-1111-1111-111111111111/ai-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: false }),
      }),
      { params: { id: '11111111-1111-1111-1111-111111111111' } },
    );

    const getResponse = await GET(
      new Request('http://localhost:3000/api/v1/ideas/11111111-1111-1111-1111-111111111111/ai-feedback'),
      { params: { id: '11111111-1111-1111-1111-111111111111' } },
    );

    const postPayload = await postResponse.json();
    const getPayload = await getResponse.json();

    expect(postResponse.status).toBe(200);
    expect(getResponse.status).toBe(200);
    expect(postPayload.data.run.status).toBe('queued');
    expect(getPayload.data.latestRun.status).toBe('queued');
    expect(getPayload.data.review).toBeNull();
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

  it('fails fast with AI_PROVIDER_NOT_CONFIGURED when runtime config is missing', async () => {
    const { AiRuntimeError } = await import('@/lib/ai/errors');
    resolveAiRuntimeConfigOrThrow.mockImplementation(() => {
      throw new AiRuntimeError(
        'AI_PROVIDER_NOT_CONFIGURED',
        'AI review is not configured yet. Groq is selected, but no API key is available to process this request.',
        503,
        {
          provider: 'groq',
          requiredEnvVars: ['AI_GROQ_API_KEY'],
        },
      );
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

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('AI_PROVIDER_NOT_CONFIGURED');
    expect(queueFounderIdeaFeedbackRun).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('returns ANALYSIS_SERVICE_UNAVAILABLE when auth session lookup is transiently unavailable on POST', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockRejectedValue(new Error('AUTH_SESSION_UNAVAILABLE'));

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
    expect(payload.error.code).toBe('ANALYSIS_SERVICE_UNAVAILABLE');
    expect(queueFounderIdeaFeedbackRun).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_ERROR for malformed POST JSON body', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'founder-1' });
    enforceRateLimit.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/v1/ideas/[id]/ai-feedback/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/ideas/11111111-1111-1111-1111-111111111111/ai-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"regenerate":false',
      }),
      { params: { id: '11111111-1111-1111-1111-111111111111' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
    expect(queueFounderIdeaFeedbackRun).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
