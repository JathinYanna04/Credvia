import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const sendNotification = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
}));

vi.mock('@/lib/supabase/notifications', () => ({
  sendNotification,
}));

describe('startup idea follow route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a follow row, updates follower count, and notifies the founder', async () => {
    const postsBuilder = {
      select: vi.fn(() => postsBuilder),
      eq: vi.fn(() => postsBuilder),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: 'idea-1',
          author_id: 'founder-1',
          title: 'Idea',
          post_type: 'startup_idea',
          status: 'published',
        },
        error: null,
      })),
    };

    const followersInsert = vi.fn(async () => ({ error: null }));
    const followersSelect = vi.fn(() => ({
      eq: vi.fn(async () => ({ count: 3, error: null })),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'posts') return postsBuilder;
        if (table === 'idea_followers') {
          return {
            upsert: followersInsert,
            select: followersSelect,
          };
        }

        if (table === 'startup_ideas') {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-2' });
    enforceRateLimit.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/v1/ideas/[id]/follow/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/ideas/idea-1/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ following: true }),
      }),
      { params: { id: 'idea-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ following: true, followerCount: 3 });
    expect(followersInsert).toHaveBeenCalledWith({ post_id: 'idea-1', user_id: 'user-2' });
    expect(sendNotification).toHaveBeenCalled();
  });
});
