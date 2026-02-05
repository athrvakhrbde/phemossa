import { 
  createFollowEvent, 
  createUnfollowEvent, 
  FollowEvent, 
  UnfollowEvent 
} from './events';
import { 
  storeFollow, 
  getFollowsByAuthor, 
  getFollowersOf, 
  isFollowing 
} from './storage';
import { GossipProtocol } from './gossip';
import { publicKeyToString, stringToPublicKey } from './identity';

/**
 * Follow System
 * 
 * Follow stored as signed event.
 * Feed filters by follow graph.
 */

export class FollowSystem {
  private gossip: GossipProtocol;
  private myPublicKey: Uint8Array;

  constructor(gossip: GossipProtocol, myPublicKey: Uint8Array) {
    this.gossip = gossip;
    this.myPublicKey = myPublicKey;
  }

  /**
   * Follow a user (include encryption public key so they can E2EE posts to you)
   */
  async follow(
    targetPublicKey: Uint8Array,
    myPrivateKey: Uint8Array,
    encryptionPublicKeyBase64?: string
  ): Promise<FollowEvent> {
    const followEvent = await createFollowEvent(
      targetPublicKey,
      this.myPublicKey,
      myPrivateKey,
      encryptionPublicKeyBase64
    );

    // Store locally
    await storeFollow(followEvent);

    // Broadcast via gossip
    await this.gossip.broadcastEvent(followEvent);

    return followEvent;
  }

  /**
   * Unfollow a user
   */
  async unfollow(targetPublicKey: Uint8Array, myPrivateKey: Uint8Array): Promise<UnfollowEvent> {
    const unfollowEvent = await createUnfollowEvent(
      targetPublicKey,
      this.myPublicKey,
      myPrivateKey
    );

    // Store locally (we'll need to handle this in storage)
    // For now, we'll just remove the follow from storage
    // In a real system, you'd store the unfollow event and filter follows accordingly

    // Broadcast via gossip
    await this.gossip.broadcastEvent(unfollowEvent);

    return unfollowEvent;
  }

  /**
   * Check if we follow a user
   */
  async checkFollowing(targetPublicKey: Uint8Array): Promise<boolean> {
    const myPublicKeyStr = publicKeyToString(this.myPublicKey);
    const targetPublicKeyStr = publicKeyToString(targetPublicKey);
    return await isFollowing(myPublicKeyStr, targetPublicKeyStr);
  }

  /**
   * Get all users we follow
   */
  async getFollowing(): Promise<string[]> {
    const myPublicKeyStr = publicKeyToString(this.myPublicKey);
    const follows = await getFollowsByAuthor(myPublicKeyStr);
    
    // Filter out unfollows (in a real system, you'd process the event log)
    const following = new Set<string>();
    const unfollowed = new Set<string>();
    
    // Process in chronological order
    const sortedFollows = follows.sort((a, b) => a.timestamp - b.timestamp);
    
    for (const follow of sortedFollows) {
      if (follow.type === 'follow') {
        following.add(follow.content.target);
        unfollowed.delete(follow.content.target);
      } else if (follow.type === 'unfollow') {
        following.delete(follow.content.target);
        unfollowed.add(follow.content.target);
      }
    }
    
    return Array.from(following);
  }

  /**
   * Get all followers
   */
  async getFollowers(): Promise<string[]> {
    const myPublicKeyStr = publicKeyToString(this.myPublicKey);
    const followers = await getFollowersOf(myPublicKeyStr);
    
    // Filter out unfollows
    const followingSet = new Set<string>();
    const unfollowedSet = new Set<string>();
    
    const sortedFollowers = followers.sort((a, b) => a.timestamp - b.timestamp);
    
    for (const follow of sortedFollowers) {
      if (follow.type === 'follow') {
        followingSet.add(follow.author);
        unfollowedSet.delete(follow.author);
      } else if (follow.type === 'unfollow') {
        followingSet.delete(follow.author);
        unfollowedSet.add(follow.author);
      }
    }
    
    return Array.from(followingSet);
  }

  /**
   * Get follow graph (who follows whom)
   */
  async getFollowGraph(): Promise<Map<string, Set<string>>> {
    const graph = new Map<string, Set<string>>();
    
    // Get all follows
    const myPublicKeyStr = publicKeyToString(this.myPublicKey);
    const allFollows = await getFollowsByAuthor(myPublicKeyStr);
    
    // Process follows chronologically
    const sortedFollows = allFollows.sort((a, b) => a.timestamp - b.timestamp);
    
    for (const follow of sortedFollows) {
      if (!graph.has(follow.author)) {
        graph.set(follow.author, new Set());
      }
      
      if (follow.type === 'follow') {
        graph.get(follow.author)!.add(follow.content.target);
      } else if (follow.type === 'unfollow') {
        graph.get(follow.author)!.delete(follow.content.target);
      }
    }
    
    return graph;
  }
}
