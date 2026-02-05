import { Event, PostEvent } from './events';
import {
  getEventsByAuthor,
  getPostsByTopic,
} from './storage';
import { FollowSystem } from './follow';
import { publicKeyToString } from './identity';

/**
 * Feed Engine
 * 
 * Merge followed logs.
 * Sort locally.
 * Real-time update on new events.
 */

export interface FeedItem {
  event: PostEvent;
  author: string;
  timestamp: number;
}

export type FeedUpdateCallback = (items: FeedItem[]) => void;

export class FeedEngine {
  private followSystem: FollowSystem;
  private myPublicKey: Uint8Array;
  private feedItems: FeedItem[] = [];
  /** Topic feed (Reddit-like): when set, getFeedItems returns posts in this topic */
  private topicFilter: string | null = null;
  private topicFeedItems: FeedItem[] = [];
  private updateCallbacks: Set<FeedUpdateCallback> = new Set();
  private lastUpdateTime = 0;

  constructor(followSystem: FollowSystem, myPublicKey: Uint8Array) {
    this.followSystem = followSystem;
    this.myPublicKey = myPublicKey;
  }

  /**
   * Initialize feed by loading all followed users' posts
   */
  async initialize(): Promise<void> {
    await this.refresh();
  }

  /**
   * Refresh feed from storage
   */
  async refresh(): Promise<void> {
    const following = await this.followSystem.getFollowing();
    const myPublicKeyStr = publicKeyToString(this.myPublicKey);
    
    // Include our own posts
    const authors = new Set([myPublicKeyStr, ...following]);
    
    const allPosts: PostEvent[] = [];
    
    // Get posts from all followed authors
    for (const author of authors) {
      try {
        const events = await getEventsByAuthor(author);
        const posts = events.filter((e): e is PostEvent => e.type === 'post');
        allPosts.push(...posts);
      } catch (error) {
        console.error('Error loading posts for author:', author, error);
      }
    }
    
    // Convert to feed items
    this.feedItems = allPosts.map(event => ({
      event,
      author: event.author,
      timestamp: event.timestamp,
    }));
    
    // Sort by timestamp (newest first)
    this.feedItems.sort((a, b) => b.timestamp - a.timestamp);
    
    this.lastUpdateTime = Date.now();
    
    // Notify callbacks
    this.notifyCallbacks();
  }

  /**
   * Add a new event to the feed (if it's from a followed user, or matches topic filter)
   */
  async addEvent(event: Event): Promise<void> {
    if (event.type !== 'post') {
      return;
    }

    const post = event as PostEvent;
    const topic = (post.content.topic ?? 'general').trim().toLowerCase();
    const myPublicKeyStr = publicKeyToString(this.myPublicKey);
    const following = await this.followSystem.getFollowing();

    // Home feed: from us or someone we follow
    const forHome =
      event.author === myPublicKeyStr || following.includes(event.author);
    if (forHome && !this.feedItems.some((item) => item.event.id === event.id)) {
      this.feedItems.push({
        event: post,
        author: event.author,
        timestamp: event.timestamp,
      });
      this.feedItems.sort((a, b) => b.timestamp - a.timestamp);
    }

    // Topic feed: if this post's topic matches current filter, prepend
    if (
      this.topicFilter &&
      topic === this.topicFilter.trim().toLowerCase() &&
      !this.topicFeedItems.some((item) => item.event.id === event.id)
    ) {
      this.topicFeedItems.unshift({
        event: post,
        author: event.author,
        timestamp: event.timestamp,
      });
    }

    this.notifyCallbacks();
  }

  /**
   * Set topic filter (Reddit-like). When set, getFeedItems returns topic feed; when null, home feed.
   */
  setTopicFilter(topic: string | null): void {
    this.topicFilter = topic?.trim() || null;
    this.notifyCallbacks();
  }

  getTopicFilter(): string | null {
    return this.topicFilter;
  }

  /**
   * Refresh topic feed and notify subscribers
   */
  async refreshTopicFeed(topic: string): Promise<void> {
    const posts = await getPostsByTopic(topic);
    this.topicFeedItems = posts.map((event) => ({
      event,
      author: event.author,
      timestamp: event.timestamp,
    }));
    if (this.topicFilter === topic.trim()) {
      this.notifyCallbacks();
    }
  }

  /**
   * Get feed items (home feed or topic feed depending on topic filter)
   */
  getFeedItems(limit?: number): FeedItem[] {
    const items = this.topicFilter ? this.topicFeedItems : this.feedItems;
    if (limit) {
      return items.slice(0, limit);
    }
    return [...items];
  }

  /**
   * Get feed items since a timestamp
   */
  getFeedItemsSince(timestamp: number): FeedItem[] {
    return this.feedItems.filter(item => item.timestamp > timestamp);
  }

  /**
   * Subscribe to feed updates
   */
  subscribe(callback: FeedUpdateCallback): () => void {
    this.updateCallbacks.add(callback);
    
    // Immediately call with current feed
    callback(this.getFeedItems());
    
    // Return unsubscribe function
    return () => {
      this.updateCallbacks.delete(callback);
    };
  }

  /**
   * Notify all callbacks of feed updates
   */
  private notifyCallbacks(): void {
    const items = this.getFeedItems();
    for (const callback of this.updateCallbacks) {
      try {
        callback(items);
      } catch (error) {
        console.error('Error in feed update callback:', error);
      }
    }
  }

  /**
   * Get feed statistics
   */
  getStats(): {
    itemCount: number;
    lastUpdateTime: number;
    subscriberCount: number;
  } {
    return {
      itemCount: this.feedItems.length,
      lastUpdateTime: this.lastUpdateTime,
      subscriberCount: this.updateCallbacks.size,
    };
  }

  /**
   * Clear feed
   */
  clear(): void {
    this.feedItems = [];
    this.notifyCallbacks();
  }
}
