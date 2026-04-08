import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAiWorkerConfig = vi.fn();
const processAiWorkerBatch = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock('@/lib/ai/config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/config')>('@/lib/ai/config');

  return {
    ...actual,
    getAiWorkerConfig,
  };
});

vi.mock('@/lib/ai/worker', () => ({
  processAiWorkerBatch,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient,
}));

describe('ai worker route', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_WORKER_SECRET: 'worker-secret',
    };

    getAiWorkerConfig.mockReturnValue({
      batchSize: 5,
      leaseSeconds: 45,
      maxRetries: 3,
      timeoutMs: 45000,
      backoffBaseMs: 2000,
      pollIntervalMs: 3000,
    });
  });

  it('returns typed readiness failure when worker secret is not configured', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
    };

    const { POST } = await import('@/app/api/v1/ai/worker/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/ai/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('AI_EXECUTOR_UNAVAILABLE');
    expect(payload.error.message).toBe('AI worker secret is not configured.');
    expect(processAiWorkerBatch).not.toHaveBeenCalled();
  });

  it('rejects requests with missing or invalid worker credentials when secret is configured', async () => {
    const { POST } = await import('@/app/api/v1/ai/worker/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/ai/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('UNAUTHORIZED');
    expect(processAiWorkerBatch).not.toHaveBeenCalled();
  });

  it('runs worker batch when valid secret is provided', async () => {
    createServiceRoleClient.mockReturnValue({});
    processAiWorkerBatch.mockResolvedValue({
      claimed: 2,
      succeeded: 2,
      retried: 0,
      failed: 0,
    });

    const { POST } = await import('@/app/api/v1/ai/worker/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/ai/worker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-worker-secret': 'worker-secret',
        },
        body: JSON.stringify({ batchSize: 2 }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(processAiWorkerBatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        batchSize: 2,
        leaseSeconds: 45,
      }),
    );
    expect(payload.data.result).toEqual({
      claimed: 2,
      succeeded: 2,
      retried: 0,
      failed: 0,
    });
  });

  it('returns typed executor-unavailable error when worker dependencies are missing', async () => {
    createServiceRoleClient.mockReturnValue({});
    processAiWorkerBatch.mockRejectedValue(new Error('function public.claim_ai_runs does not exist'));

    const { POST } = await import('@/app/api/v1/ai/worker/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/ai/worker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-worker-secret': 'worker-secret',
        },
        body: JSON.stringify({}),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('AI_EXECUTOR_UNAVAILABLE');
  });
});
