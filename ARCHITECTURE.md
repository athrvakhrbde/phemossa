# Architecture Documentation

## System Overview

Phemossa is a fully browser-based peer-to-peer social media system. All data and networking happens in the browser - no servers required.

## Module Architecture

### 1. Identity Module (`lib/identity.ts`)

**Purpose**: Manage user cryptographic identity

**Key Functions**:
- Generate ed25519 keypairs
- Persist keys in IndexedDB
- Sign and verify messages
- Convert between binary and base64 formats

**Storage**: IndexedDB database `phemossa-identity`

**Security**: Private keys never leave the browser. All operations are local.

### 2. Storage Module (`lib/storage.ts`)

**Purpose**: Persistent storage for events, follows, and peer information

**Schema**:
- `events`: All signed events (posts, follows, unfollows)
  - Indexed by: id, author, timestamp, [author, timestamp]
- `follows`: Follow/unfollow events
  - Indexed by: id, follower, followee, timestamp
- `peers`: Known peer information
  - Indexed by: peerId, lastSeen

**Operations**:
- Store/retrieve events
- Query by author, timestamp ranges
- Get follow graph
- Track peer connections

### 3. Event Model (`lib/events.ts`)

**Purpose**: Define and manage append-only signed events

**Event Types**:
- `post`: Text posts with optional mentions/replies
- `follow`: Follow relationships
- `unfollow`: Unfollow relationships

**Event Structure**:
```typescript
{
  id: string,           // SHA-256 hash of event content
  type: EventType,
  author: string,        // base64 public key
  timestamp: number,
  signature: string,     // base64 signature
  content: {...}         // type-specific content
}
```

**Validation**:
- Verify signature matches author
- Verify ID matches content hash
- Check event structure

### 4. Network Module (`lib/network.ts`)

**Purpose**: libp2p networking layer

**Features**:
- WebRTC transport for browser-to-browser connections
- Noise protocol for encryption
- Automatic reconnection logic
- Peer discovery via bootstrap nodes
- Protocol multiplexing

**Key Methods**:
- `start()`: Initialize libp2p node
- `connectToPeer()`: Connect to peer by multiaddr
- `sendMessage()`: Send message on protocol
- `handleProtocol()`: Register protocol handler

### 5. Gossip Protocol (`lib/gossip.ts`)

**Purpose**: Synchronize events between peers

**Protocol Flow**:
1. **On Peer Connect**:
   - Exchange known event IDs
   - Identify missing events
   - Request missing events

2. **Event Broadcasting**:
   - Broadcast new events to all connected peers
   - Prevent infinite rebroadcast loops
   - Batch messages for efficiency

3. **Event Processing**:
   - Validate incoming events
   - Store valid events
   - Add to feed if applicable

**Message Types**:
- `sync-request`: Request event ID exchange
- `sync-response`: Response with missing IDs
- `event-request`: Request specific events
- `event-response`: Send requested events
- `new-event`: Broadcast new event

### 6. Follow System (`lib/follow.ts`)

**Purpose**: Manage follow relationships

**Implementation**:
- Follows stored as signed events
- Unfollows stored as signed events
- Follow graph computed from event log
- Chronological processing (later events override earlier)

**Methods**:
- `follow()`: Create and broadcast follow event
- `unfollow()`: Create and broadcast unfollow event
- `getFollowing()`: Get list of followed users
- `getFollowers()`: Get list of followers

### 7. Feed Engine (`lib/feed.ts`)

**Purpose**: Aggregate and display posts from followed users

**Functionality**:
- Merge posts from all followed users
- Sort by timestamp (newest first)
- Real-time updates via subscriptions
- Filter by follow graph

**Subscription Model**:
- Components can subscribe to feed updates
- Callbacks called when feed changes
- Automatic refresh on new events

### 8. System Orchestrator (`lib/system.ts`)

**Purpose**: Coordinate all modules

**Initialization Order**:
1. Identity (generate/load keypair)
2. Network (start libp2p)
3. Gossip (start protocol)
4. Follow System
5. Feed Engine

**Public API**:
- `createPost()`: Create and broadcast post
- `follow()`: Follow a user
- `unfollow()`: Unfollow a user
- `connectToPeer()`: Connect to peer

## Data Flow

### Creating a Post

1. User types post in UI
2. `system.createPost()` called
3. `createPostEvent()` creates signed event
4. Event stored in IndexedDB
5. Event broadcast via gossip
6. Feed engine adds to local feed
7. Other peers receive via gossip
8. Other peers validate and store
9. Other peers add to their feeds (if following author)

### Following a User

1. User enters public key
2. `system.follow()` called
3. `createFollowEvent()` creates signed event
4. Event stored in IndexedDB
5. Event broadcast via gossip
6. Feed engine refreshes to include new user's posts
7. Other peers receive and store follow event

### Peer Connection

1. User enters peer multiaddr
2. `system.connectToPeer()` called
3. Network establishes WebRTC connection
4. Gossip protocol starts sync
5. Event IDs exchanged
6. Missing events requested
7. Events synchronized
8. Feed updated with new posts

## Security Model

### What's Protected

- **Event Integrity**: Signatures prevent tampering
- **Connection Security**: Noise protocol encryption
- **Identity**: Private keys never leave browser
- **Data Ownership**: Users control their own data

### What's NOT Protected

- **Spam**: No rate limiting or spam prevention
- **Sybil Attacks**: Unlimited identity creation
- **Eclipse Attacks**: Malicious peers can isolate you
- **Content Moderation**: No filtering or moderation
- **Authentication**: Anyone can create events with any public key

### Recommendations

1. **Proof of Work**: Add computational cost to event creation
2. **Reputation System**: Track peer behavior
3. **Content Filtering**: User-configurable filters
4. **Rate Limiting**: Limit events per time period
5. **DHT Discovery**: Better peer discovery to prevent eclipse attacks

## Performance Considerations

### IndexedDB

- **Async Operations**: All storage is async
- **Query Performance**: Indexes help but large datasets are slow
- **Storage Limits**: Browser-dependent (typically 50MB-1GB)

**Optimizations**:
- Pagination for large feeds
- Event pruning (remove old events)
- Lazy loading

### Network

- **WebRTC Overhead**: Each connection is expensive
- **Bandwidth**: Gossip can use significant bandwidth
- **Connection Limits**: Limit simultaneous connections

**Optimizations**:
- Batch gossip messages
- Compress large payloads
- Limit peer connections
- Use bloom filters for event ID exchange

### Memory

- **Event Cache**: Keep frequently accessed events in memory
- **Feed Size**: Limit feed to recent N posts
- **Garbage Collection**: Remove old events from memory

### CPU

- **Signature Verification**: CPU-intensive
- **Hash Calculation**: SHA-256 for event IDs

**Optimizations**:
- Batch signature verification
- Use Web Workers for crypto
- Cache verified events

## Scaling Limits

### Realistic Expectations

- **10-200 peers**: Works well
- **200-1000 peers**: Performance issues
- **1000+ peers**: Not recommended

### Bottlenecks

1. **Browser Memory**: Limited by device
2. **IndexedDB**: Storage and query limits
3. **Network Bandwidth**: Gossip overhead
4. **CPU**: Signature verification
5. **WebRTC**: Connection limits

### Mitigation Strategies

1. **Event Pruning**: Remove old events
2. **Partial Sync**: Only sync recent events
3. **Bloom Filters**: Efficient event ID exchange
4. **Connection Limits**: Max N simultaneous peers
5. **Caching**: Cache frequently accessed data

## NAT Traversal

### The Problem

Most users are behind NAT/firewalls, making direct connections difficult.

### Solutions

1. **STUN Servers**: Discover public IP
2. **TURN Servers**: Relay traffic if direct connection fails
3. **ICE**: Automatic connection establishment
4. **Bootstrap Nodes**: Help with initial discovery

### Configuration

You'll need to configure STUN/TURN servers:

```typescript
const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:your-turn-server.com', username: '...', credential: '...' }
  ]
};
```

## Future Enhancements

1. **DHT**: Distributed hash table for peer discovery
2. **PubSub**: Built-in pubsub for event broadcasting
3. **Event Pruning**: Remove old events to save space
4. **Media Support**: Images, videos, files
5. **Threading**: Reply threads and conversations
6. **Search**: Full-text search across events
7. **Profiles**: User profile information
8. **Mobile Optimization**: Better mobile browser support
