/**
 * End-to-end encryption for post content.
 * Uses X25519 ECDH + AES-GCM. Only intended recipients (followers) can decrypt.
 */

import { x25519 } from '@noble/curves/ed25519';

const CONTENT_KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const RECIPIENT_KEY_PREFIX = 'r:'; // key id prefix for recipient entries

function b64enc(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf));
}

function b64dec(str: string): Uint8Array {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

/** Copy to ArrayBuffer for Web Crypto API (avoids BufferSource strict typing). */
function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u.length);
  copy.set(u);
  return copy.buffer;
}

/**
 * Generate a random X25519 keypair for encryption
 */
export function generateEncryptionKeyPair(): {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
} {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey: new Uint8Array(publicKey), privateKey: new Uint8Array(privateKey) };
}

/**
 * Derive shared secret with recipient's public key (ECDH)
 */
function getSharedSecret(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}

/**
 * Derive AES key from shared secret using HKDF-like approach (SHA-256)
 */
async function deriveAesKey(sharedSecret: Uint8Array, context: string): Promise<CryptoKey> {
  const material = new Uint8Array(sharedSecret.length + context.length);
  material.set(sharedSecret);
  material.set(new TextEncoder().encode(context), sharedSecret.length);
  const hash = await crypto.subtle.digest('SHA-256', toArrayBuffer(material));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt plaintext with AES-GCM
 */
async function aesGcmEncrypt(key: CryptoKey, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv), tagLength: TAG_BYTES * 8 },
    key,
    toArrayBuffer(plaintext)
  );
  return new Uint8Array(ciphertext);
}

/**
 * Decrypt ciphertext with AES-GCM
 */
async function aesGcmDecrypt(key: CryptoKey, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv), tagLength: TAG_BYTES * 8 },
    key,
    toArrayBuffer(ciphertext)
  );
  return new Uint8Array(plaintext);
}

export interface EncryptedPayload {
  /** AES-GCM ciphertext (iv + ciphertext + tag) for the post content */
  ciphertext: string;
  /** Ephemeral X25519 public key used for ECDH */
  ephemeralPublicKey: string;
  /** Map: recipientKeyId (base64 of recipient's encryption public key) -> encrypted content key (base64) */
  keys: Record<string, string>;
}

/**
 * Encrypt content for a set of recipients. Each recipient can decrypt with their private key.
 * Uses one ephemeral keypair; content key is encrypted once per recipient via ECDH.
 */
export async function encryptForRecipients(
  plaintext: string,
  recipientEncryptionPublicKeys: Uint8Array[]
): Promise<EncryptedPayload> {
  if (recipientEncryptionPublicKeys.length === 0) {
    throw new Error('At least one recipient required');
  }

  // Random content key and IV
  const contentKey = crypto.getRandomValues(new Uint8Array(CONTENT_KEY_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  // Use ephemeral keypair so we don't tie ciphertext to sender's long-term key
  const ephemeral = x25519.utils.randomPrivateKey();
  const ephemeralPublic = new Uint8Array(x25519.getPublicKey(ephemeral));

  // Encrypt content with content key
  const contentKeyCrypto = await crypto.subtle.importKey(
    'raw',
    contentKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const rawCiphertext = await aesGcmEncrypt(
    contentKeyCrypto,
    iv,
    new TextEncoder().encode(plaintext)
  );

  // Prepend IV to ciphertext (IV is public)
  const fullCiphertext = new Uint8Array(IV_BYTES + rawCiphertext.length);
  fullCiphertext.set(iv);
  fullCiphertext.set(rawCiphertext, IV_BYTES);

  const keys: Record<string, string> = {};

  for (const recipientPub of recipientEncryptionPublicKeys) {
    const sharedSecret = getSharedSecret(new Uint8Array(ephemeral), new Uint8Array(recipientPub));
    const derivedKey = await deriveAesKey(sharedSecret, 'phemossa-e2ee-content-key');
    const keyIv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const encryptedContentKey = await aesGcmEncrypt(derivedKey, keyIv, contentKey);
    const blob = new Uint8Array(IV_BYTES + encryptedContentKey.length);
    blob.set(keyIv);
    blob.set(encryptedContentKey, IV_BYTES);
    const recipientId = b64enc(recipientPub);
    keys[RECIPIENT_KEY_PREFIX + recipientId] = b64enc(blob);
  }

  return {
    ciphertext: b64enc(fullCiphertext),
    ephemeralPublicKey: b64enc(ephemeralPublic),
    keys,
  };
}

/**
 * Decrypt content if we are a recipient. Returns null if we can't decrypt.
 */
export async function decryptForMe(
  payload: EncryptedPayload,
  myEncryptionPrivateKey: Uint8Array
): Promise<string | null> {
  const myPublicKey = new Uint8Array(x25519.getPublicKey(myEncryptionPrivateKey));
  const myId = RECIPIENT_KEY_PREFIX + b64enc(myPublicKey);
  const encryptedKeyB64 = payload.keys[myId];
  if (!encryptedKeyB64) return null;

  const ephemeralPub = b64dec(payload.ephemeralPublicKey);
  const sharedSecret = getSharedSecret(new Uint8Array(myEncryptionPrivateKey), ephemeralPub);
  const derivedKey = await deriveAesKey(sharedSecret, 'phemossa-e2ee-content-key');

  const blob = b64dec(encryptedKeyB64);
  const keyIv = blob.subarray(0, IV_BYTES);
  const encryptedContentKey = blob.subarray(IV_BYTES);
  let contentKey: Uint8Array;
  try {
    contentKey = await aesGcmDecrypt(derivedKey, keyIv, encryptedContentKey);
  } catch {
    return null;
  }

  const contentKeyCrypto = await crypto.subtle.importKey(
    'raw',
    contentKey.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const fullCiphertext = b64dec(payload.ciphertext);
  const iv = fullCiphertext.subarray(0, IV_BYTES);
  const ciphertext = fullCiphertext.subarray(IV_BYTES);
  try {
    const plaintext = await aesGcmDecrypt(contentKeyCrypto, iv, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

/**
 * Check if a payload is E2EE (has ciphertext and keys shape)
 */
export function isEncryptedPayload(content: unknown): content is EncryptedPayload {
  if (!content || typeof content !== 'object') return false;
  const c = content as Record<string, unknown>;
  return (
    typeof c.ciphertext === 'string' &&
    typeof c.ephemeralPublicKey === 'string' &&
    typeof c.keys === 'object' &&
    c.keys !== null
  );
}
