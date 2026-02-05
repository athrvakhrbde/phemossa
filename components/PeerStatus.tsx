'use client';

import { useEffect, useState } from 'react';
import type { Network } from '@/lib/network';
import type { PeerId } from '@libp2p/interface';

interface PeerStatusProps {
  network: Network | null;
}

function shortPeerId(id: string): string {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

export default function PeerStatus({ network }: PeerStatusProps) {
  const [peerId, setPeerId] = useState<string | null>(null);
  const [connectedPeers, setConnectedPeers] = useState<PeerId[]>([]);
  const [multiaddrs, setMultiaddrs] = useState<string[]>([]);

  useEffect(() => {
    if (!network) return;
    const update = () => {
      setPeerId(network.getPeerIdString());
      setConnectedPeers(network.getConnectedPeers());
      setMultiaddrs(network.getMultiaddrs());
    };
    update();
    const interval = setInterval(update, 2000);
    return () => clearInterval(interval);
  }, [network]);

  if (!network) {
    return (
      <div className="phemossa-card p-5">
        <p className="text-sm text-[rgb(var(--color-text-muted))]">Network not ready</p>
      </div>
    );
  }

  return (
    <div className="phemossa-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-[rgb(var(--color-text-muted))] uppercase tracking-wider">
        Your node
      </h3>
      <div>
        <p className="text-xs text-[rgb(var(--color-text-subtle))] mb-0.5">Peer ID</p>
        <p className="text-sm font-mono text-[rgb(var(--color-text))] break-all">
          {peerId ? shortPeerId(peerId) : '—'}
        </p>
      </div>
      <div>
        <p className="text-xs text-[rgb(var(--color-text-subtle))] mb-1">
          Connected ({connectedPeers.length})
        </p>
        {connectedPeers.length === 0 ? (
          <p className="text-sm text-[rgb(var(--color-text-muted))]">No peers yet</p>
        ) : (
          <ul className="space-y-0.5">
            {connectedPeers.slice(0, 5).map((peer) => (
              <li key={peer.toString()} className="text-sm font-mono text-[rgb(var(--color-text))]">
                {shortPeerId(peer.toString())}
              </li>
            ))}
            {connectedPeers.length > 5 && (
              <li className="text-xs text-[rgb(var(--color-text-muted))]">
                +{connectedPeers.length - 5} more
              </li>
            )}
          </ul>
        )}
      </div>
      {multiaddrs.length > 0 && (
        <div>
          <p className="text-xs text-[rgb(var(--color-text-subtle))] mb-1">Listening</p>
          <p className="text-xs font-mono text-[rgb(var(--color-text-muted))] break-all">
            {multiaddrs[0]}
          </p>
        </div>
      )}
    </div>
  );
}
