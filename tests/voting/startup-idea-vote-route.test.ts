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
type VoteDirection = 'up' | 'down';

function createPostVoteSupabaseMock(initialVote: VoteValue) {
  let currentVote: VoteValue = initialVote;
  let voteScore = initialVote;
  let version = 0;

  const resolveDesiredVote = (
    previousVote: VoteValue,
    direction: number | null | undefined,
  ): VoteValue => {
    const requestedDirection = direction === 1 ? 1 : -1;
    return previousVote === requestedDirection ? 0 : requestedDirection;
  };

  const postsFrom = {
    select: vi.fn((columns: string) => {
      if (columns.includes('vote_score')) {
        const scoreBuilder = {
          eq: vi.fn(),
          single: vi.fn(async () => ({
            data: {
              id: 'post-1',
              vote_score: voteScore,
              updated_at: `2026-04-07T10:00:${String(version).padStart(2, '0')}.000Z`,
            },
            error: null,
          })),
        };

        scoreBuilder.eq.mockImplementation(() => scoreBuilder);

        return scoreBuilder;
      }

      const lookupBuilder = {
        eq: vi.fn(),
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

      lookupBuilder.eq.mockImplementation(() => lookupBuilder);

      return lookupBuilder;
    }),
  };

  return {
    rpc: vi.fn(
      (
        fn: string,
        args: {
          p_direction?: number | null;
        },
      ) => {
        if (fn !== 'mutate_post_vote_atomic') {
          return {
            single: async () => ({
              data: null,
              error: { message: `Unexpected function: ${fn}` },
            }),
          };
        }

        const previousVote = currentVote;
        const desiredVote = resolveDesiredVote(
          previousVote,
          args.p_direction,
        );

        currentVote = desiredVote;
        voteScore += desiredVote - previousVote;
        version += 1;

        const rpcPayload = {
          entity_id: 'post-1',
          previous_vote: previousVote,
          current_user_vote: desiredVote,
          score: voteScore,
          upvote_count: currentVote === 1 ? 1 : 0,
          downvote_count: currentVote === -1 ? 1 : 0,
          updated_at: `2026-04-07T10:00:${String(version).padStart(2, '0')}.000Z`,
          contribution_delta: desiredVote - previousVote,
        };

        return {
          single: async () => ({ data: rpcPayload, error: null }),
        };
      },
    ),
    from: vi.fn((table: string) => {
      if (table === 'posts') {
        return postsFrom;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

async function voteWithDirection(direction: VoteDirection, initialVote: VoteValue) {
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
    const { response, payload } = await voteWithDirection('up', 0);

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      entityType: 'startup_idea',
      userVote: 'up',
      currentUserVote: 1,
      score: 1,
    });
    expect(typeof payload.data.version).toBe('string');
  });

  it('toggles off when clicking same direction again', async () => {
    const { response, payload } = await voteWithDirection('up', 1);

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      entityType: 'startup_idea',
      userVote: null,
      currentUserVote: 0,
      score: 0,
    });
  });
});
