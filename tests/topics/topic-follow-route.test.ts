import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

describe('topic follow route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a topic follow edge for the signed-in user', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'user_topic_follows') {
          return { upsert };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });

    const { POST } = await import('@/app/api/v1/topics/[id]/follow/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/topics/topic-1/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ following: true }),
      }),
      { params: { id: 'topic-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({
      user_id: 'user-1',
      topic_id: 'topic-1',
    });
    expect(payload.data).toMatchObject({
      topicId: 'topic-1',
      following: true,
    });
  });
});
