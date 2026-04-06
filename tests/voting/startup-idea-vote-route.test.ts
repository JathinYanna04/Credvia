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
              updated_at: `2026-04-07T10:00:${String(version).padStart(2, '0')}.000Z`,
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
            title: 'Startup idea post',
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

async function voteWithDirection(direction: -1 | 1, initialVote: VoteValue) {
  createServerSupabaseClient.mockResolvedValue(createPostVoteSupabaseMock(initialVote));
  const { POST } = await import('@/app/api/v1/startup-ideas/[id]/vote/route');

  const response = await POST(
    new Request('http://localhost:3000/api/v1/startup-ideas/post-1/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    }),
    { params: { id: 'post-1' } },
  );

  return {
    response,
    payload: await response.json(),
  };
}

describe('startup idea vote route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    enforceRateLimit.mockResolvedValue({ success: true });
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    createServiceRoleClient.mockReturnValue(null);
  });

  it('supports direction payload and applies neutral -> upvote', async () => {
    const { response, payload } = await voteWithDirection(1, 0);

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      entityType: 'startup_idea',
      currentUserVote: 1,
      score: 1,
    });
    expect(typeof payload.data.version).toBe('string');
  });

  it('toggles off when clicking same direction again', async () => {
    const { response, payload } = await voteWithDirection(1, 1);

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      entityType: 'startup_idea',
      currentUserVote: 0,
      score: 0,
    });
  });
});
