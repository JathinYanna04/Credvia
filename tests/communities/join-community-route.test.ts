import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

describe('join community route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a membership for the signed-in user', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });

    createServerSupabaseClient.mockResolvedValue({
      from: vi.fn(() => ({
        insert,
      })),
    });
    getRequiredUser.mockResolvedValue({ id: 'user-1' });

    const { POST } = await import('@/app/api/v1/communities/[id]/join/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/communities/community-1/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId: 'community-1', joined: true }),
      }),
      { params: { id: 'community-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      community_id: 'community-1',
      role: 'member',
    });
    expect(payload.data).toEqual({ joined: true, communityId: 'community-1' });
  });
});
