import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const createServiceRoleClient = vi.fn();
const getRequiredUser = vi.fn();
const enforceRateLimit = vi.fn();
const syncYcJobs = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient,
}));

vi.mock('@/lib/supabase/helpers', () => ({
  getRequiredUser,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
}));

vi.mock('@/lib/jobs/sync', () => ({
  syncYcJobs,
}));

describe('startup sources sync route', () => {
  const originalSecret = process.env.CAREER_MATCH_SYNC_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CAREER_MATCH_SYNC_SECRET = 'career-secret';
  });

  afterAll(() => {
    process.env.CAREER_MATCH_SYNC_SECRET = originalSecret;
  });

  it('uses the sync secret and runs YC sync in dry-run mode', async () => {
    enforceRateLimit.mockResolvedValue({ success: true });
    createServiceRoleClient.mockReturnValue({ from: vi.fn() });
    syncYcJobs.mockResolvedValue({
      source: 'yc',
      companyCount: 10,
      jobCount: 25,
      upsertedJobs: 0,
    });

    const { POST } = await import('@/app/api/v1/startup-sources/sync/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/startup-sources/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sync-secret': 'career-secret',
        },
        body: JSON.stringify({ source: 'yc', dryRun: true }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(syncYcJobs).toHaveBeenCalledWith(expect.anything(), { dryRun: true });
    expect(payload.data.source).toBe('yc');
  });
});
