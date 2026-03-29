import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
}));

describe('startup idea vote route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a post vote and returns the refreshed score', async () => {
    let insertedVote: Record<string, unknown> | null = null;

    const postLookup = {
      select: vi.fn(() => postLookup),
      eq: vi.fn(() => postLookup),
      maybeSingle: vi.fn(async () => ({ data: { id: 'idea-1' }, error: null })),
      single: vi.fn(async () => ({ data: { vote_score: 1 }, error: null })),
    };

    const voteLookup = {
      select: vi.fn(() => voteLookup),
      eq: vi.fn(() => voteLookup),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      insert: vi.fn(async (payload: Record<string, unknown>) => {
        insertedVote = payload;
        return { error: null };
      }),
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'posts') return postLookup;
        if (table === 'votes') return voteLookup;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/v1/posts/[id]/vote/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/posts/idea-1/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 1 }),
      }),
      { params: { id: 'idea-1' } },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.score).toBe(1);
    expect(insertedVote).toMatchObject({
      user_id: 'user-1',
      entity_type: 'post',
      entity_id: 'idea-1',
      value: 1,
    });
  });
});
