import { getOrCreateIdentity, getEncryptionKeyPair, getIdentityProfile, setIdentityProfile, isUsernameValid, KeyPair, publicKeyToString, stringToPublicKey } from './identity';
import { Network, NetworkConfig } from './network';
import { GossipProtocol } from './gossip';
import { FollowSystem } from './follow';
import { FeedEngine } from './feed';
import { createPostEvent, createProfileEvent, Event } from './events';
import { storeEvent, getFollowersOfWithEncryptionKeys, getProfile as getStorageProfile } from './storage';
import { encryptForRecipients, decryptForMe, isEncryptedPayload } from './e2ee';
import type { PeerId } from '@libp2p/interface';
import { createFromPrivKey } from '@libp2p/peer-id-factory';

/** Short label for an author (first 8 chars of base64). */
function shortId(authorBase64: string): string {
  if (!authorBase64) return '…';
  const s = authorBase64.replace(/=+$/, '');
  return s.length > 8 ? `${s.slice(0, 8)}…` : s;
}

/**
 * Main System Orchestrator
 * 
 * Coordinates all modules:
 * - Identity
 * - Network
 * - Gossip
 * - Follow System
 * - Feed Engine
 */

export class PhemossaSystem {
  private identity: KeyPair | null = null;
  private network: Network | null = null;
  private gossip: GossipProtocol | null = null;
  private followSystem: FollowSystem | null = null;
  private feedEngine: FeedEngine | null = null;
  private isInitialized = false;

  /**
   * Initialize the system
   */
  async initialize(config?: {
    bootstrapMultiaddrs?: string[];
    onPeerConnect?: (peerId: PeerId) => void;
    onPeerDisconnect?: (peerId: PeerId) => void;
  }): Promise<void> {
    if (this.isInitialized) {
      throw new Error('System already initialized');
    }

    // 1. Initialize identity
    console.log('Initializing identity...');
    this.identity = await getOrCreateIdentity();
    const publicKeyStr = btoa(String.fromCharCode(...this.identity.publicKey));
    console.log('Identity initialized. Public key:', publicKeyStr.substring(0, 20) + '...');

    // 2. Create libp2p peer ID from private key
    // For now, let libp2p generate a peer ID
    // In production, you'd want to derive this from the ed25519 keypair
    // and persist it for consistency
    let peerId: PeerId | undefined = undefined;

    // 3. Initialize network
    console.log('Initializing network...');
    const networkConfig: NetworkConfig = {
      peerId,
      bootstrapMultiaddrs: config?.bootstrapMultiaddrs,
      onPeerConnect: config?.onPeerConnect,
      onPeerDisconnect: config?.onPeerDisconnect,
    };
    
    this.network = new Network(networkConfig);
    await this.network.start();
    console.log('Network initialized. Peer ID:', this.network.getPeerIdString());

    // 4. Initialize gossip protocol
    console.log('Initializing gossip protocol...');
    this.gossip = new GossipProtocol(this.network);
    await this.gossip.start();
    console.log('Gossip protocol initialized');

    // 5. Initialize follow system
    console.log('Initializing follow system...');
    this.followSystem = new FollowSystem(this.gossip, this.identity.publicKey);
    console.log('Follow system initialized');

    // 6. Initialize feed engine
    console.log('Initializing feed engine...');
    this.feedEngine = new FeedEngine(this.followSystem, this.identity.publicKey);
    await this.feedEngine.initialize();
    console.log('Feed engine initialized');

    // Set up event handler for new events
    // When gossip receives a new event, add it to feed
    // This is a simplified approach - in production you'd use proper event emitters
    const originalBroadcast = this.gossip.broadcastEvent.bind(this.gossip);
    this.gossip.broadcastEvent = async (event: Event) => {
      await originalBroadcast(event);
      if (this.feedEngine && event.type === 'post') {
        await this.feedEngine.addEvent(event);
      }
    };

    this.isInitialized = true;
    console.log('System fully initialized');
  }

  /**
   * Stop the system
   */
  async stop(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    if (this.network) {
      await this.network.stop();
    }

    this.isInitialized = false;
  }

  /**
   * Get identity
   */
  getIdentity(): KeyPair {
    if (!this.identity) {
      throw new Error('System not initialized');
    }
    return this.identity;
  }

  /**
   * Get our public key as base64 (for getDisplayName(self))
   */
  getMyPublicKeyBase64(): string {
    return publicKeyToString(this.getIdentity().publicKey);
  }

  /**
   * Get network
   */
  getNetwork(): Network {
    if (!this.network) {
      throw new Error('System not initialized');
    }
    return this.network;
  }

  /**
   * Get gossip protocol
   */
  getGossip(): GossipProtocol {
    if (!this.gossip) {
      throw new Error('System not initialized');
    }
    return this.gossip;
  }

  /**
   * Get follow system
   */
  getFollowSystem(): FollowSystem {
    if (!this.followSystem) {
      throw new Error('System not initialized');
    }
    return this.followSystem;
  }

  /**
   * Get feed engine
   */
  getFeedEngine(): FeedEngine {
    if (!this.feedEngine) {
      throw new Error('System not initialized');
    }
    return this.feedEngine;
  }

  /**
   * Create and publish a post (E2EE for followers with encryption keys, else plaintext).
   * Optional topic (Reddit-like channel): general, tech, memes, news, etc.
   */
  async createPost(
    text: string,
    opts?: { topic?: string; mentions?: string[]; replyTo?: string }
  ): Promise<Event> {
    if (!this.identity || !this.gossip) {
      throw new Error('System not initialized');
    }

    const topic = opts?.topic?.trim();
    const mentions = opts?.mentions;
    const replyTo = opts?.replyTo;

    const myAuthorId = publicKeyToString(this.identity.publicKey);
    const followersWithKeys = await getFollowersOfWithEncryptionKeys(myAuthorId);
    const recipientsWithKeys = followersWithKeys.filter((f) => f.encryptionPublicKey);

    let postEvent: Event;
    if (recipientsWithKeys.length > 0) {
      const enc = await getEncryptionKeyPair();
      const recipientEncryptionPublicKeys = [
        enc.publicKey, // so we can decrypt our own post
        ...recipientsWithKeys.map((f) => stringToPublicKey(f.encryptionPublicKey!)),
      ];
      const encryptedPayload = await encryptForRecipients(text, recipientEncryptionPublicKeys);
      postEvent = await createPostEvent(
        '', // not used when encrypted
        this.identity.publicKey,
        this.identity.privateKey,
        mentions,
        replyTo,
        encryptedPayload,
        topic
      );
    } else {
      postEvent = await createPostEvent(
        text,
        this.identity.publicKey,
        this.identity.privateKey,
        mentions,
        replyTo,
        undefined,
        topic
      );
    }

    await storeEvent(postEvent);
    await this.gossip.broadcastEvent(postEvent);
    if (this.feedEngine) {
      await this.feedEngine.addEvent(postEvent);
    }

    return postEvent;
  }

  /**
   * Follow a user (includes our encryption key so they can E2EE posts to us)
   */
  async follow(targetPublicKey: Uint8Array): Promise<void> {
    if (!this.identity || !this.followSystem) {
      throw new Error('System not initialized');
    }
    let encryptionPublicKeyBase64: string | undefined;
    try {
      const enc = await getEncryptionKeyPair();
      encryptionPublicKeyBase64 = publicKeyToString(enc.publicKey);
    } catch {
      // no encryption key yet (legacy identity)
    }
    await this.followSystem.follow(
      targetPublicKey,
      this.identity.privateKey,
      encryptionPublicKeyBase64
    );
    if (this.feedEngine) {
      await this.feedEngine.refresh();
    }
  }

  /**
   * Unfollow a user
   */
  async unfollow(targetPublicKey: Uint8Array): Promise<void> {
    if (!this.identity || !this.followSystem) {
      throw new Error('System not initialized');
    }

    await this.followSystem.unfollow(targetPublicKey, this.identity.privateKey);
    
    // Refresh feed to remove unfollowed user's posts
    if (this.feedEngine) {
      await this.feedEngine.refresh();
    }
  }

  /**
   * Connect to a peer by multiaddr
   */
  async connectToPeer(multiaddr: string): Promise<void> {
    if (!this.network) {
      throw new Error('System not initialized');
    }

    await this.network.connectToPeer(multiaddr);
  }

  /** Result of resolving post content (plain, decrypted E2EE, or encrypted/failed) */
  async getDecryptedPostResult(postEvent: Event): Promise<{ text: string; status: 'plain' | 'decrypted' | 'encrypted' | 'failed' }> {
    if (postEvent.type !== 'post') return { text: '', status: 'plain' };
    const content = postEvent.content as { text?: string; encrypted?: import('./e2ee').EncryptedPayload };
    if (content.text != null) return { text: content.text, status: 'plain' };
    if (!isEncryptedPayload(content.encrypted)) return { text: '[Invalid]', status: 'failed' };
    try {
      const enc = await getEncryptionKeyPair();
      const decrypted = await decryptForMe(content.encrypted!, enc.privateKey);
      if (decrypted != null) return { text: decrypted, status: 'decrypted' };
      return { text: 'Only recipients can read this.', status: 'encrypted' };
    } catch {
      return { text: 'Only recipients can read this.', status: 'failed' };
    }
  }

  /**
   * Resolve display text for a post (decrypt if E2EE and we're a recipient).
   * For encryption badges use getDecryptedPostResult() instead.
   */
  async getDecryptedPostText(postEvent: Event): Promise<string> {
    const { text } = await this.getDecryptedPostResult(postEvent);
    return text;
  }

  /**
   * Get profile for an author (display name, @username, bio). Self = from identity; others = from stored profile events.
   */
  async getProfile(authorPublicKeyBase64: string): Promise<{ displayName?: string; username?: string; bio?: string }> {
    const me = this.identity ? publicKeyToString(this.identity.publicKey) : '';
    if (authorPublicKeyBase64 === me) {
      const p = await getIdentityProfile();
      return {
        displayName: p.displayName ?? undefined,
        username: p.username ?? undefined,
        bio: p.bio ?? undefined,
      };
    }
    const stored = await getStorageProfile(authorPublicKeyBase64);
    return stored ?? {};
  }

  /**
   * Get display name for an author (for feed/post cards).
   */
  async getDisplayName(authorPublicKeyBase64: string): Promise<string> {
    const p = await this.getProfile(authorPublicKeyBase64);
    if (p.displayName?.trim()) return p.displayName.trim();
    const me = this.identity ? publicKeyToString(this.identity.publicKey) : '';
    if (authorPublicKeyBase64 === me) return 'You';
    return shortId(authorPublicKeyBase64);
  }

  /**
   * Get @username for an author (e.g. @alice).
   */
  async getUsername(authorPublicKeyBase64: string): Promise<string> {
    const p = await this.getProfile(authorPublicKeyBase64);
    if (p.username?.trim()) return `@${p.username.trim()}`;
    return shortId(authorPublicKeyBase64);
  }

  /**
   * Set our profile (display name, username, bio) and broadcast a profile event so others see it.
   */
  async setProfile(profile: { displayName?: string; username?: string; bio?: string }): Promise<void> {
    if (!this.identity || !this.gossip) throw new Error('System not initialized');
    const username = profile.username?.trim();
    if (username !== undefined && username !== '' && !isUsernameValid(username)) {
      throw new Error('Username must be 3–30 characters, letters, numbers, and underscores only');
    }
    await setIdentityProfile({
      displayName: profile.displayName ?? undefined,
      username: profile.username ?? undefined,
      bio: profile.bio ?? undefined,
    });
    const profileEvent = await createProfileEvent(
      this.identity.publicKey,
      this.identity.privateKey,
      {
        displayName: profile.displayName?.trim().slice(0, 32),
        username: profile.username?.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30),
        bio: profile.bio?.trim().slice(0, 160),
      }
    );
    await storeEvent(profileEvent);
    await this.gossip.broadcastEvent(profileEvent);
  }

  /**
   * Check if system is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
