import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const sendNotification = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/helpers')>('@/lib/supabase/helpers');
  return {
    ...actual,
    getRequiredUser,
  };
});

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
}));

vi.mock('@/lib/supabase/notifications', () => ({
  sendNotification,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient,
}));

type VoteValue = -1 | 0 | 1;

function createPostVoteSupabaseMock(initialVote: VoteValue) {
  let currentVote: VoteValue = initialVote;
  let voteScore = initialVote;
  let version = 0;

  const postsFrom = {
    select: vi.fn((columns: string) => {
      if (columns.includes('vote_score')) {
        const scoreBuilder = {
          eq: vi.fn(() => scoreBuilder),
          single: vi.fn(async () => ({
            data: {
              id: 'post-1',
              vote_score: voteScore,
              updated_at: `2026-04-06T10:00:${String(version).padStart(2, '0')}.000Z`,
            },
            error: null,
          })),
        };

        return scoreBuilder;
      }

      const lookupBuilder = {
        eq: vi.fn(() => lookupBuilder),
        maybeSingle: vi.fn(async () => ({
          data: {
            id: 'post-1',
            author_id: 'author-1',
            title: 'A post',
            community_id: 'community-1',
          },
          error: null,
        })),
      };

      return lookupBuilder;
    }),
  };

  const votesFrom = {
    select: vi.fn((_columns: string, options?: { count?: 'exact'; head?: boolean }) => {
      if (options?.count === 'exact') {
        const countBuilder = {
          error: null as { message?: string } | null,
          count: 0,
          eq: vi.fn((column: string, value: unknown) => {
            if (column === 'value') {
              countBuilder.count = currentVote === value ? 1 : 0;
            }

            return countBuilder;
          }),
        };

        return countBuilder;
      }

      const voteBuilder = {
        eq: vi.fn(() => voteBuilder),
        maybeSingle: vi.fn(async () => ({
          data: currentVote === 0 ? null : { value: currentVote },
          error: null,
        })),
      };

      return voteBuilder;
    }),
    upsert: vi.fn(async (payload: { value: VoteValue }) => {
      voteScore += payload.value - currentVote;
      currentVote = payload.value;
      version += 1;
      return { error: null };
    }),
    delete: vi.fn(() => {
      voteScore -= currentVote;
      currentVote = 0;
      version += 1;
      const deleteBuilder = {
        error: null as { message?: string } | null,
        eq: vi.fn(() => deleteBuilder),
      };

      return deleteBuilder;
    }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'posts') {
        return postsFrom;
      }

      if (table === 'votes') {
        return votesFrom;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

async function vote(value: VoteValue) {
  const { POST } = await import('@/app/api/v1/posts/[id]/vote/route');

  return POST(
    new Request('http://localhost:3000/api/v1/posts/post-1/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }),
    { params: { id: 'post-1' } },
  );
}

describe('post vote route transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    enforceRateLimit.mockResolvedValue({ success: true });
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    createServiceRoleClient.mockReturnValue(null);
  });

  it.each([
    { initialVote: 0 as VoteValue, desiredVote: 1 as VoteValue, expectedVote: 1 as VoteValue, expectedScore: 1 },
    { initialVote: 0 as VoteValue, desiredVote: -1 as VoteValue, expectedVote: -1 as VoteValue, expectedScore: -1 },
    { initialVote: 1 as VoteValue, desiredVote: 0 as VoteValue, expectedVote: 0 as VoteValue, expectedScore: 0 },
    { initialVote: -1 as VoteValue, desiredVote: 0 as VoteValue, expectedVote: 0 as VoteValue, expectedScore: 0 },
    { initialVote: 1 as VoteValue, desiredVote: -1 as VoteValue, expectedVote: -1 as VoteValue, expectedScore: -1 },
    { initialVote: -1 as VoteValue, desiredVote: 1 as VoteValue, expectedVote: 1 as VoteValue, expectedScore: 1 },
  ])(
    'applies deterministic transition: $initialVote -> $desiredVote',
    async ({ initialVote, desiredVote, expectedVote, expectedScore }) => {
      createServerSupabaseClient.mockResolvedValue(createPostVoteSupabaseMock(initialVote));

      const response = await vote(desiredVote);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.data).toMatchObject({
        entityId: 'post-1',
        entityType: 'post',
        currentUserVote: expectedVote,
        score: expectedScore,
      });
    },
    20000,
  );

  it('keeps stable final state under rapid sequential toggles', async () => {
    createServerSupabaseClient.mockResolvedValue(createPostVoteSupabaseMock(0));

    const values: VoteValue[] = [1, -1, 1, 0];
    let lastPayload: any = null;

    for (const value of values) {
      const response = await vote(value);
      lastPayload = await response.json();
      expect(response.status).toBe(200);
    }

    expect(lastPayload.data.currentUserVote).toBe(0);
    expect(lastPayload.data.score).toBe(0);
  });

  it('returns 401 when unauthenticated', async () => {
    getRequiredUser.mockRejectedValue(new Error('UNAUTHORIZED'));
    createServerSupabaseClient.mockResolvedValue(createPostVoteSupabaseMock(0));

    const response = await vote(1);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error?.code).toBe('UNAUTHORIZED');
  });
});
