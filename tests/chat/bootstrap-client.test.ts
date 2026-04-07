import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cryptoMocks = vi.hoisted(() => ({
  generateUserKeyPair: vi.fn(async () => ({
    publicKey: 'PUBLIC_SELF',
    privateKey: 'PRIVATE_SELF',
    algorithm: 'RSA-OAEP-256',
    keyVersion: 1,
  })),
  generateConversationKey: vi.fn(async () => 'CONVERSATION_KEY_MOCK'),
  wrapConversationKeyForParticipant: vi.fn(async (_conversationKey: unknown, participantPublicKey: string) => ({
    encryptedConversationKey: `wrapped-for:${participantPublicKey}`,
    keyEncryptionAlgorithm: 'RSA-OAEP-256',
  })),
  unwrapConversationKeyForParticipant: vi.fn(async (encryptedConversationKey: string, privateKey: string) => (
    `unwrapped:${encryptedConversationKey}:${privateKey}`
  )),
  exportConversationKeyRaw: vi.fn(async (conversationKey: unknown) => `raw:${String(conversationKey)}`),
}));

vi.mock('@/lib/chat/crypto', () => cryptoMocks);

import {
  bootstrapDirectMessageConversation,
  bootstrapIdeaGroupConversation,
} from '@/lib/chat/bootstrap-client';
import {
  generateConversationKey,
  generateUserKeyPair,
  wrapConversationKeyForParticipant,
} from '@/lib/chat/crypto';

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    get length() {
      return values.size;
    },
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function createConversationSummary(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'conv-1',
    type: 'dm',
    sourceType: null,
    sourceId: null,
    title: null,
    description: null,
    isArchived: false,
    lastMessageAt: null,
    lastMessageId: null,
    messageCount: 1,
    unreadCount: 0,
    counterpart: null,
    lastMessage: null,
    ...overrides,
  };
}

describe('chat bootstrap client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', {} as unknown as Window & typeof globalThis);
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals?.();
  });

  it('reuses existing DM and caches decryptable key when available', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/v1/chat/me/keypair' && init?.method === 'PUT') {
        return jsonResponse({ data: { ok: true } });
      }

      if (url === '/api/v1/chat/dm' && init?.method === 'POST') {
        return jsonResponse({ data: createConversationSummary({ messageCount: 2 }) });
      }

      if (url === '/api/v1/chat/conversations/conv-1/key' && init?.method === 'GET') {
        return jsonResponse({
          data: {
            conversationId: 'conv-1',
            userId: 'user-1',
            encryptedConversationKey: 'wrapped-for:PUBLIC_SELF',
            keyEncryptionAlgorithm: 'RSA-OAEP-256',
            keyVersion: 1,
            createdAt: '2026-04-08T10:00:00.000Z',
            rotatedAt: null,
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${url} ${init?.method ?? 'GET'}`);

    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await bootstrapDirectMessageConversation('user-1', 'user-2');

    expect(result).toEqual({
      conversationId: 'conv-1',
      warning: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const storedConversationKey = localStorage.getItem('credvia.chat.conversation-key.conv-1.v1');
    expect(storedConversationKey).toBe('raw:unwrapped:wrapped-for:PUBLIC_SELF:PRIVATE_SELF');

    const dmPayload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(dmPayload).toEqual({ targetUserId: 'user-2' });
    expect(vi.mocked(generateUserKeyPair)).toHaveBeenCalledTimes(1);
  });

  it('deduplicates rapid repeated DM bootstrap calls for the same pair', async () => {
    let dmCalls = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/v1/chat/me/keypair' && init?.method === 'PUT') {
        return jsonResponse({ data: { ok: true } });
      }

      if (url === '/api/v1/chat/dm' && init?.method === 'POST') {
        dmCalls += 1;
        return jsonResponse({ data: createConversationSummary({ messageCount: 2 }) });
      }

      if (url === '/api/v1/chat/conversations/conv-1/key' && init?.method === 'GET') {
        return jsonResponse({
          data: {
            conversationId: 'conv-1',
            userId: 'user-1',
            encryptedConversationKey: 'wrapped-for:PUBLIC_SELF',
            keyEncryptionAlgorithm: 'RSA-OAEP-256',
            keyVersion: 1,
            createdAt: '2026-04-08T10:00:00.000Z',
            rotatedAt: null,
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${url} ${init?.method ?? 'GET'}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      bootstrapDirectMessageConversation('user-1', 'user-2'),
      bootstrapDirectMessageConversation('user-1', 'user-2'),
    ]);

    expect(first).toEqual(second);
    expect(dmCalls).toBe(1);
  });

  it('provisions wrapped keys for empty DM conversations that are missing a key', async () => {
    let dmCalls = 0;
    let keyEnvelopeCalls = 0;
    let secondDmPayload: Record<string, unknown> | null = null;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/v1/chat/me/keypair' && init?.method === 'PUT') {
        return jsonResponse({ data: { ok: true } });
      }

      if (url === '/api/v1/chat/dm' && init?.method === 'POST') {
        dmCalls += 1;
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

        if (dmCalls === 1) {
          expect(body).toEqual({ targetUserId: 'user-2' });
        }

        if (dmCalls === 2) {
          secondDmPayload = body;
        }

        return jsonResponse({ data: createConversationSummary({ messageCount: 0 }) });
      }

      if (url === '/api/v1/chat/conversations/conv-1/key' && init?.method === 'GET') {
        keyEnvelopeCalls += 1;

        if (keyEnvelopeCalls === 1) {
          return new Response(null, { status: 404 });
        }

        return jsonResponse({
          data: {
            conversationId: 'conv-1',
            userId: 'user-1',
            encryptedConversationKey: 'wrapped-for:PUBLIC_SELF',
            keyEncryptionAlgorithm: 'RSA-OAEP-256',
            keyVersion: 1,
            createdAt: '2026-04-08T10:00:00.000Z',
            rotatedAt: null,
          },
        });
      }

      if (url === '/api/v1/chat/users/user-2/keypair' && init?.method === 'GET') {
        return jsonResponse({
          data: {
            publicKey: 'PUBLIC_TARGET',
          },
        });
      }

      throw new Error(`Unexpected fetch call: ${url} ${init?.method ?? 'GET'}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await bootstrapDirectMessageConversation('user-1', 'user-2');

    expect(result.warning).toBeNull();
    expect(result.conversationId).toBe('conv-1');
    expect(dmCalls).toBe(2);
    expect(keyEnvelopeCalls).toBe(2);
    expect(vi.mocked(generateConversationKey)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(wrapConversationKeyForParticipant)).toHaveBeenCalledTimes(2);

    if (!secondDmPayload) {
      throw new Error('Expected wrapped key DM payload to be captured.');
    }

    const dmPayload = secondDmPayload as Record<string, unknown>;
    expect(dmPayload.targetUserId).toBe('user-2');
    const wrappedKeys = dmPayload.wrappedKeys as Array<Record<string, unknown>>;
    expect(wrappedKeys).toHaveLength(2);
    expect(wrappedKeys.map((value) => value.userId)).toEqual(['user-1', 'user-2']);

    const storedConversationKey = localStorage.getItem('credvia.chat.conversation-key.conv-1.v1');
    expect(storedConversationKey).toBe('raw:unwrapped:wrapped-for:PUBLIC_SELF:PRIVATE_SELF');
  });

  it('throws a clear error when recipient chat identity is missing', async () => {
    let keyEnvelopeCalls = 0;
    let dmCalls = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/v1/chat/me/keypair' && init?.method === 'PUT') {
        return jsonResponse({ data: { ok: true } });
      }

      if (url === '/api/v1/chat/dm' && init?.method === 'POST') {
        dmCalls += 1;

        return jsonResponse({ data: createConversationSummary({ messageCount: 0 }) });
      }

      if (url === '/api/v1/chat/conversations/conv-1/key' && init?.method === 'GET') {
        keyEnvelopeCalls += 1;
        return new Response(null, { status: 404 });
      }

      if (url === '/api/v1/chat/users/user-2/keypair' && init?.method === 'GET') {
        return new Response(null, { status: 404 });
      }

      throw new Error(`Unexpected fetch call: ${url} ${init?.method ?? 'GET'}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      bootstrapDirectMessageConversation('user-1', 'user-2'),
    ).rejects.toThrow('This person is not available for messaging yet.');

    expect(dmCalls).toBe(1);
    expect(keyEnvelopeCalls).toBe(1);
    expect(localStorage.getItem('credvia.chat.conversation-key.conv-1.v1')).toBeNull();
  });

  it('bootstraps idea discussions without fetching founder key when founder is the current user', async () => {
    let ideaCalls = 0;
    let userKeyLookupAttempts = 0;
    let wrappedKeyCount = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/v1/chat/me/keypair' && init?.method === 'PUT') {
        return jsonResponse({ data: { ok: true } });
      }

      if (url === '/api/v1/chat/ideas/idea-1/conversation' && init?.method === 'POST') {
        ideaCalls += 1;
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

        if (ideaCalls === 2) {
          wrappedKeyCount = Array.isArray(body.wrappedKeys)
            ? body.wrappedKeys.length
            : 0;
        }

        return jsonResponse({
          data: createConversationSummary({
            id: 'conv-idea-1',
            type: 'idea_group',
            sourceType: 'idea',
            sourceId: 'idea-1',
            messageCount: 0,
          }),
        });
      }

      if (url === '/api/v1/chat/conversations/conv-idea-1/key' && init?.method === 'GET') {
        if (ideaCalls === 1) {
          return new Response(null, { status: 404 });
        }

        return jsonResponse({
          data: {
            conversationId: 'conv-idea-1',
            userId: 'user-1',
            encryptedConversationKey: 'wrapped-for:PUBLIC_SELF',
            keyEncryptionAlgorithm: 'RSA-OAEP-256',
            keyVersion: 1,
            createdAt: '2026-04-08T10:00:00.000Z',
            rotatedAt: null,
          },
        });
      }

      if (url === '/api/v1/chat/users/user-1/keypair' && init?.method === 'GET') {
        userKeyLookupAttempts += 1;
        return jsonResponse({ data: { publicKey: 'PUBLIC_SELF' } });
      }

      throw new Error(`Unexpected fetch call: ${url} ${init?.method ?? 'GET'}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await bootstrapIdeaGroupConversation('user-1', 'idea-1', 'user-1');

    expect(result).toEqual({
      conversationId: 'conv-idea-1',
      warning: null,
    });
    expect(ideaCalls).toBe(2);
    expect(userKeyLookupAttempts).toBe(0);
    expect(wrappedKeyCount).toBe(1);
  });
});
