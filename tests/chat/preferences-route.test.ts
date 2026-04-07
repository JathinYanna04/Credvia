import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const updateConversationPreferences = vi.fn();

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
  updateConversationPreferences,
}));

describe('chat conversation preferences route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
  });

  it('updates conversation preferences successfully', async () => {
    updateConversationPreferences.mockResolvedValue({
      conversationId: 'conv-1',
      userId: 'user-1',
      notificationsMuted: true,
      isPinned: false,
      pinnedAt: null,
      updatedAt: '2026-04-09T08:00:00.000Z',
    });

    const { PATCH } = await import('@/app/api/v1/chat/conversations/[id]/preferences/route');
    const response = await PATCH(
      new Request('http://localhost:3000/api/v1/chat/conversations/conv-1/preferences', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          notificationsMuted: true,
        }),
      }),
      {
        params: {
          id: 'conv-1',
        },
      },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data?.notificationsMuted).toBe(true);
    expect(updateConversationPreferences).toHaveBeenCalledWith(
      {},
      {
        conversationId: 'conv-1',
        userId: 'user-1',
        notificationsMuted: true,
        isPinned: undefined,
      },
    );
  });

  it('returns validation error for empty preference payload', async () => {
    const { PATCH } = await import('@/app/api/v1/chat/conversations/[id]/preferences/route');
    const response = await PATCH(
      new Request('http://localhost:3000/api/v1/chat/conversations/conv-1/preferences', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      }),
      {
        params: {
          id: 'conv-1',
        },
      },
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
    expect(updateConversationPreferences).not.toHaveBeenCalled();
  });

  it('returns unauthorized when auth fails', async () => {
    getRequiredUser.mockRejectedValue(new Error('UNAUTHORIZED'));

    const { PATCH } = await import('@/app/api/v1/chat/conversations/[id]/preferences/route');
    const response = await PATCH(
      new Request('http://localhost:3000/api/v1/chat/conversations/conv-1/preferences', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          isPinned: true,
        }),
      }),
      {
        params: {
          id: 'conv-1',
        },
      },
    );

    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error?.code).toBe('UNAUTHORIZED');
  });
});
