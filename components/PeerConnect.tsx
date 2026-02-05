'use client';

import { useState } from 'react';
import type { Network } from '@/lib/network';

interface PeerConnectProps {
  network: Network | null;
}

export default function PeerConnect({ network }: PeerConnectProps) {
  const [multiaddr, setMultiaddr] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleConnect = async () => {
    if (!network || !multiaddr.trim()) {
      setError('Enter a valid multiaddr');
      return;
    }
    setConnecting(true);
    setError(null);
    setSuccess(false);
    try {
      await network.connectToPeer(multiaddr.trim());
      setSuccess(true);
      setMultiaddr('');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="phemossa-card p-5 space-y-3">
      <h3 className="text-sm font-semibold text-[rgb(var(--color-text-muted))] uppercase tracking-wider">
        Connect peer
      </h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={multiaddr}
          onChange={(e) => setMultiaddr(e.target.value)}
          placeholder="/ip4/…/webrtc/…"
          className="phemossa-input flex-1 text-sm"
          disabled={!network || connecting}
        />
        <button
          type="button"
          onClick={handleConnect}
          disabled={!network || connecting || !multiaddr.trim()}
          className="phemossa-btn-primary shrink-0"
        >
          {connecting ? '…' : 'Connect'}
        </button>
      </div>
      {error && (
        <p className="text-xs text-[rgb(var(--color-error))]">{error}</p>
      )}
      {success && (
        <p className="text-xs text-[rgb(var(--color-success))]">Connected</p>
      )}
    </div>
  );
}
