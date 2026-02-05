import { signMessage, verifySignature, publicKeyToString } from './identity';

/**
 * Event Model
 * 
 * Append-only signed events with hash-based IDs.
 * Strong typing for different event types.
 * Deduplication logic.
 */

export type EventType = 'post' | 'follow' | 'unfollow' | 'profile';

export interface BaseEvent {
  id: string; // hash of event content
  type: EventType;
  author: string; // base64 public key
  timestamp: number;
  signature: string; // base64 signature
  content: Record<string, any>;
}

/** E2EE payload: only recipients can decrypt */
export interface EncryptedPostContent {
  ciphertext: string;
  ephemeralPublicKey: string;
  keys: Record<string, string>;
}

/** Default topic when not set (Reddit-like channel) */
export const DEFAULT_TOPIC = 'general';

/** Built-in topics (Reddit-like channels) */
export const BUILTIN_TOPICS = ['general', 'tech', 'memes', 'news'] as const;

export interface PostEvent extends BaseEvent {
  type: 'post';
  content: {
    /** Reddit-like channel/topic (e.g. general, tech, memes) */
    topic?: string;
    /** Plaintext (if not E2EE) */
    text?: string;
    mentions?: string[];
    replyTo?: string;
    /** E2EE payload (if encrypted); recipients decrypt with their key */
    encrypted?: EncryptedPostContent;
  };
}

export interface FollowEvent extends BaseEvent {
  type: 'follow';
  content: {
    target: string; // base64 public key of followed user
    /** Base64 X25519 public key for E2EE; included so target can encrypt posts to this follower */
    encryptionPublicKey?: string;
  };
}

export interface UnfollowEvent extends BaseEvent {
  type: 'unfollow';
  content: {
    target: string;
  };
}

/** Profile update: display name, @username, bio — broadcast so others can show it */
export interface ProfileEvent extends BaseEvent {
  type: 'profile';
  content: {
    displayName?: string;
    username?: string;
    bio?: string;
  };
}

export type Event = PostEvent | FollowEvent | UnfollowEvent | ProfileEvent;


/**
 * Create event ID synchronously (for compatibility)
 * Uses a simple hash function
 */
export function createEventIdSync(event: Omit<BaseEvent, 'id' | 'signature'>): string {
  const canonical = JSON.stringify({
    type: event.type,
    author: event.author,
    timestamp: event.timestamp,
    content: event.content,
  });
  
  // Simple hash function (not cryptographically secure, but deterministic)
  let hash = 0;
  for (let i = 0; i < canonical.length; i++) {
    const char = canonical.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to hex string
  return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Better hash using Web Crypto API (async)
 */
export async function createEventIdAsync(event: Omit<BaseEvent, 'id' | 'signature'>): Promise<string> {
  const canonical = JSON.stringify({
    type: event.type,
    author: event.author,
    timestamp: event.timestamp,
    content: event.content,
  });
  
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a post event (plaintext or E2EE)
 */
export async function createPostEvent(
  text: string,
  authorPublicKey: Uint8Array,
  authorPrivateKey: Uint8Array,
  mentions?: string[],
  replyTo?: string,
  /** When set, content is E2EE for these recipients; content.encrypted is set, content.text omitted */
  encryptedPayload?: import('./e2ee').EncryptedPayload,
  /** Reddit-like topic/channel (default: general) */
  topic?: string
): Promise<PostEvent> {
  const author = publicKeyToString(authorPublicKey);
  const timestamp = Date.now();
  const topicVal = topic?.trim() || DEFAULT_TOPIC;
  const content: PostEvent['content'] = encryptedPayload
    ? { topic: topicVal, encrypted: encryptedPayload }
    : { topic: topicVal, text, ...(mentions && { mentions }), ...(replyTo && { replyTo }) };
  const eventData: Omit<PostEvent, 'id' | 'signature'> = {
    type: 'post',
    author,
    timestamp,
    content,
  };
  const id = await createEventIdAsync(eventData);
  const message = new TextEncoder().encode(id + JSON.stringify(eventData.content));
  const signature = await signMessage(message, authorPrivateKey);
  const signatureStr = btoa(String.fromCharCode(...signature));
  return { ...eventData, id, signature: signatureStr };
}

/**
 * Create a follow event (optionally include encryption public key for E2EE)
 */
export async function createFollowEvent(
  targetPublicKey: Uint8Array,
  authorPublicKey: Uint8Array,
  authorPrivateKey: Uint8Array,
  /** X25519 public key so the target can encrypt posts to this follower */
  encryptionPublicKeyBase64?: string
): Promise<FollowEvent> {
  const author = publicKeyToString(authorPublicKey);
  const target = publicKeyToString(targetPublicKey);
  const timestamp = Date.now();
  const eventData: Omit<FollowEvent, 'id' | 'signature'> = {
    type: 'follow',
    author,
    timestamp,
    content: {
      target,
      ...(encryptionPublicKeyBase64 && { encryptionPublicKey: encryptionPublicKeyBase64 }),
    },
  };
  const id = await createEventIdAsync(eventData);
  const message = new TextEncoder().encode(id + JSON.stringify(eventData.content));
  const signature = await signMessage(message, authorPrivateKey);
  const signatureStr = btoa(String.fromCharCode(...signature));
  return { ...eventData, id, signature: signatureStr };
}

/**
 * Create a profile event (display name, username, bio)
 */
export async function createProfileEvent(
  authorPublicKey: Uint8Array,
  authorPrivateKey: Uint8Array,
  content: ProfileEvent['content']
): Promise<ProfileEvent> {
  const author = publicKeyToString(authorPublicKey);
  const timestamp = Date.now();
  const clean = {
    displayName: content.displayName?.trim().slice(0, 32),
    username: content.username?.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30),
    bio: content.bio?.trim().slice(0, 160),
  };
  const eventData: Omit<ProfileEvent, 'id' | 'signature'> = {
    type: 'profile',
    author,
    timestamp,
    content: clean,
  };
  const id = await createEventIdAsync(eventData);
  const message = new TextEncoder().encode(id + JSON.stringify(eventData.content));
  const signature = await signMessage(message, authorPrivateKey);
  const signatureStr = btoa(String.fromCharCode(...signature));
  return { ...eventData, id, signature: signatureStr };
}

/**
 * Create an unfollow event
 */
export async function createUnfollowEvent(
  targetPublicKey: Uint8Array,
  authorPublicKey: Uint8Array,
  authorPrivateKey: Uint8Array
): Promise<UnfollowEvent> {
  const author = publicKeyToString(authorPublicKey);
  const target = publicKeyToString(targetPublicKey);
  const timestamp = Date.now();
  
  const eventData: Omit<UnfollowEvent, 'id' | 'signature'> = {
    type: 'unfollow',
    author,
    timestamp,
    content: {
      target,
    },
  };
  
  const id = await createEventIdAsync(eventData);
  
  // Sign the event
  const message = new TextEncoder().encode(id + JSON.stringify(eventData.content));
  const signature = await signMessage(message, authorPrivateKey);
  const signatureStr = btoa(String.fromCharCode(...signature));
  
  return {
    ...eventData,
    id,
    signature: signatureStr,
  };
}

/**
 * Verify an event's signature
 */
export async function verifyEvent(event: Event): Promise<boolean> {
  // Reconstruct the message that was signed
  const eventData: Omit<Event, 'id' | 'signature'> = {
    type: event.type,
    author: event.author,
    timestamp: event.timestamp,
    content: event.content,
  };
  
  // Verify the ID matches
  const expectedId = await createEventIdAsync(eventData);
  if (expectedId !== event.id) {
    return false;
  }
  
  // Verify the signature
  const message = new TextEncoder().encode(event.id + JSON.stringify(event.content));
  const signature = Uint8Array.from(atob(event.signature), c => c.charCodeAt(0));
  const publicKey = Uint8Array.from(atob(event.author), c => c.charCodeAt(0));
  
  const { verifySignature } = await import('./identity');
  return await verifySignature(message, signature, publicKey);
}

/**
 * Check if event is valid (signature and structure)
 */
export async function isValidEvent(event: Event): Promise<boolean> {
  // Basic structure validation
  if (!event.id || !event.type || !event.author || !event.signature) {
    return false;
  }
  
  if (!['post', 'follow', 'unfollow'].includes(event.type)) {
    return false;
  }
  
  // Verify signature
  return await verifyEvent(event);
}
