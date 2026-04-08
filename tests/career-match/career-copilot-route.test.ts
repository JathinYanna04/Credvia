import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const isAiFeatureEnabled = vi.fn();
const queueCareerCopilotRun = vi.fn();
const getCareerCopilotState = vi.fn();
const enqueue = vi.fn();

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

vi.mock('@/lib/ai/features/career-copilot/service', () => ({
  queueCareerCopilotRun,
  getCareerCopilotState,
}));

vi.mock('@/lib/ai/executor', () => ({
  getAiRunExecutor: () => ({ enqueue }),
}));

describe('career copilot route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAiFeatureEnabled.mockReturnValue(true);
  });

  it('returns career copilot state for GET', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    getCareerCopilotState.mockResolvedValue({ sessions: [] });

    const { GET } = await import('@/app/api/v1/career/copilot/route');
    const response = await GET(new Request('http://localhost:3000/api/v1/career/copilot'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.sessions).toEqual([]);
  });

  it('queues career copilot run for POST', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    queueCareerCopilotRun.mockResolvedValue({
      run: {
        id: 'run-career-1',
        feature: 'career_copilot',
        subjectType: 'resume',
        subjectId: '22222222-2222-2222-2222-222222222222',
      },
      reused: false,
      sessionId: '33333333-3333-3333-3333-333333333333',
      mode: 'fit_explanation',
    });

    const { POST } = await import('@/app/api/v1/career/copilot/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/career/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'fit_explanation',
          resumeId: '22222222-2222-2222-2222-222222222222',
          matchId: '44444444-4444-4444-4444-444444444444',
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(queueCareerCopilotRun).toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalled();
    expect(payload.data.run.id).toBe('run-career-1');
  });

  it('returns AI_FEATURE_DISABLED when career copilot is off', async () => {
    isAiFeatureEnabled.mockReturnValue(false);

    const { POST } = await import('@/app/api/v1/career/copilot/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/career/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'fit_explanation' }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('AI_FEATURE_DISABLED');
    expect(queueCareerCopilotRun).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
