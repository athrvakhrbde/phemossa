# Phemossa - Browser-Based P2P Social Media

A fully browser-based peer-to-peer social media system built with TypeScript, Next.js, libp2p, and WebRTC. No backend servers, no blockchain, no external protocols - just pure browser-to-browser communication.

## Architecture

### Core Modules

- **Identity** (`/lib/identity.ts`): ed25519 keypair generation and management, signing/verification
- **Storage** (`/lib/storage.ts`): IndexedDB schema for events, follows, and peers
- **Events** (`/lib/events.ts`): Append-only signed event model with hash-based IDs
- **Network** (`/lib/network.ts`): libp2p with WebRTC transport, encrypted connections
- **Gossip** (`/lib/gossip.ts`): Event synchronization protocol between peers
- **Follow** (`/lib/follow.ts`): Follow/unfollow system using signed events
- **Feed** (`/lib/feed.ts`): Feed engine that merges followed users' posts
- **System** (`/lib/system.ts`): Main orchestrator that coordinates all modules

### Technology Stack

- **Next.js 14** (App Router) - React framework
- **TypeScript** - Type safety
- **libp2p** - P2P networking stack
- **WebRTC** - Browser-to-browser connections
- **IndexedDB** - Local storage
- **ed25519** - Cryptographic signatures
- **Tailwind CSS** - Styling

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Production

Build and deploy the app (frontend only; no backend). Serve over **HTTPS** (required for WebRTC).

```bash
npm ci
npm run build
npm start   # optional: test production build locally
```

See **[DEPLOY.md](./DEPLOY.md)** for hosting options (Vercel, Netlify, Cloudflare Pages, Docker, static export) and a full checklist.

## How It Works

### Identity

Each user generates an ed25519 keypair on first load. The keypair is stored in IndexedDB and used to sign all events. The public key serves as the user's identity.

### Networking

- Uses libp2p with WebRTC transport for browser-to-browser connections
- Noise protocol for encrypted connections
- Bootstrap nodes for peer discovery (optional)
- Automatic reconnection logic

### Event Model

All content is stored as append-only signed events:
- **Post events**: Text posts with optional mentions and replies
- **Follow events**: Signed follow relationships
- **Unfollow events**: Signed unfollow relationships

Each event has:
- Unique hash-based ID
- Author (public key)
- Timestamp
- Content
- Cryptographic signature

### Gossip Protocol

When peers connect:
1. Exchange known event IDs
2. Request missing events
3. Broadcast new events to all connected peers
4. Prevent infinite rebroadcast loops

### Follow System

Follows are stored as signed events. The feed engine filters posts by the follow graph, showing only posts from users you follow (plus your own).

### Feed Engine

- Merges posts from all followed users
- Sorts by timestamp (newest first)
- Real-time updates when new events arrive
- Subscribable for UI updates

## Limitations & Considerations

### NAT Limitations

**Problem**: Most users are behind NAT (Network Address Translation) or firewalls, making direct peer connections difficult.

**Solutions in this system**:
- WebRTC uses ICE (Interactive Connectivity Establishment) to traverse NAT
- STUN servers help discover public IP addresses
- TURN servers can relay traffic if direct connection fails
- Bootstrap nodes help with initial peer discovery

**What you need**:
- STUN/TURN servers for NAT traversal (not included - you'll need to configure these)
- Bootstrap nodes for peer discovery (optional but recommended)

### Scaling Limits

**Realistic expectations**:
- **10-200 concurrent peers**: Works well
- **200-1000 peers**: May experience performance issues
- **1000+ peers**: Not recommended for browser-only mesh

**Bottlenecks**:
- Browser memory limits
- IndexedDB storage limits (varies by browser, typically 50MB-1GB)
- Network bandwidth for gossip
- CPU for signature verification

**Optimizations**:
- Event pruning (remove old events)
- Partial sync (only sync recent events)
- Bloom filters for event ID exchange
- Limit number of connected peers

### Security Considerations

**What's secure**:
- ✅ Event signatures prevent tampering
- ✅ Encrypted connections (Noise protocol)
- ✅ No central authority
- ✅ User controls their own data

**What's NOT secure**:
- ⚠️ No authentication (anyone can create events with any public key)
- ⚠️ No spam prevention
- ⚠️ No content moderation
- ⚠️ Sybil attacks possible (users can create unlimited identities)
- ⚠️ Eclipse attacks possible (malicious peers can isolate you)

**Recommendations for production**:
- Add proof-of-work to events (prevent spam)
- Implement reputation systems
- Add content filtering
- Use DHT for better peer discovery
- Implement rate limiting

### Performance Considerations

**IndexedDB**:
- Async operations can be slow
- Large datasets may cause UI freezing
- Consider pagination for large feeds

**Network**:
- WebRTC connections are expensive
- Limit number of simultaneous connections
- Batch gossip messages
- Use compression for large payloads

**Memory**:
- Keep event cache limited
- Implement LRU cache for frequently accessed events
- Garbage collect old events

**CPU**:
- Signature verification is CPU-intensive
- Batch verify signatures
- Use Web Workers for crypto operations

## Usage

### Creating a Post

```typescript
await system.createPost('Hello, P2P world!');
```

### Following a User

```typescript
const targetPublicKey = stringToPublicKey('base64-encoded-public-key');
await system.follow(targetPublicKey);
```

### Connecting to a Peer

```typescript
await system.connectToPeer('/ip4/192.168.1.1/tcp/9090/ws/p2p/...');
```

### Subscribing to Feed Updates

```typescript
const unsubscribe = feedEngine.subscribe((items) => {
  console.log('Feed updated:', items);
});
```

## Project Structure

```
phemossa/
├── app/                    # Next.js app directory
│   ├── page.tsx           # Main page
│   ├── layout.tsx          # Root layout
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── Feed.tsx           # Feed display
│   ├── PeerStatus.tsx     # Peer connection status
│   ├── PeerConnect.tsx    # Manual peer connection
│   └── PostComposer.tsx   # Post creation UI
├── lib/                   # Core library modules
│   ├── identity.ts        # Identity management
│   ├── storage.ts         # IndexedDB storage
│   ├── events.ts          # Event model
│   ├── network.ts         # libp2p networking
│   ├── gossip.ts          # Gossip protocol
│   ├── follow.ts          # Follow system
│   ├── feed.ts            # Feed engine
│   └── system.ts          # Main orchestrator
├── package.json
├── tsconfig.json
└── README.md
```

## Development Roadmap

- [ ] Add STUN/TURN server configuration
- [ ] Implement event pruning
- [ ] Add DHT for peer discovery
- [ ] Implement proof-of-work for spam prevention
- [ ] Add image/media support
- [ ] Implement reply threading
- [ ] Add user profiles
- [ ] Implement search functionality
- [ ] Add mobile support optimizations

## License

MIT

## Acknowledgments

Inspired by Secure Scuttlebutt, a distributed social network. This implementation focuses on browser-only operation with modern web technologies.

