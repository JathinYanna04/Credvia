import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const toPostSummaries = vi.fn();
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
  toPostSummaries,
}));

vi.mock('@/lib/utils/sanitize', () => ({
  sanitizeHtml,
}));

vi.mock('@/lib/utils/logger', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

describe('startup idea create route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a post row and startup idea row from the nested startup_idea payload', async () => {
    let insertedPost: Record<string, unknown> | null = null;
    let insertedIdea: Record<string, unknown> | null = null;
    let insertedRevision: Record<string, unknown> | null = null;
    let startupIdeaUpdate: Record<string, unknown> | null = null;

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'posts') {
          return {
            insert(payload: Record<string, unknown>) {
              insertedPost = payload;
              return {
                select() {
                  return {
                    single: async () => ({
                      data: {
                        id: 'idea-post-1',
                        title: payload.title,
                        body_md: payload.body_md,
                        post_type: payload.post_type,
                        community_id: payload.community_id,
                        author_id: payload.author_id,
                        vote_score: 0,
                        comment_count: 0,
                        save_count: 0,
                        created_at: '2026-03-29T00:00:00.000Z',
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
            delete() {
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        }

        if (table === 'startup_ideas') {
          return {
            insert: async (payload: Record<string, unknown>) => {
              insertedIdea = payload;
              return { error: null };
            },
            update(payload: Record<string, unknown>) {
              startupIdeaUpdate = payload;
              return {
                eq: async () => ({ error: null }),
              };
            },
            delete() {
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        }

        if (table === 'startup_idea_revisions') {
          return {
            insert(payload: Record<string, unknown>) {
              insertedRevision = payload;
              return {
                select() {
                  return {
                    single: async () => ({
                      data: { id: 'revision-1' },
                      error: null,
                    }),
                  };
                },
              };
            },
            delete() {
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'founder-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    toPostSummaries.mockResolvedValue([
      {
        id: 'idea-post-1',
        title: 'Idea title',
      },
    ]);

    const { POST } = await import('@/app/api/v1/posts/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Idea title',
          post_type: 'startup_idea',
          community_id: 'community-1',
          body_md: 'Idea body',
          startup_idea: {
            problem: 'Founders need structured validation before they commit serious build time.',
            target_audience: 'Student founders and solo builders validating startup concepts.',
            solution: 'A startup idea workflow with comments and traction signals.',
            market_category: 'devtools',
            stage: 'idea',
            monetization_model: 'subscription',
          },
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.id).toBe('idea-post-1');
    expect(insertedPost).toMatchObject({
      title: 'Idea title',
      post_type: 'startup_idea',
      community_id: 'community-1',
      author_id: 'founder-1',
      body_html: '<p>Idea body</p>',
    });
    expect(insertedIdea).toMatchObject({
      post_id: 'idea-post-1',
      founder_user_id: 'founder-1',
      problem:
        'Founders need structured validation before they commit serious build time.',
      target_audience:
        'Student founders and solo builders validating startup concepts.',
      solution: 'A startup idea workflow with comments and traction signals.',
      market_category: 'devtools',
      stage: 'idea',
      monetization_model: 'subscription',
    });
    expect(insertedRevision).toMatchObject({
      post_id: 'idea-post-1',
      revision_number: 1,
      title: 'Idea title',
      body_md: 'Idea body',
      problem:
        'Founders need structured validation before they commit serious build time.',
      target_audience:
        'Student founders and solo builders validating startup concepts.',
      solution: 'A startup idea workflow with comments and traction signals.',
      market_category: 'devtools',
      stage: 'idea',
      monetization_model: 'subscription',
      change_summary: 'Initial thesis snapshot',
      created_by: 'founder-1',
    });
    expect(startupIdeaUpdate).toMatchObject({
      current_revision_id: 'revision-1',
    });
  });
});
