import * as ed25519 from '@noble/ed25519';
import { openDB, DBSchema } from 'idb';
import { generateEncryptionKeyPair } from './e2ee';

/**
 * Identity Module
 * 
 * Generates and manages ed25519 keypairs (signing) and X25519 (E2EE).
 * Persists keys in IndexedDB.
 */

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface EncryptionKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface IdentityDB extends DBSchema {
  identity: {
    key: string;
    value: {
      publicKey: Uint8Array;
      privateKey: Uint8Array;
      encryptionPublicKey?: Uint8Array;
      encryptionPrivateKey?: Uint8Array;
      /** Display name (e.g. "Alice") */
      displayName?: string;
      /** Handle / username (e.g. "alice" → shown as @alice), 3–30 chars, a-z0-9_ */
      username?: string;
      /** Bio (e.g. "P2P enthusiast"), max 160 */
      bio?: string;
      createdAt: number;
    };
    indexes: { 'by-created': number };
  };
}

export interface ProfileData {
  displayName?: string | null;
  username?: string | null;
  bio?: string | null;
}

/** Normalize username: lowercase, only a-z 0-9 _, 3–30 chars */
export function normalizeUsername(input: string): string {
  const s = input.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  return s.slice(0, 30);
}

export function isUsernameValid(username: string): boolean {
  const n = normalizeUsername(username);
  return n.length >= 3 && n.length <= 30;
}

const DB_NAME = 'phemossa-identity';
const DB_VERSION = 3;
const IDENTITY_KEY = 'main';

/**
 * Generate a new ed25519 keypair
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKey(privateKey);
  return {
    publicKey,
    privateKey,
  };
}

/**
 * Get or create identity from IndexedDB
 */
export async function getOrCreateIdentity(): Promise<KeyPair> {
  const db = await openDB<IdentityDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const store = db.createObjectStore('identity', { keyPath: 'key' });
        store.createIndex('by-created', 'createdAt');
      }
      // v2: encryption keys added to existing store (no schema change)
      // v3: displayName added (no schema change)
    },
  });

  try {
    const stored = await db.get('identity', IDENTITY_KEY);
    if (stored) {
      // Ensure encryption keypair exists (v2 migration)
      let encryptionPublicKey = stored.encryptionPublicKey;
      let encryptionPrivateKey = stored.encryptionPrivateKey;
      if (!encryptionPublicKey || !encryptionPrivateKey) {
        const enc = generateEncryptionKeyPair();
        encryptionPublicKey = enc.publicKey;
        encryptionPrivateKey = enc.privateKey;
        await db.put('identity', { ...stored, encryptionPublicKey, encryptionPrivateKey });
      }
      return {
        publicKey: stored.publicKey,
        privateKey: stored.privateKey,
      };
    }
  } catch (error) {
    // No identity exists yet
  }

  // Generate new identity
  const keyPair = await generateKeyPair();
  const encKey = generateEncryptionKeyPair();
  const identityData = {
    key: IDENTITY_KEY,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    encryptionPublicKey: encKey.publicKey,
    encryptionPrivateKey: encKey.privateKey,
    createdAt: Date.now(),
  };
  await db.put('identity', identityData);

  await db.close();
  
  return keyPair;
}

/**
 * Get existing identity (throws if not found)
 */
export async function getIdentity(): Promise<KeyPair> {
  const db = await openDB<IdentityDB>(DB_NAME, DB_VERSION);
  const stored = await db.get('identity', IDENTITY_KEY);
  await db.close();
  if (!stored) throw new Error('No identity found. Call getOrCreateIdentity() first.');
  return { publicKey: stored.publicKey, privateKey: stored.privateKey };
}

/**
 * Get full profile for current identity
 */
export async function getIdentityProfile(): Promise<ProfileData> {
  const db = await openDB<IdentityDB>(DB_NAME, DB_VERSION);
  const stored = await db.get('identity', IDENTITY_KEY);
  await db.close();
  if (!stored) return {};
  return {
    displayName: stored.displayName?.trim() ?? null,
    username: stored.username?.trim() ?? null,
    bio: stored.bio?.trim() ?? null,
  };
}

/**
 * Set profile for current identity (displayName, username, bio)
 */
export async function setIdentityProfile(profile: ProfileData): Promise<void> {
  const db = await openDB<IdentityDB>(DB_NAME, DB_VERSION);
  const stored = await db.get('identity', IDENTITY_KEY);
  if (!stored) {
    await db.close();
    throw new Error('No identity found.');
  }
  const displayName = profile.displayName?.trim().slice(0, 32) || undefined;
  const username = profile.username != null ? normalizeUsername(profile.username) || undefined : stored.username;
  const bio = profile.bio?.trim().slice(0, 160) || undefined;
  await db.put('identity', { ...stored, displayName, username, bio });
  await db.close();
}

/** @deprecated Use getIdentityProfile */
export async function getDisplayName(): Promise<string | null> {
  const p = await getIdentityProfile();
  return p.displayName ?? null;
}

/** @deprecated Use setIdentityProfile */
export async function setDisplayName(displayName: string): Promise<void> {
  await setIdentityProfile({ displayName });
}

/**
 * Get encryption keypair (X25519) for E2EE. Call getOrCreateIdentity first.
 */
export async function getEncryptionKeyPair(): Promise<EncryptionKeyPair> {
  const db = await openDB<IdentityDB>(DB_NAME, DB_VERSION);
  const stored = await db.get('identity', IDENTITY_KEY);
  await db.close();
  if (!stored) throw new Error('No identity found.');
  if (!stored.encryptionPublicKey || !stored.encryptionPrivateKey) {
    throw new Error('Encryption keys not found. Call getOrCreateIdentity() to migrate.');
  }
  return {
    publicKey: stored.encryptionPublicKey,
    privateKey: stored.encryptionPrivateKey,
  };
}

/**
 * Sign a message with the private key
 */
export async function signMessage(
  message: Uint8Array,
  privateKey: Uint8Array
): Promise<Uint8Array> {
  return ed25519.sign(message, privateKey);
}

/**
 * Verify a signature
 */
export async function verifySignature(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): Promise<boolean> {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

/**
 * Convert public key to base64 string for display
 */
export function publicKeyToString(publicKey: Uint8Array): string {
  return btoa(String.fromCharCode(...publicKey));
}

/**
 * Convert base64 string to public key
 */
export function stringToPublicKey(str: string): Uint8Array {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

/**
 * Get peer ID from public key (simple hash-based approach)
 * In a real system, you'd use libp2p's peer ID format
 */
export function getPeerIdFromPublicKey(publicKey: Uint8Array): string {
  // For now, use base64 of public key as peer ID
  // In production, this should be a proper libp2p peer ID
  return publicKeyToString(publicKey);
}
