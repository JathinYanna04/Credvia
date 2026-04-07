import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const listConversationMessageReactions = vi.fn();
const toggleMessageReaction = vi.fn();

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
  listConversationMessageReactions,
  toggleMessageReaction,
}));

describe('chat reactions routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    createServerSupabaseClient.mockResolvedValue({});
    getRequiredUser.mockResolvedValue({ id: 'user-1' });
  });

  it('lists reactions for conversation messages', async () => {
    listConversationMessageReactions.mockResolvedValue([
      {
        id: 'reaction-1',
        messageId: '11111111-1111-4111-8111-111111111111',
        conversationId: 'conv-1',
        userId: 'user-2',
        emoji: '❤️',
        createdAt: '2026-04-08T00:00:00.000Z',
        updatedAt: '2026-04-08T00:00:00.000Z',
      },
    ]);

    const { GET } = await import('@/app/api/v1/chat/conversations/[id]/reactions/route');

    const response = await GET(
      new Request(
        'http://localhost:3000/api/v1/chat/conversations/conv-1/reactions?messageId=11111111-1111-4111-8111-111111111111',
      ),
      {
        params: {
          id: 'conv-1',
        },
      },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.meta?.total).toBe(1);
    expect(listConversationMessageReactions).toHaveBeenCalledWith(
      {},
      'user-1',
      'conv-1',
      {
        messageIds: ['11111111-1111-4111-8111-111111111111'],
      },
    );
  });

  it('toggles a reaction for a message', async () => {
    toggleMessageReaction.mockResolvedValue({
      reacted: true,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      emoji: '👍',
      reaction: {
        id: 'reaction-1',
        messageId: 'msg-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        emoji: '👍',
        createdAt: '2026-04-08T00:00:00.000Z',
        updatedAt: '2026-04-08T00:00:00.000Z',
      },
    });

    const { PUT } = await import('@/app/api/v1/chat/messages/[id]/reactions/route');

    const response = await PUT(
      new Request('http://localhost:3000/api/v1/chat/messages/msg-1/reactions', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          emoji: '👍',
        }),
      }),
      {
        params: {
          id: 'msg-1',
        },
      },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data?.reacted).toBe(true);
    expect(toggleMessageReaction).toHaveBeenCalledWith({}, {
      messageId: 'msg-1',
      userId: 'user-1',
      emoji: '👍',
    });
  });
});
