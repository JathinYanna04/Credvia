import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const toPostSummaries = vi.fn();
const toCommentSummaries = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/query-helpers', () => ({
  toPostSummaries,
  toCommentSummaries,
}));

describe('startup idea detail route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the idea and comment thread from the database-backed queries', async () => {
    const postBuilder = {
      select: vi.fn(() => postBuilder),
      eq: vi.fn(() => postBuilder),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: 'idea-1',
          community_id: 'community-1',
          post_type: 'startup_idea',
          status: 'published',
        },
        error: null,
      })),
    };

    const commentsBuilder = {
      select: vi.fn(() => commentsBuilder),
      eq: vi.fn(() => commentsBuilder),
      order: vi.fn(async () => ({
        data: [{ id: 'comment-1', author_id: 'user-1' }],
        error: null,
      })),
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'posts') return postBuilder;
        if (table === 'comments') return commentsBuilder;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    toPostSummaries.mockResolvedValue([{ id: 'idea-1', title: 'Idea' }]);
    toCommentSummaries.mockResolvedValue([{ id: 'comment-1', body: 'Useful feedback' }]);

    const { GET } = await import('@/app/api/v1/ideas/[id]/route');

    const response = await GET(new Request('http://localhost:3000/api/v1/ideas/idea-1'), {
      params: { id: 'idea-1' },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.idea.id).toBe('idea-1');
    expect(payload.data.comments).toHaveLength(1);
  });
});
