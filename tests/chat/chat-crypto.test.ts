import { describe, expect, it } from 'vitest';
import {
  decryptMessageContent,
  encryptMessageContent,
  exportConversationKeyRaw,
  generateClientGeneratedId,
  generateConversationKey,
  generateUserKeyPair,
  importConversationKeyRaw,
  unwrapConversationKeyForParticipant,
  wrapConversationKeyForParticipant,
} from '@/lib/chat/crypto';

describe('chat crypto primitives', () => {
  it('encrypts and decrypts message content using a conversation key', async () => {
    const conversationKey = await generateConversationKey();
    const plaintext = 'Credvia encrypted hello';

    const payload = await encryptMessageContent(plaintext, conversationKey, 1);
    const decrypted = await decryptMessageContent(payload, conversationKey);

    expect(decrypted).toBe(plaintext);
    expect(payload.ciphertext.length).toBeGreaterThan(0);
    expect(payload.iv.length).toBeGreaterThan(0);
    expect(payload.algorithm).toBe('AES-GCM');
    expect(payload.keyVersion).toBe(1);
  });

  it('wraps and unwraps a conversation key for a participant', async () => {
    const conversationKey = await generateConversationKey();
    const userKeypair = await generateUserKeyPair();
    const plaintext = 'Wrapped key decrypt check';

    const wrapped = await wrapConversationKeyForParticipant(
      conversationKey,
      userKeypair.publicKey,
    );
    const unwrappedKey = await unwrapConversationKeyForParticipant(
      wrapped.encryptedConversationKey,
      userKeypair.privateKey,
    );

    const encrypted = await encryptMessageContent(plaintext, unwrappedKey, 1);
    const decrypted = await decryptMessageContent(encrypted, unwrappedKey);

    expect(decrypted).toBe(plaintext);
    expect(wrapped.keyEncryptionAlgorithm).toBe('RSA-OAEP-256');
  });

  it('allows exporting unwrapped conversation keys for local cache', async () => {
    const conversationKey = await generateConversationKey();
    const userKeypair = await generateUserKeyPair();

    const wrapped = await wrapConversationKeyForParticipant(
      conversationKey,
      userKeypair.publicKey,
    );

    const unwrappedKey = await unwrapConversationKeyForParticipant(
      wrapped.encryptedConversationKey,
      userKeypair.privateKey,
    );

    const exported = await exportConversationKeyRaw(unwrappedKey);

    expect(exported.length).toBeGreaterThan(0);
  });

  it('imports a raw conversation key and preserves decryption ability', async () => {
    const conversationKey = await generateConversationKey();
    const encrypted = await encryptMessageContent('Portable key', conversationKey, 1);

    const exportedRaw = await crypto.subtle.exportKey('raw', conversationKey);
    const base64 = Buffer.from(new Uint8Array(exportedRaw)).toString('base64');
    const importedKey = await importConversationKeyRaw(base64);
    const decrypted = await decryptMessageContent(encrypted, importedKey);

    expect(decrypted).toBe('Portable key');
  });

  it('creates unique client-generated ids', () => {
    const first = generateClientGeneratedId();
    const second = generateClientGeneratedId();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThan(8);
    expect(second.length).toBeGreaterThan(8);
  });
});
