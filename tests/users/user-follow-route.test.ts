import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

describe('user follow route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a follow edge for the signed-in user', async () => {
    const targetUserId = '7b180fe3-3d10-4ded-a569-cadafbc17ac7';
    const upsert = vi.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'follows') {
          return { upsert };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });

    const { POST } = await import('@/app/api/v1/users/[username]/follow/route');

    const response = await POST(
      new Request(`http://localhost:3000/api/v1/users/${targetUserId}/follow`, {
        method: 'POST',
      }),
      { params: { username: targetUserId } },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({
      follower_id: 'user-1',
      followed_id: targetUserId,
    });
    expect(payload.data).toMatchObject({
      userId: targetUserId,
      following: true,
    });
  });
});
