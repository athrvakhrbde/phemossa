# Deploying Phemossa to Production

Phemossa is a **frontend-only** app: all P2P logic runs in the browser. There is no backend to deploy. You only need to build the Next.js app and serve it over **HTTPS** (required for WebRTC and secure crypto).

---

## 1. Build

```bash
# Install dependencies (postinstall runs the libp2p patch script)
npm ci

# Build for production
npm run build
```

- **`npm ci`** is recommended in CI/production so the patch script runs in a clean `node_modules`.
- If build fails on `patch-static-name.js`, ensure Node is v18+ and run `npm install` then `npm run build` again.

---

## 2. Run locally (optional check)

```bash
npm start
```

Open `https://localhost:3000` (or your dev URL). WebRTC works best over HTTPS; some hosts allow HTTP locally but production must use HTTPS.

---

## 3. Hosting options

Serve the output of `next build`. The app uses **client-side rendering** for the P2P stack (`dynamic` with `ssr: false`), so any Next-compatible host works.

### Vercel (recommended)

1. Push the repo to GitHub/GitLab/Bitbucket.
2. In [Vercel](https://vercel.com): **Add New Project** → import the repo.
3. **Framework Preset**: Next.js. **Root Directory**: `.` (or your app folder).
4. **Build Command**: `npm run build` (default). **Output**: leave default.
5. Deploy. Vercel provides HTTPS and runs `npm install` + `npm run build` automatically.

**Note:** If you use `npm run build` in Vercel, ensure `package-lock.json` is committed so `npm ci`/`npm install` is deterministic.

### Netlify

1. **Build command:** `npm run build`  
2. **Publish directory:** `.next` (Netlify’s Next runtime will use it; or use **Next on Netlify** plugin / `@netlify/plugin-nextjs`).
3. **Environment:** No env vars required unless you add them (e.g. `NEXT_PUBLIC_*` for bootstrap peers).

### Cloudflare Pages

- Use **@cloudflare/next-on-pages** or the Next.js adapter for Pages so the app runs on Workers/Pages. Follow [Cloudflare’s Next.js guide](https://developers.cloudflare.com/pages/framework-guides/nextjs/).
- Build command: `npm run build` (or the adapter’s build script).

### Docker (Node server)

Example **Dockerfile**:

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

For the **standalone** output, set in `next.config.js`:

```js
const nextConfig = {
  output: 'standalone',
  // ... rest of your config
};
```

Then build the image and run it behind HTTPS (e.g. reverse proxy with TLS).

### Static export (optional)

If you want a **fully static** site (no Node at runtime):

1. In `next.config.js` add `output: 'export'`.
2. Run `npm run build`. Next will write static files to `out/`.
3. Serve `out/` with any static host (e.g. Nginx, S3 + CloudFront, GitHub Pages).

Not all Next features work with static export (e.g. API routes, ISR). For Phemossa (client-only P2P), static export is usually fine.

---

## 4. HTTPS

- **Production must use HTTPS.** Browsers require a secure context for WebRTC and the Web Crypto API.
- Vercel, Netlify, and Cloudflare Pages provide HTTPS by default.
- For Docker or VPS, put the app behind Nginx/Caddy/Traefik with TLS (e.g. Let’s Encrypt).

---

## 5. Environment variables

None are required for core functionality. If you later add **bootstrap peers** or other config via env:

- Use `NEXT_PUBLIC_*` for anything the browser must read (e.g. `NEXT_PUBLIC_BOOTSTRAP_PEERS`).
- Set these in your host’s dashboard (Vercel/Netlify/Cloudflare) or in your Docker/CI config.

---

## 6. Checklist

- [ ] `npm ci` (or `npm install`) then `npm run build` succeeds.
- [ ] App is served over **HTTPS**.
- [ ] `package-lock.json` is committed (for reproducible installs).
- [ ] No server-side secrets needed; P2P and storage are in the browser.

Once deployed, users open the URL in their browser; identity and data stay in their device (IndexedDB), and P2P runs between their browsers.
