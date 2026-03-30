import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const getOwnedResume = vi.fn();
const getActiveResume = vi.fn();
const recomputeMatchesForResume = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
}));

vi.mock('@/lib/career-match/queries', () => ({
  getOwnedResume,
  getActiveResume,
}));

vi.mock('@/lib/matching/service', () => ({
  recomputeMatchesForResume,
}));

describe('career match routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recomputes matches for the active owned resume', async () => {
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });
    getActiveResume.mockResolvedValue({ id: 'resume-1' });
    recomputeMatchesForResume.mockResolvedValue(8);

    const { POST } = await import('@/app/api/v1/matches/recompute/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/matches/recompute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({
      recomputed: true,
      matchCount: 8,
      resumeId: 'resume-1',
    });
  });

  it('saves a match only when it belongs to the current user', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'job_matches') {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        maybeSingle: async () => ({ data: { id: 'match-1' }, error: null }),
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === 'saved_job_matches') {
          return {
            upsert: async () => ({ error: null }),
            delete() {
              return {
                eq() {
                  return {
                    eq: async () => ({ error: null }),
                  };
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createServerSupabaseClient.mockResolvedValue(supabase);
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
    enforceRateLimit.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/v1/matches/[id]/save/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/matches/match-1/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saved: true }),
      }),
      { params: { id: 'match-1' } },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ saved: true });
  });
});
