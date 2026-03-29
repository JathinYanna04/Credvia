import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const toPostSummaries = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/query-helpers', () => ({
  toPostSummaries,
}));

describe('startup idea list route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sorts startup ideas by validation score when sort=traction', async () => {
    const startupIdeasQuery = {
      select: vi.fn(() => startupIdeasQuery),
      order: vi.fn(() => startupIdeasQuery),
      limit: vi.fn(() => startupIdeasQuery),
      eq: vi.fn(() => startupIdeasQuery),
      then: (resolve: (value: unknown) => void) =>
        resolve({
          data: [{ post_id: 'a' }, { post_id: 'b' }],
          error: null,
        }),
    };

    const postsQuery = {
      select: vi.fn(() => postsQuery),
      in: vi.fn(() => postsQuery),
      eq: vi.fn(() => postsQuery),
      order: vi.fn(async () => ({
        data: [
          { id: 'b', created_at: '2026-03-28T00:00:00.000Z' },
          { id: 'a', created_at: '2026-03-29T00:00:00.000Z' },
        ],
        error: null,
      })),
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'startup_ideas') return startupIdeasQuery;
        if (table === 'posts') return postsQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    toPostSummaries.mockResolvedValue([
      { id: 'b', createdAt: '2026-03-28T00:00:00.000Z', startupIdea: { validationScore: 20 } },
      { id: 'a', createdAt: '2026-03-29T00:00:00.000Z', startupIdea: { validationScore: 40 } },
    ]);

    const { GET } = await import('@/app/api/v1/ideas/route');
    const response = await GET(new Request('http://localhost:3000/api/v1/ideas?sort=traction'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.map((idea: { id: string }) => idea.id)).toEqual(['a', 'b']);
  });
});
