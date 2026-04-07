import type { ChatEncryptedMessagePayload } from '@/lib/chat/contracts';

const AES_ALGORITHM = 'AES-GCM';
const AES_KEY_LENGTH = 256;
const AES_IV_LENGTH = 12;
const RSA_ALGORITHM = 'RSA-OAEP';
const RSA_HASH = 'SHA-256';

function getCryptoApi() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable in this runtime.');
  }

  return globalThis.crypto;
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(base64Value: string) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64Value, 'base64'));
  }

  const binary = atob(base64Value);
  const output = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }

  return output;
}

export function generateClientGeneratedId() {
  const cryptoApi = getCryptoApi();

  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  const randomBytes = new Uint8Array(16);
  cryptoApi.getRandomValues(randomBytes);
  return bytesToBase64(randomBytes);
}

export async function generateConversationKey() {
  const cryptoApi = getCryptoApi();

  return cryptoApi.subtle.generateKey(
    {
      name: AES_ALGORITHM,
      length: AES_KEY_LENGTH,
    },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function exportConversationKeyRaw(conversationKey: CryptoKey) {
  const cryptoApi = getCryptoApi();
  const raw = await cryptoApi.subtle.exportKey('raw', conversationKey);
  return bytesToBase64(new Uint8Array(raw));
}

export async function importConversationKeyRaw(rawKeyBase64: string) {
  const cryptoApi = getCryptoApi();
  return cryptoApi.subtle.importKey(
    'raw',
    base64ToBytes(rawKeyBase64),
    {
      name: AES_ALGORITHM,
      length: AES_KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptMessageContent(
  plaintext: string,
  conversationKey: CryptoKey,
  keyVersion: number,
): Promise<ChatEncryptedMessagePayload> {
  const cryptoApi = getCryptoApi();
  const iv = cryptoApi.getRandomValues(new Uint8Array(AES_IV_LENGTH));
  const encodedText = new TextEncoder().encode(plaintext);
  const encrypted = await cryptoApi.subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv,
    },
    conversationKey,
    encodedText,
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
    algorithm: AES_ALGORITHM,
    keyVersion,
    payloadMeta: null,
  };
}

export async function decryptMessageContent(
  payload: Pick<ChatEncryptedMessagePayload, 'ciphertext' | 'iv' | 'algorithm'>,
  conversationKey: CryptoKey,
) {
  if (payload.algorithm !== AES_ALGORITHM) {
    throw new Error(`Unsupported message encryption algorithm: ${payload.algorithm}`);
  }

  const cryptoApi = getCryptoApi();
  const decrypted = await cryptoApi.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv: base64ToBytes(payload.iv),
    },
    conversationKey,
    base64ToBytes(payload.ciphertext),
  );

  return new TextDecoder().decode(decrypted);
}

export async function generateUserKeyPair() {
  const cryptoApi = getCryptoApi();
  const keyPair = await cryptoApi.subtle.generateKey(
    {
      name: RSA_ALGORITHM,
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: RSA_HASH,
    },
    true,
    ['encrypt', 'decrypt'],
  );

  const [publicKeyBytes, privateKeyBytes] = await Promise.all([
    cryptoApi.subtle.exportKey('spki', keyPair.publicKey),
    cryptoApi.subtle.exportKey('pkcs8', keyPair.privateKey),
  ]);

  return {
    algorithm: 'RSA-OAEP-256',
    keyVersion: 1,
    publicKey: bytesToBase64(new Uint8Array(publicKeyBytes)),
    privateKey: bytesToBase64(new Uint8Array(privateKeyBytes)),
  };
}

async function importUserPublicKey(publicKeyBase64: string) {
  const cryptoApi = getCryptoApi();
  return cryptoApi.subtle.importKey(
    'spki',
    base64ToBytes(publicKeyBase64),
    {
      name: RSA_ALGORITHM,
      hash: RSA_HASH,
    },
    false,
    ['encrypt', 'wrapKey'],
  );
}

async function importUserPrivateKey(privateKeyBase64: string) {
  const cryptoApi = getCryptoApi();
  return cryptoApi.subtle.importKey(
    'pkcs8',
    base64ToBytes(privateKeyBase64),
    {
      name: RSA_ALGORITHM,
      hash: RSA_HASH,
    },
    false,
    ['decrypt', 'unwrapKey'],
  );
}

export async function wrapConversationKeyForParticipant(
  conversationKey: CryptoKey,
  recipientPublicKeyBase64: string,
) {
  const cryptoApi = getCryptoApi();
  const recipientPublicKey = await importUserPublicKey(recipientPublicKeyBase64);
  const wrapped = await cryptoApi.subtle.wrapKey(
    'raw',
    conversationKey,
    recipientPublicKey,
    {
      name: RSA_ALGORITHM,
    },
  );

  return {
    encryptedConversationKey: bytesToBase64(new Uint8Array(wrapped)),
    keyEncryptionAlgorithm: 'RSA-OAEP-256',
  };
}

export async function unwrapConversationKeyForParticipant(
  encryptedConversationKeyBase64: string,
  privateKeyBase64: string,
) {
  const cryptoApi = getCryptoApi();
  const privateKey = await importUserPrivateKey(privateKeyBase64);

  return cryptoApi.subtle.unwrapKey(
    'raw',
    base64ToBytes(encryptedConversationKeyBase64),
    privateKey,
    {
      name: RSA_ALGORITHM,
    },
    {
      name: AES_ALGORITHM,
      length: AES_KEY_LENGTH,
    },
    // This key is cached locally for this device, so it must remain exportable.
    true,
    ['encrypt', 'decrypt'],
  );
}
