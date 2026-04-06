import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const toPostSummaries = vi.fn();
const getRankedFeed = vi.fn();
const buildFeedExplanation = vi.fn();

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

vi.mock('@/lib/supabase/query-helpers', () => ({
  toPostSummaries,
}));

vi.mock('@/lib/utils/feed-rank', () => ({
  getRankedFeed,
  buildFeedExplanation,
}));

function createAwaitableResult<T>(result: { data: T; error: { message?: string } | null }) {
  const builder = {
    data: result.data,
    error: result.error,
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    in: vi.fn(() => builder),
    or: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
  };

  return builder;
}

function createFeedSupabaseMock(options?: {
  profileError?: { message?: string } | null;
  postsError?: { message?: string } | null;
}) {
  const posts = [
    {
      id: 'post-1',
      author_id: 'author-1',
      community_id: 'community-1',
      status: 'published',
      post_type: 'discussion',
      title: 'A post',
      body_md: 'Body',
      created_at: '2026-04-06T10:00:00.000Z',
      updated_at: '2026-04-06T10:00:00.000Z',
      vote_score: 0,
      comment_count: 0,
      save_count: 0,
    },
  ];

  return {
    from: vi.fn((table: string) => {
      if (table === 'community_memberships') {
        return createAwaitableResult({
          data: [{ community_id: 'community-1' }],
          error: null,
        });
      }

      if (table === 'follows') {
        return createAwaitableResult({
          data: [{ followed_id: 'author-1' }],
          error: null,
        });
      }

      if (table === 'profiles') {
        return createAwaitableResult({
          data: null,
          error: options?.profileError ?? null,
        });
      }

      if (table === 'posts') {
        return createAwaitableResult({
          data: options?.postsError ? [] : posts,
          error: options?.postsError ?? null,
        });
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe('feed route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    getRankedFeed.mockImplementation((posts: unknown[]) => posts);
    buildFeedExplanation.mockReturnValue({ layer: 'stable', reasons: ['ranked'] });
  });

  it('returns 200 with neutral viewer vote state', async () => {
    createServerSupabaseClient.mockResolvedValue(createFeedSupabaseMock());
    toPostSummaries.mockResolvedValue([
      {
        id: 'post-1',
        title: 'A post',
        body: 'Body',
        createdAt: '2026-04-06T10:00:00.000Z',
        updatedAt: '2026-04-06T10:00:00.000Z',
        postType: 'discussion',
        voteScore: 0,
        currentUserVote: 0,
        commentCount: 0,
        saveCount: 0,
        author: {
          id: 'author-1',
          username: 'author',
          fullName: 'Author',
          headline: '',
          avatarUrl: '',
          skills: [],
          reputation: [],
        },
        community: {
          id: 'community-1',
          name: 'Community',
          slug: 'community',
          description: '',
          icon: 'C',
          memberCount: 1,
          postCount: 1,
          accent: 'var(--accent)',
        },
        tags: [],
      },
    ]);

    const { GET } = await import('@/app/api/v1/feed/route');
    const response = await GET(new Request('http://localhost:3000/api/v1/feed?tab=for-you'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[0]?.currentUserVote).toBe(0);
  }, 20000);

  it('returns 200 with viewer vote state present', async () => {
    createServerSupabaseClient.mockResolvedValue(createFeedSupabaseMock());
    toPostSummaries.mockResolvedValue([
      {
        id: 'post-1',
        title: 'A post',
        body: 'Body',
        createdAt: '2026-04-06T10:00:00.000Z',
        updatedAt: '2026-04-06T10:00:00.000Z',
        postType: 'discussion',
        voteScore: 1,
        currentUserVote: 1,
        commentCount: 0,
        saveCount: 0,
        author: {
          id: 'author-1',
          username: 'author',
          fullName: 'Author',
          headline: '',
          avatarUrl: '',
          skills: [],
          reputation: [],
        },
        community: {
          id: 'community-1',
          name: 'Community',
          slug: 'community',
          description: '',
          icon: 'C',
          memberCount: 1,
          postCount: 1,
          accent: 'var(--accent)',
        },
        tags: [],
      },
    ]);

    const { GET } = await import('@/app/api/v1/feed/route');
    const response = await GET(new Request('http://localhost:3000/api/v1/feed?tab=for-you'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[0]?.currentUserVote).toBe(1);
  });

  it('tolerates missing profile metadata columns without crashing', async () => {
    createServerSupabaseClient.mockResolvedValue(
      createFeedSupabaseMock({
        profileError: { message: 'column "primary_persona" does not exist' },
      }),
    );
    toPostSummaries.mockResolvedValue([]);

    const { GET } = await import('@/app/api/v1/feed/route');
    const response = await GET(new Request('http://localhost:3000/api/v1/feed?tab=for-you'));

    expect(response.status).toBe(200);
  });

  it('degrades gracefully when enrichment fails recoverably', async () => {
    createServerSupabaseClient.mockResolvedValue(createFeedSupabaseMock());
    toPostSummaries.mockRejectedValue(new Error('permission denied for table profiles'));

    const { GET } = await import('@/app/api/v1/feed/route');
    const response = await GET(new Request('http://localhost:3000/api/v1/feed?tab=for-you'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(payload.data)).toBe(true);
  });
});
