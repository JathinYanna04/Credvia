import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();
const getRequiredUser = vi.fn();
const createServiceRoleClient = vi.fn();
const createOrGetDmConversation = vi.fn();
const getConversationSummary = vi.fn();
const getUserKeypair = vi.fn();

const REQUESTER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';

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

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient,
}));

vi.mock('@/lib/chat/queries', () => ({
  createOrGetDmConversation,
  getConversationSummary,
  getUserKeypair,
}));

function createUserLookupSupabase(targetExists: boolean) {
  const usersLookupBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: targetExists ? { id: TARGET_ID } : null,
      error: null,
    })),
  };

  usersLookupBuilder.select.mockImplementation(() => usersLookupBuilder);
  usersLookupBuilder.eq.mockImplementation(() => usersLookupBuilder);

  return {
    from: vi.fn((table: string) => {
      if (table === 'users') {
        return usersLookupBuilder;
      }

      throw new Error(`Unexpected table lookup: ${table}`);
    }),
  };
}

describe('chat dm route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabaseClient.mockResolvedValue(createUserLookupSupabase(true));
    getRequiredUser.mockResolvedValue({ id: REQUESTER_ID });
    createServiceRoleClient.mockReturnValue(null);
  });

  it('returns 400 for self DM attempts', async () => {
    const { POST } = await import('@/app/api/v1/chat/dm/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/chat/dm', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: REQUESTER_ID,
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
    expect(payload.error?.message).toContain('Cannot start a DM with yourself');
  });

  it('returns 404 when recipient does not exist', async () => {
    createServerSupabaseClient.mockResolvedValue(createUserLookupSupabase(false));

    const { POST } = await import('@/app/api/v1/chat/dm/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/chat/dm', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: TARGET_ID,
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error?.code).toBe('NOT_FOUND');
    expect(payload.error?.message).toContain('Recipient user not found');
    expect(getUserKeypair).not.toHaveBeenCalled();
    expect(createOrGetDmConversation).not.toHaveBeenCalled();
  });

  it('returns 409 when recipient chat identity is missing', async () => {
    getUserKeypair
      .mockResolvedValueOnce({ user_id: REQUESTER_ID })
      .mockResolvedValueOnce(null);

    const { POST } = await import('@/app/api/v1/chat/dm/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/chat/dm', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: TARGET_ID,
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
    expect(payload.error?.message).toContain('Recipient secure chat identity');
    expect(payload.error?.details?.reason).toBe('RECIPIENT_CHAT_IDENTITY_MISSING');
    expect(createOrGetDmConversation).not.toHaveBeenCalled();
    expect(getConversationSummary).not.toHaveBeenCalled();
  });

  it('returns 201 when a new DM conversation is created', async () => {
    const conversation = {
      conversation: { id: 'conv-1' },
      created: true,
      recoveredFromUniqueConflict: false,
    };
    const summary = {
      id: 'conv-1',
      type: 'dm',
      messageCount: 0,
    };

    getUserKeypair
      .mockResolvedValueOnce({ user_id: REQUESTER_ID })
      .mockResolvedValueOnce({ user_id: TARGET_ID });
    createOrGetDmConversation.mockResolvedValue(conversation);
    getConversationSummary.mockResolvedValue(summary);

    const { POST } = await import('@/app/api/v1/chat/dm/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/chat/dm', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: TARGET_ID,
        }),
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.data).toEqual(summary);
    expect(createOrGetDmConversation).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Function) }),
      {
        requesterUserId: REQUESTER_ID,
        targetUserId: TARGET_ID,
        wrappedKeys: undefined,
      },
    );
    expect(getConversationSummary).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Function) }),
      REQUESTER_ID,
      conversation.conversation.id,
    );
  });

  it('returns 200 when DM already exists', async () => {
    getUserKeypair
      .mockResolvedValueOnce({ user_id: REQUESTER_ID })
      .mockResolvedValueOnce({ user_id: TARGET_ID });
    createOrGetDmConversation.mockResolvedValue({
      conversation: { id: 'conv-existing' },
      created: false,
      recoveredFromUniqueConflict: false,
    });
    getConversationSummary.mockResolvedValue({
      id: 'conv-existing',
      type: 'dm',
      messageCount: 5,
    });

    const { POST } = await import('@/app/api/v1/chat/dm/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/chat/dm', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: TARGET_ID,
        }),
      }),
    );

    expect(response.status).toBe(200);
  });

  it('returns 200 when create race is recovered by unique-conflict retry', async () => {
    getUserKeypair
      .mockResolvedValueOnce({ user_id: REQUESTER_ID })
      .mockResolvedValueOnce({ user_id: TARGET_ID });
    createOrGetDmConversation.mockResolvedValue({
      conversation: { id: 'conv-race' },
      created: false,
      recoveredFromUniqueConflict: true,
    });
    getConversationSummary.mockResolvedValue({
      id: 'conv-race',
      type: 'dm',
      messageCount: 1,
    });

    const { POST } = await import('@/app/api/v1/chat/dm/route');

    const response = await POST(
      new Request('http://localhost:3000/api/v1/chat/dm', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: TARGET_ID,
        }),
      }),
    );

    expect(response.status).toBe(200);
  });
});
