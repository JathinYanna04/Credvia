import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/helpers')>(
    '@/lib/supabase/helpers',
  );

  return {
    ...actual,
    getRequiredUser,
  };
});

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient,
}));

type VoteValue = -1 | 0 | 1;
type VoteDirection = 'up' | 'down';

interface CommentVoteMockOptions {
  initialVote: VoteValue;
  commentExists?: boolean;
  rpcConflictMode?: 'none' | 'first' | 'always';
  recoveredVote?: VoteValue;
}

function createCommentVoteSupabaseMock(options: CommentVoteMockOptions) {
  let currentVote: VoteValue = options.initialVote;
  let voteScore = options.initialVote;
  let version = 0;
  let rpcCalls = 0;

  const commentExists = options.commentExists ?? true;
  const rpcConflictMode = options.rpcConflictMode ?? 'none';
  const recoveredVote = options.recoveredVote ?? currentVote;

  const commentsFrom = {
    select: vi.fn((columns: string) => {
      if (columns.includes('author_id')) {
        const lookupBuilder = {
          eq: vi.fn(),
          maybeSingle: vi.fn(async () => ({
            data: commentExists
              ? {
                  id: 'comment-1',
                  author_id: 'author-1',
                  post_id: 'post-1',
                }
              : null,
            error: null,
          })),
        };

        lookupBuilder.eq.mockImplementation(() => lookupBuilder);
        return lookupBuilder;
      }

      if (columns.includes('vote_score')) {
        const stateBuilder = {
          eq: vi.fn(),
          maybeSingle: vi.fn(async () => ({
            data: commentExists
              ? {
                  vote_score: recoveredVote,
                  updated_at: `2026-04-07T10:00:${String(version).padStart(2, '0')}.000Z`,
                }
              : null,
            error: null,
          })),
        };

        stateBuilder.eq.mockImplementation(() => stateBuilder);
        return stateBuilder;
      }

      throw new Error(`Unexpected comments select: ${columns}`);
    }),
  };

  const votesFrom = {
    select: vi.fn((_columns: string, options?: { count?: 'exact'; head?: boolean }) => {
      if (options?.count === 'exact') {
        const countBuilder = {
          count: 0,
          error: null as { message?: string } | null,
          eq: vi.fn((column: string, value: unknown) => {
            if (column === 'value') {
              const authoritativeVote = rpcConflictMode === 'always' ? recoveredVote : currentVote;
              countBuilder.count = authoritativeVote === value ? 1 : 0;
            }

            return countBuilder;
          }),
        };

        return countBuilder;
      }

      const ownVoteBuilder = {
        eq: vi.fn(),
        maybeSingle: vi.fn(async () => {
          const authoritativeVote = rpcConflictMode === 'always' ? recoveredVote : currentVote;
          return {
            data: authoritativeVote === 0 ? null : { value: authoritativeVote },
            error: null,
          };
        }),
      };

      ownVoteBuilder.eq.mockImplementation(() => ownVoteBuilder);
      return ownVoteBuilder;
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
        if (fn !== 'mutate_comment_vote_atomic') {
          return {
            single: async () => ({
              data: null,
              error: { message: `Unexpected function: ${fn}` },
            }),
          };
        }

        rpcCalls += 1;
        if (
          rpcConflictMode === 'always' ||
          (rpcConflictMode === 'first' && rpcCalls === 1)
        ) {
          return {
            single: async () => ({
              data: null,
              error: {
                code: '23505',
                message: 'duplicate key value violates unique constraint',
                details: 'duplicate vote row',
                hint: null,
              },
            }),
          };
        }

        const previousVote = currentVote;
        const requestedVote = args.p_direction === 1 ? 1 : -1;
        const desiredVote = previousVote === requestedVote ? 0 : requestedVote;

        currentVote = desiredVote;
        voteScore += desiredVote - previousVote;
        version += 1;

        return {
          single: async () => ({
            data: {
              entity_id: 'comment-1',
              previous_vote: previousVote,
              current_user_vote: desiredVote,
              score: voteScore,
              upvote_count: desiredVote === 1 ? 1 : 0,
              downvote_count: desiredVote === -1 ? 1 : 0,
              updated_at: `2026-04-07T10:00:${String(version).padStart(2, '0')}.000Z`,
              contribution_delta: desiredVote - previousVote,
            },
            error: null,
          }),
        };
      },
    ),
    from: vi.fn((table: string) => {
      if (table === 'comments') {
        return commentsFrom;
      }

      if (table === 'votes') {
        return votesFrom;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

async function vote(direction: VoteDirection) {
  const { POST } = await import('@/app/api/v1/comments/[id]/vote/route');

  const response = await POST(
    new Request('http://localhost:3000/api/v1/comments/comment-1/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    }),
    { params: { id: 'comment-1' } },
  );

  return {
    response,
    payload: await response.json(),
  };
}

describe('comment vote route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    enforceRateLimit.mockResolvedValue({ success: true });
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    createServiceRoleClient.mockReturnValue(null);
  });

  it('returns 401 when unauthenticated', async () => {
    getRequiredUser.mockRejectedValue(new Error('UNAUTHORIZED'));
    createServerSupabaseClient.mockResolvedValue(
      createCommentVoteSupabaseMock({ initialVote: 0 }),
    );

    const { response, payload } = await vote('up');

    expect(response.status).toBe(401);
    expect(payload.error?.code).toBe('UNAUTHORIZED');
  });

  it('returns 400 for invalid vote payload', async () => {
    createServerSupabaseClient.mockResolvedValue(
      createCommentVoteSupabaseMock({ initialVote: 0 }),
    );

    const { POST } = await import('@/app/api/v1/comments/[id]/vote/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/comments/comment-1/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: -1 }),
      }),
      { params: { id: 'comment-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when comment is missing', async () => {
    createServerSupabaseClient.mockResolvedValue(
      createCommentVoteSupabaseMock({ initialVote: 0, commentExists: false }),
    );

    const { response, payload } = await vote('up');

    expect(response.status).toBe(404);
    expect(payload.error?.code).toBe('NOT_FOUND');
  });

  it.each([
    { initialVote: 0 as VoteValue, direction: 'up' as VoteDirection, expectedVote: 'up', expectedScore: 1 },
    { initialVote: 0 as VoteValue, direction: 'down' as VoteDirection, expectedVote: 'down', expectedScore: -1 },
    { initialVote: 1 as VoteValue, direction: 'up' as VoteDirection, expectedVote: null, expectedScore: 0 },
    { initialVote: -1 as VoteValue, direction: 'down' as VoteDirection, expectedVote: null, expectedScore: 0 },
    { initialVote: 1 as VoteValue, direction: 'down' as VoteDirection, expectedVote: 'down', expectedScore: -1 },
    { initialVote: -1 as VoteValue, direction: 'up' as VoteDirection, expectedVote: 'up', expectedScore: 1 },
  ])(
    'applies canonical transition for initial=$initialVote direction=$direction',
    async ({ initialVote, direction, expectedVote, expectedScore }) => {
      createServerSupabaseClient.mockResolvedValue(
        createCommentVoteSupabaseMock({ initialVote }),
      );

      const { response, payload } = await vote(direction);

      expect(response.status).toBe(200);
      expect(payload.data).toMatchObject({
        entityId: 'comment-1',
        userVote: expectedVote,
        score: expectedScore,
      });
      expect(typeof payload.data.upvoteCount).toBe('number');
      expect(typeof payload.data.downvoteCount).toBe('number');
    },
  );

  it('recovers to authoritative state on unique race conflicts', async () => {
    createServerSupabaseClient.mockResolvedValue(
      createCommentVoteSupabaseMock({
        initialVote: 0,
        rpcConflictMode: 'always',
        recoveredVote: -1,
      }),
    );

    const { response, payload } = await vote('down');

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      entityId: 'comment-1',
      userVote: 'down',
      score: -1,
      upvoteCount: 0,
      downvoteCount: 1,
    });
  });
});
