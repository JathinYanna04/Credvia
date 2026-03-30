import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const sendNotifications = vi.fn();
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

vi.mock('@/lib/supabase/notifications', () => ({
  sendNotifications,
}));

vi.mock('@/lib/utils/sanitize', () => ({
  sanitizeHtml,
}));

describe('startup idea revision route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a founder-owned revision and updates the current idea snapshot', async () => {
    let insertedRevision: Record<string, unknown> | null = null;
    let updatedPost: Record<string, unknown> | null = null;
    let updatedIdea: Record<string, unknown> | null = null;

    const startupIdeasBuilder = {
      select: vi.fn(() => startupIdeasBuilder),
      eq: vi.fn(() => startupIdeasBuilder),
      maybeSingle: vi.fn(async () => ({
        data: { post_id: 'idea-1', founder_user_id: 'founder-1', revision_count: 1 },
        error: null,
      })),
      update(payload: Record<string, unknown>) {
        updatedIdea = payload;
        return {
          eq: async () => ({ error: null }),
        };
      },
    };

    const postsBuilder = {
      select: vi.fn(() => postsBuilder),
      eq: vi.fn(() => postsBuilder),
      maybeSingle: vi.fn(async () => ({
        data: { id: 'idea-1', author_id: 'founder-1', status: 'published', post_type: 'startup_idea' },
        error: null,
      })),
      update(payload: Record<string, unknown>) {
        updatedPost = payload;
        return {
          eq: async () => ({ error: null }),
        };
      },
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'startup_ideas') return startupIdeasBuilder;
        if (table === 'posts') return postsBuilder;
        if (table === 'startup_idea_revisions') {
          return {
            insert(payload: Record<string, unknown>) {
              insertedRevision = payload;
              return {
                select() {
                  return {
                    single: async () => ({
                      data: {
                        id: 'revision-2',
                        revision_number: 2,
                        created_at: '2026-03-30T00:00:00.000Z',
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }

        if (table === 'idea_followers') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: [{ user_id: 'follower-1' }], error: null })),
            })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'founder-1' });
    enforceRateLimit.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/v1/ideas/[id]/revisions/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/ideas/idea-1/revisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Sharper idea thesis',
          body_md: 'Now with traction',
          startup_idea: {
            problem: 'Founders still need proof before they build.',
            target_audience: 'Solo founders',
            solution: 'Revision-aware validation workspace.',
            market_category: 'productivity',
            stage: 'problem_validation',
            monetization_model: 'subscription',
          },
          change_summary: 'Added evidence from five interviews.',
        }),
      }),
      { params: { id: 'idea-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.revisionNumber).toBe(2);
    expect(insertedRevision).toMatchObject({
      post_id: 'idea-1',
      revision_number: 2,
      title: 'Sharper idea thesis',
      change_summary: 'Added evidence from five interviews.',
      created_by: 'founder-1',
    });
    expect(updatedPost).toMatchObject({
      title: 'Sharper idea thesis',
      body_md: 'Now with traction',
      body_html: '<p>Now with traction</p>',
    });
    expect(updatedIdea).toMatchObject({
      revision_count: 2,
      current_revision_id: 'revision-2',
      stage: 'problem_validation',
    });
    expect(sendNotifications).toHaveBeenCalled();
  });
});
