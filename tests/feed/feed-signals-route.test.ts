import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const logError = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
}));

vi.mock('@/lib/supabase/helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/helpers')>(
    '@/lib/supabase/helpers',
  );

  return {
    ...actual,
    getRequiredUser,
  };
});

vi.mock('@/lib/utils/logger', () => ({
  logError,
}));

function createSignalsSupabase(insertError: { message: string; code?: string } | null) {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'feed_signal_events') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        insert: vi.fn(async () => ({
          error: insertError,
        })),
      };
    }),
  };
}

describe('feed signals route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
  });

  it('records signals when storage write succeeds', async () => {
    createServerSupabaseClient.mockResolvedValue(createSignalsSupabase(null));

    const { POST } = await import('@/app/api/v1/feed/signals/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/feed/signals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          postId: '11111111-1111-4111-8111-111111111111',
          signalType: 'open',
          durationMs: 1250,
          metadata: {
            surface: 'feed',
          },
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ recorded: true });
    expect(logError).not.toHaveBeenCalled();
  });

  it('degrades gracefully when signal persistence fails', async () => {
    createServerSupabaseClient.mockResolvedValue(
      createSignalsSupabase({
        message: 'relation "feed_signal_events" does not exist',
        code: '42P01',
      }),
    );

    const { POST } = await import('@/app/api/v1/feed/signals/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/feed/signals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          signalType: 'open',
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({
      recorded: false,
      degraded: true,
      reason: 'signal_store_unavailable',
    });
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('returns unauthorized when auth fails', async () => {
    createServerSupabaseClient.mockResolvedValue(createSignalsSupabase(null));
    getRequiredUser.mockRejectedValue(new Error('UNAUTHORIZED'));

    const { POST } = await import('@/app/api/v1/feed/signals/route');
    const response = await POST(
      new Request('http://localhost:3000/api/v1/feed/signals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          signalType: 'open',
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error?.code).toBe('UNAUTHORIZED');
  });
});
