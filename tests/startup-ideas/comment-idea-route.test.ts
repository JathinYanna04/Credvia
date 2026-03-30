import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const toCommentSummaries = vi.fn();
const sanitizeHtml = vi.fn((value: string) => `<p>${value}</p>`);

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
}));

vi.mock('@/lib/supabase/query-helpers', () => ({
  toCommentSummaries,
}));

vi.mock('@/lib/utils/sanitize', () => ({
  sanitizeHtml,
}));

describe('startup idea comment route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a comment and returns the hydrated summary', async () => {
    let insertedComment: Record<string, unknown> | null = null;

    const commentsTable = {
      insert(payload: Record<string, unknown>) {
        insertedComment = payload;
        return {
          select() {
            return {
              single: async () => ({
                data: {
                  id: 'comment-1',
                  post_id: 'idea-1',
                  author_id: 'user-1',
                  body_md: payload.body_md,
                  body_html: payload.body_html,
                },
                error: null,
              }),
            };
          },
        };
      },
    };

    const postsTable = {
      select: vi.fn(() => postsTable),
      eq: vi.fn(() => postsTable),
      single: vi.fn(async () => ({ data: { community_id: 'community-1' }, error: null })),
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'comments') return commentsTable;
        if (table === 'posts') return postsTable;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    toCommentSummaries.mockResolvedValue([{ id: 'comment-1', body: 'Constructive feedback' }]);

    const { POST } = await import('@/app/api/v1/posts/[id]/comments/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/posts/idea-1/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: 'idea-1',
          body_md: 'Constructive feedback',
        }),
      }),
      { params: { id: 'idea-1' } },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.id).toBe('comment-1');
    expect(insertedComment).toMatchObject({
      post_id: 'idea-1',
      author_id: 'user-1',
      body_md: 'Constructive feedback',
      body_html: '<p>Constructive feedback</p>',
    });
  }, 10000);
});
