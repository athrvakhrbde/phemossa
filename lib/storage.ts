import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Event, FollowEvent, UnfollowEvent, PostEvent, ProfileEvent, DEFAULT_TOPIC } from './events';

/**
 * Storage Layer
 * 
 * IndexedDB schema for events, follows, and peers.
 * Indexes events by author and timestamp for efficient querying.
 */

export interface StorageDB extends DBSchema {
  events: {
    key: string; // event ID (hash)
    value: Event;
    indexes: {
      'by-author': string;
      'by-timestamp': number;
      'by-author-timestamp': [string, number];
    };
  };
  follows: {
    key: string; // follow ID (hash of follow event)
    value: FollowEvent | UnfollowEvent;
    indexes: {
      'by-follower': string; // who is following
      'by-followee': string; // who is being followed
      'by-timestamp': number;
    };
  };
  peers: {
    key: string; // peer ID
    value: {
      peerId: string;
      lastSeen: number;
      multiaddr?: string;
      metadata?: Record<string, any>;
    };
    indexes: {
      'by-last-seen': number;
    };
  };
  settings: {
    key: string;
    value: { key: string; value: unknown };
    indexes: {};
  };
  profiles: {
    key: string; // author (base64 public key)
    value: {
      author: string;
      displayName?: string;
      username?: string;
      bio?: string;
      updatedAt: number;
    };
    indexes: { 'by-updated': number };
  };
}

const DB_NAME = 'phemossa-storage';
const DB_VERSION = 3;

let dbInstance: IDBPDatabase<StorageDB> | null = null;

/**
 * Get or create database instance
 */
export async function getDB(): Promise<IDBPDatabase<StorageDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<StorageDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const eventsStore = db.createObjectStore('events', { keyPath: 'id' });
        eventsStore.createIndex('by-author', 'author');
        eventsStore.createIndex('by-timestamp', 'timestamp');
        eventsStore.createIndex('by-author-timestamp', ['author', 'timestamp']);
        const followsStore = db.createObjectStore('follows', { keyPath: 'id' });
        followsStore.createIndex('by-follower', 'author');
        followsStore.createIndex('by-followee', 'content.target');
        followsStore.createIndex('by-timestamp', 'timestamp');
        const peersStore = db.createObjectStore('peers', { keyPath: 'peerId' });
        peersStore.createIndex('by-last-seen', 'lastSeen');
      }
      if (oldVersion < 2) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (oldVersion < 3) {
        const profilesStore = db.createObjectStore('profiles', { keyPath: 'author' });
        profilesStore.createIndex('by-updated', 'updatedAt');
      }
    },
  });

  return dbInstance;
}

/**
 * Store an event (and update profiles when it's a profile event)
 */
export async function storeEvent(event: Event): Promise<void> {
  const db = await getDB();
  await db.put('events', event);
  if (event.type === 'profile') {
    const ev = event as ProfileEvent;
    await db.put('profiles', {
      author: ev.author,
      displayName: ev.content.displayName,
      username: ev.content.username,
      bio: ev.content.bio,
      updatedAt: ev.timestamp,
    });
  }
}

/**
 * Get profile for an author (from received profile events)
 */
export async function getProfile(author: string): Promise<{ displayName?: string; username?: string; bio?: string } | undefined> {
  const db = await getDB();
  const row = await db.get('profiles', author);
  if (!row) return undefined;
  return {
    displayName: row.displayName?.trim(),
    username: row.username?.trim(),
    bio: row.bio?.trim(),
  };
}

/**
 * Store multiple events in a transaction
 */
export async function storeEvents(events: Event[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('events', 'readwrite');
  const store = tx.objectStore('events');
  for (const event of events) {
    await store.put(event);
  }
  await tx.done;
}

/**
 * Get event by ID
 */
export async function getEvent(eventId: string): Promise<Event | undefined> {
  const db = await getDB();
  return await db.get('events', eventId);
}

/**
 * Check if event exists
 */
export async function hasEvent(eventId: string): Promise<boolean> {
  const db = await getDB();
  const count = await db.count('events', eventId);
  return count > 0;
}

/**
 * Get posts by topic (Reddit-like channel feed)
 */
export async function getPostsByTopic(
  topic: string,
  limit = 100
): Promise<PostEvent[]> {
  const all = await getEventsInRange();
  const normalized = topic.trim().toLowerCase() || DEFAULT_TOPIC;
  const posts = all.filter(
    (e): e is PostEvent =>
      e.type === 'post' &&
      ((e.content.topic ?? DEFAULT_TOPIC).trim().toLowerCase() === normalized)
  );
  posts.sort((a, b) => b.timestamp - a.timestamp);
  return posts.slice(0, limit);
}

/**
 * Get subscribed topics (Reddit-like)
 */
export async function getSubscribedTopics(): Promise<string[]> {
  const db = await getDB();
  const row = await db.get('settings', 'subscribedTopics');
  const v = row?.value;
  return Array.isArray(v) ? (v as string[]) : [DEFAULT_TOPIC, 'tech', 'memes', 'news'];
}

/**
 * Set subscribed topics
 */
export async function setSubscribedTopics(topics: string[]): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key: 'subscribedTopics', value: topics });
}

/**
 * Get all events by author
 */
export async function getEventsByAuthor(
  author: string,
  limit?: number
): Promise<Event[]> {
  const db = await getDB();
  const tx = db.transaction('events', 'readonly');
  const store = tx.objectStore('events');
  const index = store.index('by-author');
  let cursor = await index.openCursor(IDBKeyRange.only(author));
  const events: Event[] = [];
  while (cursor && (!limit || events.length < limit)) {
    events.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  events.sort((a, b) => b.timestamp - a.timestamp);
  return limit ? events.slice(0, limit) : events;
}

/**
 * Get events by author and timestamp range
 */
export async function getEventsByAuthorInRange(
  author: string,
  since?: number,
  until?: number
): Promise<Event[]> {
  const db = await getDB();
  const tx = db.transaction('events', 'readonly');
  const store = tx.objectStore('events');
  const index = store.index('by-author-timestamp');
  
  let range: IDBKeyRange;
  if (since !== undefined && until !== undefined) {
    range = IDBKeyRange.bound([author, since], [author, until]);
  } else if (since !== undefined) {
    range = IDBKeyRange.lowerBound([author, since]);
  } else if (until !== undefined) {
    range = IDBKeyRange.upperBound([author, until]);
  } else {
    range = IDBKeyRange.only(author);
  }
  
  const events: Event[] = [];
  let cursor = await index.openCursor(range);
  
  while (cursor) {
    events.push(cursor.value);
    cursor = await cursor.continue();
  }
  
  await tx.done;
  
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Get all events in timestamp range
 */
export async function getEventsInRange(
  since?: number,
  until?: number
): Promise<Event[]> {
  const db = await getDB();
  const tx = db.transaction('events', 'readonly');
  const store = tx.objectStore('events');
  const index = store.index('by-timestamp');
  
  let range: IDBKeyRange | undefined;
  if (since !== undefined && until !== undefined) {
    range = IDBKeyRange.bound(since, until);
  } else if (since !== undefined) {
    range = IDBKeyRange.lowerBound(since);
  } else if (until !== undefined) {
    range = IDBKeyRange.upperBound(until);
  }
  
  const events: Event[] = [];
  let cursor = range
    ? await index.openCursor(range)
    : await index.openCursor();
  
  while (cursor) {
    events.push(cursor.value);
    cursor = await cursor.continue();
  }
  
  await tx.done;
  
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Store a follow or unfollow event
 */
export async function storeFollow(follow: FollowEvent | UnfollowEvent): Promise<void> {
  const db = await getDB();
  await db.put('follows', follow);
}

/**
 * Get all follows by a specific author (includes unfollows)
 */
export async function getFollowsByAuthor(author: string): Promise<Array<FollowEvent | UnfollowEvent>> {
  const db = await getDB();
  const tx = db.transaction('follows', 'readonly');
  const store = tx.objectStore('follows');
  const index = store.index('by-follower');
  const follows: Array<FollowEvent | UnfollowEvent> = [];
  let cursor = await index.openCursor(IDBKeyRange.only(author));
  while (cursor) {
    follows.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return follows.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Get all followers of a specific author (includes unfollows)
 */
export async function getFollowersOf(author: string): Promise<Array<FollowEvent | UnfollowEvent>> {
  const db = await getDB();
  const tx = db.transaction('follows', 'readonly');
  const store = tx.objectStore('follows');
  const index = store.index('by-followee');
  const follows: Array<FollowEvent | UnfollowEvent> = [];
  let cursor = await index.openCursor(IDBKeyRange.only(author));
  while (cursor) {
    follows.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return follows.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Check if author A follows author B
 */
export async function isFollowing(follower: string, followee: string): Promise<boolean> {
  const db = await getDB();
  const tx = db.transaction('follows', 'readonly');
  const store = tx.objectStore('follows');
  const index = store.index('by-follower');
  let cursor = await index.openCursor(IDBKeyRange.only(follower));
  while (cursor) {
    if (cursor.value.content.target === followee) {
      await tx.done;
      return true;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return false;
}

/** Follower with optional E2EE key (from follow event content) */
export interface FollowerWithEncryption {
  author: string;
  encryptionPublicKey?: string;
}

/**
 * Get followers of an author who included encryption public keys (for E2EE posts)
 */
export async function getFollowersOfWithEncryptionKeys(authorPublicKeyBase64: string): Promise<FollowerWithEncryption[]> {
  const raw = await getFollowersOf(authorPublicKeyBase64);
  const byFollower = new Map<string, { encryptionPublicKey?: string }>();
  for (const ev of raw.sort((a, b) => a.timestamp - b.timestamp)) {
    if (ev.type === 'follow') {
      byFollower.set(ev.author, {
        encryptionPublicKey: ev.content.encryptionPublicKey,
      });
    } else {
      byFollower.delete(ev.author);
    }
  }
  return Array.from(byFollower.entries()).map(([author, v]) => ({
    author,
    encryptionPublicKey: v.encryptionPublicKey,
  }));
}

/**
 * Store peer information
 */
export async function storePeer(peer: {
  peerId: string;
  lastSeen: number;
  multiaddr?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const db = await getDB();
  await db.put('peers', peer);
}

/**
 * Get peer by ID
 */
export async function getPeer(peerId: string): Promise<{
  peerId: string;
  lastSeen: number;
  multiaddr?: string;
  metadata?: Record<string, any>;
} | undefined> {
  const db = await getDB();
  return await db.get('peers', peerId);
}

/**
 * Get all known peers
 */
export async function getAllPeers(): Promise<Array<{
  peerId: string;
  lastSeen: number;
  multiaddr?: string;
  metadata?: Record<string, any>;
}>> {
  const db = await getDB();
  return await db.getAll('peers');
}

/**
 * Update peer last seen timestamp
 */
export async function updatePeerLastSeen(peerId: string): Promise<void> {
  const db = await getDB();
  const peer = await db.get('peers', peerId);
  
  if (peer) {
    await db.put('peers', {
      ...peer,
      lastSeen: Date.now(),
    });
  }
}

/**
 * Get all known event IDs (for gossip sync)
 */
export async function getAllEventIds(): Promise<Set<string>> {
  const db = await getDB();
  const events = await db.getAll('events');
  return new Set(events.map(e => e.id));
}

/**
 * Get event IDs by author (for efficient gossip sync)
 */
export async function getEventIdsByAuthor(author: string): Promise<Set<string>> {
  const db = await getDB();
  const tx = db.transaction('events', 'readonly');
  const store = tx.objectStore('events');
  const index = store.index('by-author');
  const events: Event[] = [];
  let cursor = await index.openCursor(IDBKeyRange.only(author));
  while (cursor) {
    events.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return new Set(events.map(e => e.id));
}
