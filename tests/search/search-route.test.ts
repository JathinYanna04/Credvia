import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const toPostSummaries = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/query-helpers', () => ({
  toPostSummaries,
}));

describe('search route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns grouped post, community, and profile results', async () => {
    const postsQuery = {
      select: vi.fn(() => postsQuery),
      eq: vi.fn(() => postsQuery),
      or: vi.fn(() => postsQuery),
      order: vi.fn(() => postsQuery),
      limit: vi.fn(async () => ({
        data: [{ id: 'post-1', title: 'Searchable post' }],
        error: null,
      })),
    };

    const communitiesQuery = {
      select: vi.fn(() => communitiesQuery),
      eq: vi.fn(() => communitiesQuery),
      or: vi.fn(() => communitiesQuery),
      order: vi.fn(() => communitiesQuery),
      limit: vi.fn(async () => ({
        data: [{
          id: 'community-1',
          name: 'Web Dev',
          slug: 'web-dev',
          description: 'Frontend and backend work',
          member_count: 42,
          post_count: 11,
        }],
        error: null,
      })),
    };

    const profilesQuery = {
      select: vi.fn(() => profilesQuery),
      or: vi.fn(() => profilesQuery),
      order: vi.fn(() => profilesQuery),
      limit: vi.fn(async () => ({
        data: [{
          user_id: 'user-1',
          username: 'builder',
          full_name: 'Credvia Builder',
          headline: 'Ships products',
          avatar_url: null,
          location: null,
          current_company: null,
        }],
        error: null,
      })),
    };

    const startupIdeasQuery = {
      select: vi.fn(() => startupIdeasQuery),
      or: vi.fn(() => startupIdeasQuery),
      limit: vi.fn(async () => ({
        data: [{ post_id: 'post-1' }],
        error: null,
      })),
    };

    const hydratedPostsQuery = {
      select: vi.fn(() => hydratedPostsQuery),
      in: vi.fn(() => hydratedPostsQuery),
      eq: vi.fn(() => hydratedPostsQuery),
      order: vi.fn(() => hydratedPostsQuery),
      limit: vi.fn(async () => ({
        data: [{ id: 'post-1', title: 'Searchable post' }],
        error: null,
      })),
    };

    let postsCallCount = 0;

    createServerSupabaseClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'posts') {
          postsCallCount += 1;
          return postsCallCount === 1 ? postsQuery : hydratedPostsQuery;
        }
        if (table === 'startup_ideas') return startupIdeasQuery;
        if (table === 'communities') return communitiesQuery;
        if (table === 'profiles') return profilesQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    toPostSummaries.mockResolvedValue([{ id: 'post-1', title: 'Searchable post' }]);

    const { GET } = await import('@/app/api/v1/search/route');

    const response = await GET(new Request('http://localhost:3000/api/v1/search?q=build'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.posts).toHaveLength(1);
    expect(payload.data.communities).toHaveLength(1);
    expect(payload.data.people).toHaveLength(1);
  });
});
