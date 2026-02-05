# Quick Start Guide

## Getting Started in 3 Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

### 3. Open in Browser

Open [http://localhost:3000](http://localhost:3000)

## First Steps

### Create Your First Post

1. Type a message in the "Create Post" box
2. Click "Post"
3. Your post appears in the feed

### Connect to Another Peer

1. Open the app in another browser/device
2. Copy the "Peer ID" from the first instance
3. In the second instance, enter the multiaddr in "Connect to Peer"
4. Once connected, posts will sync between peers

### Follow a User

1. Get the user's public key (displayed as base64 string)
2. Use the follow API (currently requires code, UI coming soon)

## Testing Locally

### Two Browser Windows

1. Open `http://localhost:3000` in Chrome
2. Open `http://localhost:3000` in Firefox (or another Chrome profile)
3. Each will have a different identity
4. Connect them using peer multiaddrs
5. Create posts in one, see them appear in the other

### Network Requirements

- Both browsers must be on the same network (for local testing)
- Or configure STUN/TURN servers for cross-network connections
- WebRTC requires HTTPS in production (localhost works for dev)

## Common Issues

### "Network not initialized"

- Wait for the system to finish initializing
- Check browser console for errors
- Ensure IndexedDB is enabled in your browser

### "Failed to connect to peer"

- Verify both peers are running
- Check that multiaddr is correct
- Ensure both are on the same network (for local testing)
- Check browser console for WebRTC errors

### Posts not syncing

- Verify peers are connected (check "Connected Peers")
- Check browser console for gossip protocol errors
- Ensure events are being validated (check console logs)

## Next Steps

- Read [README.md](./README.md) for full documentation
- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- Configure bootstrap nodes for peer discovery
- Set up STUN/TURN servers for NAT traversal
