import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const getAiRunById = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

vi.mock('@/lib/ai/runs-repo', () => ({
  getAiRunById,
}));

describe('ai run by id route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns the run when found', async () => {
    createServerSupabaseClient.mockResolvedValue({ from: vi.fn() });
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    getAiRunById.mockResolvedValue({ id: 'run-1', status: 'queued' });

    const { GET } = await import('@/app/api/v1/ai/runs/[id]/route');

    const response = await GET(
      new Request('http://localhost:3000/api/v1/ai/runs/11111111-1111-1111-1111-111111111111'),
      { params: { id: '11111111-1111-1111-1111-111111111111' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getAiRunById).toHaveBeenCalledWith(expect.anything(), '11111111-1111-1111-1111-111111111111');
    expect(payload.data.run).toEqual({ id: 'run-1', status: 'queued' });
  });

  it('returns 404 when run is missing', async () => {
    createServerSupabaseClient.mockResolvedValue({ from: vi.fn() });
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    getAiRunById.mockResolvedValue(null);

    const { GET } = await import('@/app/api/v1/ai/runs/[id]/route');

    const response = await GET(
      new Request('http://localhost:3000/api/v1/ai/runs/11111111-1111-1111-1111-111111111111'),
      { params: { id: '11111111-1111-1111-1111-111111111111' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe('NOT_FOUND');
  });

  it('validates run id format', async () => {
    createServerSupabaseClient.mockResolvedValue({ from: vi.fn() });
    getRequiredUser.mockResolvedValue({ id: 'user-1' });

    const { GET } = await import('@/app/api/v1/ai/runs/[id]/route');

    const response = await GET(
      new Request('http://localhost:3000/api/v1/ai/runs/not-a-uuid'),
      { params: { id: 'not-a-uuid' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
    expect(getAiRunById).not.toHaveBeenCalled();
  });
});
