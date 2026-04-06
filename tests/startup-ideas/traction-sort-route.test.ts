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
      ilike: vi.fn(() => startupIdeasQuery),
      then: (resolve: (value: unknown) => void) =>
        resolve({
          data: [
            { post_id: 'a', last_revision_at: '2026-03-29T00:00:00.000Z' },
            { post_id: 'b', last_revision_at: '2026-03-28T00:00:00.000Z' },
          ],
          error: null,
        }),
    };

    const postsQuery = {
      select: vi.fn(() => postsQuery),
      in: vi.fn(() => postsQuery),
      eq: vi.fn(() => postsQuery),
      or: vi.fn(() => postsQuery),
      limit: vi.fn(() => postsQuery),
      order: vi.fn(async () => ({
        data: [
          { id: 'b', created_at: '2026-03-28T00:00:00.000Z' },
          { id: 'a', created_at: '2026-03-29T00:00:00.000Z' },
        ],
        error: null,
      })),
    };

    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
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
    expect(toPostSummaries).toHaveBeenCalledWith(supabase, expect.any(Array), undefined);
  });

  it('supports active sort and query filtering over startup-idea fields', async () => {
    const startupIdeasQuery = {
      select: vi.fn(() => startupIdeasQuery),
      order: vi.fn(() => startupIdeasQuery),
      limit: vi.fn(() => startupIdeasQuery),
      eq: vi.fn(() => startupIdeasQuery),
      ilike: vi.fn(() => startupIdeasQuery),
      then: (resolve: (value: unknown) => void) =>
        resolve({
          data: [
            {
              post_id: 'idea-recent',
              problem: 'Old issue',
              target_audience: 'Old audience',
              solution: 'Old solution',
              market_category: 'old',
              last_revision_at: '2026-03-20T00:00:00.000Z',
            },
            {
              post_id: 'idea-active',
              problem: 'Builders need AI design review',
              target_audience: 'Founders',
              solution: 'Human feedback loop',
              market_category: 'ai',
              last_revision_at: '2026-03-29T00:00:00.000Z',
            },
          ],
          error: null,
        }),
    };

    const postsQuery = {
      select: vi.fn(() => postsQuery),
      in: vi.fn(() => postsQuery),
      eq: vi.fn(() => postsQuery),
      or: vi.fn(() => postsQuery),
      limit: vi.fn(() => postsQuery),
      order: vi.fn(async () => ({
        data: [
          { id: 'idea-recent', created_at: '2026-03-25T00:00:00.000Z' },
          { id: 'idea-active', created_at: '2026-03-21T00:00:00.000Z' },
        ],
        error: null,
      })),
    };

    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
      from: vi.fn((table: string) => {
        if (table === 'startup_ideas') return startupIdeasQuery;
        if (table === 'posts') return postsQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    toPostSummaries.mockResolvedValue([
      {
        id: 'idea-recent',
        title: 'Old post',
        body: 'Nothing about robotics',
        createdAt: '2026-03-25T00:00:00.000Z',
        startupIdea: {
          validationScore: 12,
          problem: 'Old issue',
          targetAudience: 'Old audience',
          solution: 'Old solution',
          marketCategory: 'old',
          lastRevisionAt: '2026-03-20T00:00:00.000Z',
        },
      },
      {
        id: 'idea-active',
        title: 'AI workflow review',
        body: 'Testing',
        createdAt: '2026-03-21T00:00:00.000Z',
        startupIdea: {
          validationScore: 5,
          problem: 'Builders need AI design review',
          targetAudience: 'Founders',
          solution: 'Human feedback loop',
          marketCategory: 'ai',
          lastRevisionAt: '2026-03-29T00:00:00.000Z',
        },
      },
    ]);

    const { GET } = await import('@/app/api/v1/ideas/route');
    const response = await GET(new Request('http://localhost:3000/api/v1/ideas?sort=active&q=ai'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.map((idea: { id: string }) => idea.id)).toEqual(['idea-active']);
  });

  it('returns 200 for public list requests when auth helpers are absent', async () => {
    const startupIdeasQuery = {
      select: vi.fn(() => startupIdeasQuery),
      order: vi.fn(() => startupIdeasQuery),
      limit: vi.fn(() => startupIdeasQuery),
      eq: vi.fn(() => startupIdeasQuery),
      ilike: vi.fn(() => startupIdeasQuery),
      then: (resolve: (value: unknown) => void) =>
        resolve({
          data: [
            {
              post_id: 'idea-plain',
              problem: 'Manual sales follow-up',
              target_audience: 'Small teams',
              solution: 'Inbox triage tooling',
              market_category: 'sales',
              stage: 'mvp',
              created_at: '2026-03-30T00:00:00.000Z',
            },
          ],
          error: null,
        }),
    };

    const postsQuery = {
      select: vi.fn(() => postsQuery),
      in: vi.fn(() => postsQuery),
      eq: vi.fn(() => postsQuery),
      or: vi.fn(() => postsQuery),
      limit: vi.fn(() => postsQuery),
      order: vi.fn(async () => ({
        data: [{ id: 'idea-plain', created_at: '2026-03-30T00:00:00.000Z' }],
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
      {
        id: 'idea-plain',
        title: 'Inbox helper',
        body: 'Public listing still works',
        createdAt: '2026-03-30T00:00:00.000Z',
        startupIdea: {
          validationScore: 8,
          problem: 'Manual sales follow-up',
          targetAudience: 'Small teams',
          solution: 'Inbox triage tooling',
          marketCategory: 'sales',
        },
      },
    ]);

    const { GET } = await import('@/app/api/v1/ideas/route');
    const response = await GET(new Request('http://localhost:3000/api/v1/ideas?q=inbox'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.map((idea: { id: string }) => idea.id)).toEqual(['idea-plain']);
    expect(toPostSummaries).toHaveBeenCalledWith(supabase, expect.any(Array), undefined);
  });
});
