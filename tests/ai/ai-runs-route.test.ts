import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireModeratorAccess = vi.fn();
const createOrReuseAiRun = vi.fn();
const listAiRunsByRequester = vi.fn();
const enqueue = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
  rateLimits: {
    ai_founder_feedback: null,
    ai_career_copilot: null,
    ai_moderation_review: null,
  },
}));

vi.mock('@/lib/supabase/moderation', () => ({
  requireModeratorAccess,
}));

vi.mock('@/lib/ai/runs-repo', () => ({
  createOrReuseAiRun,
  listAiRunsByRequester,
}));

vi.mock('@/lib/ai/executor', () => ({
  getAiRunExecutor: () => ({ enqueue }),
}));

describe('ai runs route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('creates a founder feedback run when subject access is valid', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'posts') {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: {
                        id: '11111111-1111-1111-1111-111111111111',
                        author_id: 'user-1',
                        post_type: 'startup_idea',
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    createOrReuseAiRun.mockResolvedValue({
      run: {
        id: 'run-1',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: '11111111-1111-1111-1111-111111111111',
        status: 'queued',
        promptVersion: 'v1',
        provider: null,
        model: null,
        requestId: null,
        traceId: null,
        errorCode: null,
        errorMessage: null,
        metadata: {},
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      },
      reused: false,
    });
    enqueue.mockResolvedValue({ accepted: true, mode: 'db-backed' });

    const { POST } = await import('@/app/api/v1/ai/runs/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/ai/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: 'founder_idea_feedback',
          subjectType: 'startup_idea',
          subjectId: '11111111-1111-1111-1111-111111111111',
          promptVersion: 'v1',
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(createOrReuseAiRun).toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        feature: 'founder_idea_feedback',
      }),
    );
    expect(payload.data.run.id).toBe('run-1');
  });

  it('rejects feature and subject mismatches', async () => {
    createServerSupabaseClient.mockResolvedValue({ from: vi.fn() });
    getRequiredUser.mockResolvedValue({ id: 'user-1' });

    const { POST } = await import('@/app/api/v1/ai/runs/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/ai/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: 'founder_idea_feedback',
          subjectType: 'resume',
          subjectId: '11111111-1111-1111-1111-111111111111',
          promptVersion: 'v1',
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('AI_SUBJECT_MISMATCH');
    expect(createOrReuseAiRun).not.toHaveBeenCalled();
  });

  it('lists recent runs for the current user', async () => {
    createServerSupabaseClient.mockResolvedValue({ from: vi.fn() });
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    listAiRunsByRequester.mockResolvedValue([{ id: 'run-1' }]);

    const { GET } = await import('@/app/api/v1/ai/runs/route');

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(listAiRunsByRequester).toHaveBeenCalledWith(expect.anything(), 'user-1', 50);
    expect(payload.data.runs).toEqual([{ id: 'run-1' }]);
  });

  it('does not enqueue when create-or-reuse returns a reused run', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'posts') {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: {
                        id: '11111111-1111-1111-1111-111111111111',
                        author_id: 'user-1',
                        post_type: 'startup_idea',
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    createOrReuseAiRun.mockResolvedValue({
      run: {
        id: 'run-reused-1',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: '11111111-1111-1111-1111-111111111111',
        status: 'succeeded',
        promptVersion: 'v1',
        provider: 'groq',
        model: 'llama-3.3-70b',
        requestId: null,
        traceId: null,
        errorCode: null,
        errorMessage: null,
        metadata: {},
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: new Date().toISOString(),
      },
      reused: true,
    });

    const { POST } = await import('@/app/api/v1/ai/runs/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/ai/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: 'founder_idea_feedback',
          subjectType: 'startup_idea',
          subjectId: '11111111-1111-1111-1111-111111111111',
          promptVersion: 'v1',
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.reused).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
