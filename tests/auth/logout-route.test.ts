import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

describe('logout route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signs the user out and returns success', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });

    createServerSupabaseClient.mockResolvedValue({
      auth: {
        signOut,
      },
    });
    getRequiredUser.mockResolvedValue({ id: 'user-1' });

    const { POST } = await import('@/app/api/v1/auth/logout/route');

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(signOut).toHaveBeenCalled();
    expect(payload.data).toEqual({ signedOut: true });
  });
});
