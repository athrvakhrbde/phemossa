# Installation Guide

## Prerequisites

- Node.js 18+ 
- npm or yarn

## Step 1: Install Dependencies

```bash
npm install
```

This will install:
- Next.js and React
- libp2p and WebRTC transports
- Cryptographic libraries (@noble/ed25519)
- IndexedDB wrapper (idb)
- TypeScript and build tools

## Step 2: Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Step 3: Building for Production

```bash
npm run build
npm start
```

## Troubleshooting

### libp2p Import Errors

If you see errors about libp2p modules, ensure you're using compatible versions. The package.json includes tested versions.

### WebRTC Not Working

WebRTC requires HTTPS in production (or localhost for development). Make sure you're accessing the app via:
- `http://localhost:3000` (development)
- `https://yourdomain.com` (production)

### IndexedDB Errors

Some browsers have IndexedDB restrictions:
- Safari: May require user interaction before accessing IndexedDB
- Firefox: Private browsing mode disables IndexedDB
- Chrome: Should work out of the box

### Peer Connection Issues

If peers can't connect:
1. Check browser console for WebRTC errors
2. Ensure both peers are on the same network (for local testing)
3. Configure STUN/TURN servers for NAT traversal (see README)

## Next Steps

1. Configure bootstrap nodes (optional)
2. Set up STUN/TURN servers for NAT traversal
3. Customize UI components
4. Add additional features
