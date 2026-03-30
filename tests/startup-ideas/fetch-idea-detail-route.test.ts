import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getStartupIdeaBundle = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/startup-ideas', () => ({
  getStartupIdeaBundle,
}));

describe('startup idea detail route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the idea and comment thread from the database-backed queries', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'viewer-1' } }, error: null })),
      },
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getStartupIdeaBundle.mockResolvedValue({
      idea: { id: 'idea-1', title: 'Idea' },
      comments: [{ id: 'comment-1', body: 'Useful feedback' }],
      revisions: [{ id: 'rev-1', revisionNumber: 1 }],
      isFollowing: false,
      canRevise: false,
    });

    const { GET } = await import('@/app/api/v1/ideas/[id]/route');

    const response = await GET(new Request('http://localhost:3000/api/v1/ideas/idea-1'), {
      params: { id: 'idea-1' },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.idea.id).toBe('idea-1');
    expect(payload.data.comments).toHaveLength(1);
    expect(payload.data.revisions).toHaveLength(1);
  });
});
