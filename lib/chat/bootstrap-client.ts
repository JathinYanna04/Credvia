import {
  exportConversationKeyRaw,
  generateConversationKey,
  generateUserKeyPair,
  unwrapConversationKeyForParticipant,
  wrapConversationKeyForParticipant,
} from '@/lib/chat/crypto';
import type { ChatConversationSummary } from '@/lib/chat/contracts';
import type { ApiResponse } from '@/lib/types';

interface LocalUserKeypair {
  publicKey: string;
  privateKey: string;
  algorithm: string;
  keyVersion: number;
}

interface ConversationKeyEnvelope {
  conversationId: string;
  userId: string;
  encryptedConversationKey: string;
  keyEncryptionAlgorithm: string;
  keyVersion: number;
  createdAt: string;
  rotatedAt: string | null;
}

interface WrappedConversationKeyPayload {
  userId: string;
  encryptedConversationKey: string;
  keyEncryptionAlgorithm: string;
  keyVersion: number;
}

interface BootstrapResult {
  conversationId: string;
  warning: string | null;
}

const USER_KEYPAIR_STORAGE_KEY = 'credvia.chat.user-keypair.v1';
const inFlightDmBootstraps = new Map<string, Promise<BootstrapResult>>();

function conversationKeyStorageKey(conversationId: string) {
  return `credvia.chat.conversation-key.${conversationId}.v1`;
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    payload.error &&
    typeof payload.error === 'object' &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message;
  }

  return fallback;
}

function getChatErrorReason(payload: unknown) {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    payload.error &&
    typeof payload.error === 'object' &&
    'details' in payload.error &&
    payload.error.details &&
    typeof payload.error.details === 'object' &&
    'reason' in payload.error.details &&
    typeof payload.error.details.reason === 'string'
  ) {
    return payload.error.details.reason;
  }

  return null;
}

function dmBootstrapKey(currentUserId: string, targetUserId: string) {
  return `${currentUserId}:${targetUserId}`;
}

function readStoredUserKeypair() {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem(USER_KEYPAIR_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as LocalUserKeypair;
  } catch {
    localStorage.removeItem(USER_KEYPAIR_STORAGE_KEY);
    return null;
  }
}

function saveStoredUserKeypair(keypair: LocalUserKeypair) {
  localStorage.setItem(USER_KEYPAIR_STORAGE_KEY, JSON.stringify(keypair));
}

async function ensureLocalUserKeypair() {
  const existing = readStoredUserKeypair();
  if (existing) {
    return existing;
  }

  const generated = await generateUserKeyPair();
  const created: LocalUserKeypair = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    algorithm: generated.algorithm,
    keyVersion: generated.keyVersion,
  };

  saveStoredUserKeypair(created);
  return created;
}

async function syncLocalPublicKey(keypair: LocalUserKeypair) {
  const response = await fetch('/api/v1/chat/me/keypair', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      publicKey: keypair.publicKey,
      algorithm: keypair.algorithm,
      keyVersion: keypair.keyVersion,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
    throw new Error(payload?.error?.message ?? 'Unable to sync your chat keypair.');
  }
}

async function fetchUserPublicKey(userId: string) {
  const response = await fetch(`/api/v1/chat/users/${userId}/keypair`, {
    method: 'GET',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(getErrorMessage(payload, 'Unable to fetch recipient keypair.'));
  }

  const payload = (await response.json()) as ApiResponse<{ publicKey: string }>;
  return payload.data?.publicKey ?? null;
}

async function fetchConversationSummaryOrThrow(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as ApiResponse<ChatConversationSummary> | null;

  if (!response.ok || !payload?.data) {
    const reason = getChatErrorReason(payload);

    if (reason === 'REQUESTER_CHAT_IDENTITY_MISSING') {
      throw new Error('Your secure chat identity is not initialized yet. Please refresh and try again.');
    }

    if (reason === 'RECIPIENT_CHAT_IDENTITY_MISSING') {
      throw new Error('This user is not ready for secure messaging yet.');
    }

    throw new Error(payload?.error?.message ?? 'Unable to start chat.');
  }

  return payload.data;
}

async function fetchConversationKeyEnvelope(conversationId: string) {
  const response = await fetch(`/api/v1/chat/conversations/${conversationId}/key`, {
    method: 'GET',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(getErrorMessage(payload, 'Unable to load your conversation key.'));
  }

  const payload = (await response.json()) as ApiResponse<ConversationKeyEnvelope | null>;
  return payload.data ?? null;
}

async function storeConversationKeyFromEnvelope(
  conversationId: string,
  envelope: ConversationKeyEnvelope,
  privateKey: string,
) {
  const conversationKey = await unwrapConversationKeyForParticipant(
    envelope.encryptedConversationKey,
    privateKey,
  );
  const rawConversationKey = await exportConversationKeyRaw(conversationKey);
  localStorage.setItem(conversationKeyStorageKey(conversationId), rawConversationKey);
}

async function ensureConversationKeyCached(
  conversationId: string,
  privateKey: string,
) {
  const keyEnvelope = await fetchConversationKeyEnvelope(conversationId);

  if (!keyEnvelope) {
    return false;
  }

  await storeConversationKeyFromEnvelope(conversationId, keyEnvelope, privateKey);
  return true;
}

async function buildWrappedKeysForConversation(
  currentUserId: string,
  currentUserPublicKey: string,
  collaboratorUserId: string,
  collaboratorPublicKey: string | null,
) {
  const conversationKey = await generateConversationKey();
  const wrappedKeys: WrappedConversationKeyPayload[] = [];

  const selfWrapped = await wrapConversationKeyForParticipant(
    conversationKey,
    currentUserPublicKey,
  );

  wrappedKeys.push({
    userId: currentUserId,
    encryptedConversationKey: selfWrapped.encryptedConversationKey,
    keyEncryptionAlgorithm: selfWrapped.keyEncryptionAlgorithm,
    keyVersion: 1,
  });

  if (collaboratorPublicKey && collaboratorUserId !== currentUserId) {
    const collaboratorWrapped = await wrapConversationKeyForParticipant(
      conversationKey,
      collaboratorPublicKey,
    );

    wrappedKeys.push({
      userId: collaboratorUserId,
      encryptedConversationKey: collaboratorWrapped.encryptedConversationKey,
      keyEncryptionAlgorithm: collaboratorWrapped.keyEncryptionAlgorithm,
      keyVersion: 1,
    });
  }

  return wrappedKeys;
}

export async function bootstrapDirectMessageConversation(
  currentUserId: string,
  targetUserId: string,
): Promise<BootstrapResult> {
  const key = dmBootstrapKey(currentUserId, targetUserId);
  const existing = inFlightDmBootstraps.get(key);

  if (existing) {
    return existing;
  }

  const bootstrapPromise = (async () => {
    const localUserKeypair = await ensureLocalUserKeypair();
    await syncLocalPublicKey(localUserKeypair);

    const initialSummary = await fetchConversationSummaryOrThrow('/api/v1/chat/dm', {
      targetUserId,
    });

    let hasKey = await ensureConversationKeyCached(
      initialSummary.id,
      localUserKeypair.privateKey,
    );

    if (!hasKey && initialSummary.messageCount === 0) {
      const targetPublicKey = await fetchUserPublicKey(targetUserId);
      if (!targetPublicKey) {
        throw new Error('This user is not ready for secure messaging yet.');
      }

      const wrappedKeys = await buildWrappedKeysForConversation(
        currentUserId,
        localUserKeypair.publicKey,
        targetUserId,
        targetPublicKey,
      );

      await fetchConversationSummaryOrThrow('/api/v1/chat/dm', {
        targetUserId,
        wrappedKeys,
      });

      hasKey = await ensureConversationKeyCached(
        initialSummary.id,
        localUserKeypair.privateKey,
      );
    }

    return {
      conversationId: initialSummary.id,
      warning: hasKey
        ? null
        : 'Conversation opened, but this device does not have a decryptable key for this thread yet.',
    };
  })();

  inFlightDmBootstraps.set(key, bootstrapPromise);

  try {
    return await bootstrapPromise;
  } finally {
    if (inFlightDmBootstraps.get(key) === bootstrapPromise) {
      inFlightDmBootstraps.delete(key);
    }
  }
}

export async function bootstrapIdeaGroupConversation(
  currentUserId: string,
  ideaId: string,
  founderUserId: string,
): Promise<BootstrapResult> {
  const localUserKeypair = await ensureLocalUserKeypair();
  await syncLocalPublicKey(localUserKeypair);

  const initialSummary = await fetchConversationSummaryOrThrow(
    `/api/v1/chat/ideas/${ideaId}/conversation`,
    {
      join: true,
    },
  );

  let hasKey = await ensureConversationKeyCached(
    initialSummary.id,
    localUserKeypair.privateKey,
  );

  if (!hasKey && initialSummary.messageCount === 0) {
    const founderPublicKey =
      founderUserId === currentUserId
        ? localUserKeypair.publicKey
        : await fetchUserPublicKey(founderUserId);

    const wrappedKeys = await buildWrappedKeysForConversation(
      currentUserId,
      localUserKeypair.publicKey,
      founderUserId,
      founderPublicKey,
    );

    await fetchConversationSummaryOrThrow(
      `/api/v1/chat/ideas/${ideaId}/conversation`,
      {
        join: true,
        wrappedKeys,
      },
    );

    hasKey = await ensureConversationKeyCached(
      initialSummary.id,
      localUserKeypair.privateKey,
    );
  }

  return {
    conversationId: initialSummary.id,
    warning: hasKey
      ? null
      : 'Conversation opened, but this device does not have a decryptable key for this thread yet.',
  };
}
