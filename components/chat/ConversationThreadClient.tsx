'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ChatMessageRecord } from '@/lib/chat/contracts';
import {
  decryptMessageContent,
  encryptMessageContent,
  exportConversationKeyRaw,
  generateClientGeneratedId,
  generateUserKeyPair,
  importConversationKeyRaw,
  unwrapConversationKeyForParticipant,
} from '@/lib/chat/crypto';
import type { ApiResponse } from '@/lib/types';
import { cn } from '@/lib/utils/cn';
import { formatRelativeTime } from '@/lib/utils/format';

interface ConversationThreadClientProps {
  conversationId: string;
  currentUserId: string;
  initialMessages: ChatMessageRecord[];
  initialNextCursor: string | null;
}

interface LocalUserKeypair {
  publicKey: string;
  privateKey: string;
  algorithm: string;
  keyVersion: number;
}

interface ConversationKeyPayload {
  conversationId: string;
  userId: string;
  encryptedConversationKey: string;
  keyEncryptionAlgorithm: string;
  keyVersion: number;
  createdAt: string;
  rotatedAt: string | null;
}

const USER_KEYPAIR_STORAGE_KEY = 'credvia.chat.user-keypair.v1';

function conversationKeyStorageKey(conversationId: string) {
  return `credvia.chat.conversation-key.${conversationId}.v1`;
}

function readStoredUserKeypair() {
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

async function syncPublicKey(keypair: LocalUserKeypair) {
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
    const payload = (await response.json().catch(() => null)) as
      | ApiResponse<unknown>
      | null;
    throw new Error(payload?.error?.message ?? 'Unable to sync your chat keypair.');
  }
}

async function resolveConversationKey(
  conversationId: string,
  privateKey: string,
): Promise<{ key: CryptoKey | null; keyVersion: number }> {
  const storedRawKey = localStorage.getItem(conversationKeyStorageKey(conversationId));

  if (storedRawKey) {
    return {
      key: await importConversationKeyRaw(storedRawKey),
      keyVersion: 1,
    };
  }

  const keyResponse = await fetch(`/api/v1/chat/conversations/${conversationId}/key`, {
    method: 'GET',
  });

  if (keyResponse.status === 404) {
    return {
      key: null,
      keyVersion: 1,
    };
  }

  if (!keyResponse.ok) {
    const payload = (await keyResponse.json().catch(() => null)) as
      | ApiResponse<unknown>
      | null;
    throw new Error(payload?.error?.message ?? 'Unable to load your conversation key.');
  }

  const payload = (await keyResponse.json()) as ApiResponse<ConversationKeyPayload | null>;
  if (!payload.data) {
    return {
      key: null,
      keyVersion: 1,
    };
  }

  const key = await unwrapConversationKeyForParticipant(
    payload.data.encryptedConversationKey,
    privateKey,
  );
  const exported = await exportConversationKeyRaw(key);
  localStorage.setItem(conversationKeyStorageKey(conversationId), exported);

  return {
    key,
    keyVersion: payload.data.keyVersion,
  };
}

export function ConversationThreadClient({
  conversationId,
  currentUserId,
  initialMessages,
  initialNextCursor,
}: ConversationThreadClientProps) {
  const [messages, setMessages] = useState<ChatMessageRecord[]>(initialMessages);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [conversationKey, setConversationKey] = useState<CryptoKey | null>(null);
  const [conversationKeyVersion, setConversationKeyVersion] = useState(1);
  const [decryptedText, setDecryptedText] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    async function bootstrapKeys() {
      try {
        const localUserKeypair = await ensureLocalUserKeypair();
        if (!active) {
          return;
        }

        await syncPublicKey(localUserKeypair);
        if (!active) {
          return;
        }

        const resolved = await resolveConversationKey(conversationId, localUserKeypair.privateKey);
        if (!active) {
          return;
        }

        setConversationKey(resolved.key);
        setConversationKeyVersion(resolved.keyVersion);
        if (!resolved.key) {
          setStatusError('Conversation key not found yet. You can read metadata, but encrypted text cannot be decrypted on this device.');
        }
      } catch (error) {
        if (!active) {
          return;
        }

        setStatusError(
          error instanceof Error ? error.message : 'Unable to initialize encrypted chat.',
        );
      }
    }

    void bootstrapKeys();

    return () => {
      active = false;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationKey) {
      return;
    }
    const activeConversationKey: CryptoKey = conversationKey;

    let active = true;

    async function decryptVisibleMessages() {
      const updates: Record<string, string> = {};

      await Promise.all(
        messages.map(async (message) => {
          if (message.isDeleted) {
            updates[message.id] = '[message deleted]';
            return;
          }

          if (
            message.messageType !== 'text' ||
            !message.ciphertext ||
            !message.iv ||
            !message.algorithm
          ) {
            return;
          }

          try {
            const plaintext = await decryptMessageContent(
              {
                ciphertext: message.ciphertext,
                iv: message.iv,
                algorithm: message.algorithm,
              },
              activeConversationKey as CryptoKey,
            );
            updates[message.id] = plaintext;
          } catch {
            updates[message.id] = '[unable to decrypt on this device]';
          }
        }),
      );

      if (active) {
        setDecryptedText((previous) => ({
          ...previous,
          ...updates,
        }));
      }
    }

    void decryptVisibleMessages();

    return () => {
      active = false;
    };
  }, [conversationKey, messages]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      return;
    }

    void fetch(`/api/v1/chat/conversations/${conversationId}/read`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        lastReadMessageId: lastMessage.id,
      }),
    });
  }, [conversationId, messages]);

  const renderedMessages = useMemo(() => {
    return messages.map((message) => {
      const mine = message.senderId === currentUserId;
      const text =
        decryptedText[message.id] ??
        (message.messageType === 'text'
          ? '[encrypted message]'
          : message.isDeleted
            ? '[message deleted]'
            : `[${message.messageType}]`);

      return {
        ...message,
        mine,
        text,
      };
    });
  }, [messages, decryptedText, currentUserId]);

  async function loadOlderMessages() {
    if (!nextCursor || loadingOlder) {
      return;
    }

    setLoadingOlder(true);
    setStatusError(null);

    try {
      const response = await fetch(
        `/api/v1/chat/conversations/${conversationId}/messages?cursor=${encodeURIComponent(nextCursor)}&limit=40`,
      );
      const payload = (await response.json()) as ApiResponse<ChatMessageRecord[]>;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Unable to load older messages.');
      }

      setMessages((previous) => [...(payload.data ?? []), ...previous]);
      setNextCursor(payload.meta?.cursor ?? null);
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : 'Unable to load older messages.',
      );
    } finally {
      setLoadingOlder(false);
    }
  }

  async function sendMessage() {
    const plaintext = draft.trim();
    if (!plaintext || sending) {
      return;
    }

    if (!conversationKey) {
      setStatusError('No conversation key is available on this device for sending encrypted messages.');
      return;
    }

    setSending(true);
    setStatusError(null);

    try {
      const encryptedPayload = await encryptMessageContent(
        plaintext,
        conversationKey as CryptoKey,
        conversationKeyVersion,
      );

      const response = await fetch(`/api/v1/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...encryptedPayload,
          clientGeneratedId: generateClientGeneratedId(),
        }),
      });

      const payload = (await response.json()) as ApiResponse<ChatMessageRecord>;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to send message.');
      }

      setDraft('');
      setMessages((previous) => [...previous, payload.data as ChatMessageRecord]);
      setDecryptedText((previous) => ({
        ...previous,
        [payload.data!.id]: plaintext,
      }));
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Unable to send message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="surface-panel space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">
            Messages are decrypted on this device only. The server stores ciphertext and metadata.
          </p>
          {nextCursor ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void loadOlderMessages();
              }}
              loading={loadingOlder}
            >
              Load older
            </Button>
          ) : null}
        </div>
        {statusError ? <p className="text-sm text-danger">{statusError}</p> : null}
      </div>

      <section className="space-y-3">
        {renderedMessages.length === 0 ? (
          <div className="surface-panel p-4 text-sm text-text-secondary">
            No messages yet. Send the first encrypted message.
          </div>
        ) : null}

        {renderedMessages.map((message) => (
          <article
            key={message.id}
            className={cn(
              'max-w-[85%] rounded-2xl border px-4 py-3 shadow-sm',
              message.mine
                ? 'ml-auto border-accent/25 bg-accent/10'
                : 'border-border-subtle bg-bg-surface',
            )}
          >
            <p className="whitespace-pre-wrap text-sm leading-6 text-text-primary">{message.text}</p>
            <p className="mt-2 text-[11px] text-text-tertiary">{formatRelativeTime(message.createdAt)}</p>
          </article>
        ))}
      </section>

      <div className="surface-panel space-y-3 p-4">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write an encrypted message..."
          className="min-h-[110px]"
        />
        <div className="flex justify-end">
          <Button
            onClick={() => {
              void sendMessage();
            }}
            loading={sending}
            disabled={!draft.trim()}
          >
            Send encrypted
          </Button>
        </div>
      </div>
    </div>
  );
}
