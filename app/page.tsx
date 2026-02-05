'use client';

import dynamic from 'next/dynamic';

/**
 * Load the Phemossa app only on the client (ssr: false).
 * This prevents libp2p, WebRTC, IndexedDB, and their dependencies from
 * running during server-side rendering, which avoids:
 * - "Cannot assign to read only property 'name'" (AbortError in deps)
 * - Missing browser APIs (WebRTC, IndexedDB, crypto)
 */
const PhemossaApp = dynamic(() => import('./PhemossaApp'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-[rgb(var(--color-bg))]">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-[rgb(var(--color-border-strong))] border-t-[rgb(var(--color-accent))] animate-spin mx-auto mb-4" style={{ borderRadius: 0 }} />
        <p className="text-sm text-[rgb(var(--color-text-muted))]">Loading Phemossa…</p>
      </div>
    </div>
  ),
});

export default function Home() {
  return <PhemossaApp />;
}
