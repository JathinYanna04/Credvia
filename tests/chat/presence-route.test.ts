import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const updateChatPresence = vi.fn();

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

vi.mock('@/lib/chat/queries', () => ({
  updateChatPresence,
}));

describe('chat presence route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
  });

  it('updates presence successfully', async () => {
    updateChatPresence.mockResolvedValue({
      userId: 'user-1',
      status: 'online',
      lastSeenAt: '2026-04-09T08:00:00.000Z',
      updatedAt: '2026-04-09T08:00:00.000Z',
      heartbeatOnly: true,
    });

    const { PUT } = await import('@/app/api/v1/chat/me/presence/route');
    const response = await PUT(
      new Request('http://localhost:3000/api/v1/chat/me/presence', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          heartbeatOnly: true,
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data?.userId).toBe('user-1');
    expect(payload.data?.status).toBe('online');
    expect(updateChatPresence).toHaveBeenCalledWith({}, {
      userId: 'user-1',
      status: undefined,
      heartbeatOnly: true,
    });
  });

  it('returns degraded presence when schema is unavailable', async () => {
    updateChatPresence.mockRejectedValue(new Error('relation "chat_user_presence" does not exist'));

    const { PUT } = await import('@/app/api/v1/chat/me/presence/route');
    const response = await PUT(
      new Request('http://localhost:3000/api/v1/chat/me/presence', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          status: 'online',
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data?.degraded).toBe(true);
    expect(payload.data?.userId).toBe('user-1');
    expect(payload.data?.status).toBe('offline');
  });

  it('returns unauthorized when auth fails', async () => {
    getRequiredUser.mockRejectedValue(new Error('UNAUTHORIZED'));

    const { PUT } = await import('@/app/api/v1/chat/me/presence/route');
    const response = await PUT(
      new Request('http://localhost:3000/api/v1/chat/me/presence', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          heartbeatOnly: true,
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error?.code).toBe('UNAUTHORIZED');
  });
});
