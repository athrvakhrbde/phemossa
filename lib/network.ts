import { createLibp2p, Libp2p } from 'libp2p';
import { webRTC } from '@libp2p/webrtc';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import { bootstrap } from '@libp2p/bootstrap';
import { mplex } from '@libp2p/mplex';
import { noise } from '@chainsafe/libp2p-noise';
import { peerIdFromString } from '@libp2p/peer-id';
import type { PeerId } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';

/**
 * Networking Layer
 * 
 * libp2p configured for browser with WebRTC transport.
 * Peer discovery via bootstrap multiaddrs.
 * Encrypted connections with Noise protocol.
 * Reconnect logic for maintaining connections.
 */

export interface NetworkConfig {
  peerId?: PeerId;
  bootstrapMultiaddrs?: string[];
  onPeerConnect?: (peerId: PeerId) => void;
  onPeerDisconnect?: (peerId: PeerId) => void;
  onMessage?: (peerId: PeerId, message: Uint8Array) => void;
}

export class Network {
  private libp2p: Libp2p | null = null;
  private config: NetworkConfig;
  private reconnectAttempts: Map<string, number> = new Map();
  private reconnectIntervals: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 5000; // 5 seconds

  constructor(config: NetworkConfig) {
    this.config = config;
  }

  /**
   * Initialize libp2p node
   */
  async start(): Promise<void> {
    if (this.libp2p) {
      throw new Error('Network already started');
    }

    const transports = [
      circuitRelayTransport(),
      webRTC(),
    ];

    const services: any = {
      identify: identify(),
    };

    // Add bootstrap if configured
    if (this.config.bootstrapMultiaddrs && this.config.bootstrapMultiaddrs.length > 0) {
      services.bootstrap = bootstrap({
        list: this.config.bootstrapMultiaddrs,
      });
    }

    const options: any = {
      transports,
      streamMuxers: [mplex()],
      connectionEncryption: [noise()],
      services,
    };

    if (this.config.peerId) {
      options.peerId = this.config.peerId;
    }

    this.libp2p = await createLibp2p(options);

    // Set up event handlers
    this.libp2p.addEventListener('peer:connect', (evt: any) => {
      const peerId = evt.detail;
      console.log('Peer connected:', peerId.toString());
      this.reconnectAttempts.delete(peerId.toString());
      this.clearReconnectInterval(peerId.toString());
      
      if (this.config.onPeerConnect) {
        this.config.onPeerConnect(peerId);
      }
    });

    this.libp2p.addEventListener('peer:disconnect', (evt: any) => {
      const peerId = evt.detail;
      console.log('Peer disconnected:', peerId.toString());
      
      if (this.config.onPeerDisconnect) {
        this.config.onPeerDisconnect(peerId);
      }
      
      // Attempt to reconnect
      this.scheduleReconnect(peerId);
    });

    // Start the node
    await this.libp2p.start();
    
    console.log('Network started. Peer ID:', this.libp2p.peerId.toString());
    console.log('Listening addresses:', this.libp2p.getMultiaddrs().map(ma => ma.toString()));
  }

  /**
   * Stop the network
   */
  async stop(): Promise<void> {
    if (!this.libp2p) {
      return;
    }

    // Clear all reconnect intervals
    for (const [peerId, interval] of this.reconnectIntervals.entries()) {
      clearTimeout(interval);
    }
    this.reconnectIntervals.clear();
    this.reconnectAttempts.clear();

    await this.libp2p.stop();
    this.libp2p = null;
  }

  /**
   * Get peer ID
   */
  getPeerId(): PeerId | null {
    return (this.libp2p?.peerId ?? null) as PeerId | null;
  }

  /**
   * Get peer ID as string
   */
  getPeerIdString(): string | null {
    return this.libp2p?.peerId.toString() ?? null;
  }

  /**
   * Get listening addresses
   */
  getMultiaddrs(): string[] {
    if (!this.libp2p) {
      return [];
    }
    return this.libp2p.getMultiaddrs().map(ma => ma.toString());
  }

  /**
   * Connect to a peer by multiaddr
   */
  async connectToPeer(multiaddrStr: string): Promise<void> {
    if (!this.libp2p) {
      throw new Error('Network not started');
    }

    try {
      const ma = multiaddr(multiaddrStr);
      await this.libp2p.dial(ma as any);
      console.log('Connected to peer:', multiaddrStr);
    } catch (error) {
      console.error('Failed to connect to peer:', multiaddrStr, error);
      throw error;
    }
  }

  /**
   * Connect to a peer by peer ID (if we have a multiaddr for them)
   */
  async connectToPeerId(peerIdStr: string): Promise<void> {
    if (!this.libp2p) {
      throw new Error('Network not started');
    }

    try {
      const peerId = peerIdFromString(peerIdStr);
      // This will only work if we have a known address for the peer
      // In a real system, you'd use DHT or other discovery mechanisms
      await this.libp2p.dial(peerId as any);
      console.log('Connected to peer ID:', peerIdStr);
    } catch (error) {
      console.error('Failed to connect to peer ID:', peerIdStr, error);
      throw error;
    }
  }

  /**
   * Get connected peers
   */
  getConnectedPeers(): PeerId[] {
    if (!this.libp2p) {
      return [];
    }
    return Array.from(this.libp2p.getPeers()) as unknown as PeerId[];
  }

  /**
   * Send a message to a peer
   */
  async sendMessage(peerId: PeerId, protocol: string, message: Uint8Array): Promise<void> {
    if (!this.libp2p) {
      throw new Error('Network not started');
    }

    try {
      const stream = await this.libp2p.dialProtocol(peerId as any, protocol);
      const sink = (stream as any).sink;
      if (sink) {
        const source = (async function* () {
          yield message;
        })();
        await sink(source);
      }
      if (typeof (stream as any).close === 'function') {
        (stream as any).close();
      }
    } catch (error) {
      console.error('Failed to send message to peer:', peerId.toString(), error);
      throw error;
    }
  }

  /**
   * Handle incoming messages on a protocol
   */
  async handleProtocol(protocol: string, handler: (stream: any) => void | Promise<void>): Promise<void> {
    if (!this.libp2p) {
      throw new Error('Network not started');
    }

    await this.libp2p.handle(protocol, handler);
  }

  /**
   * Schedule reconnection attempt for a peer
   */
  private scheduleReconnect(peerId: PeerId): void {
    const peerIdStr = peerId.toString();
    const attempts = this.reconnectAttempts.get(peerIdStr) || 0;

    if (attempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached for peer:', peerIdStr);
      return;
    }

    // Clear any existing interval
    this.clearReconnectInterval(peerIdStr);

    const interval = setTimeout(async () => {
      this.reconnectAttempts.set(peerIdStr, attempts + 1);
      
      try {
        await this.libp2p?.dial(peerId as any);
        console.log('Reconnected to peer:', peerIdStr);
      } catch (error) {
        console.error('Reconnection failed for peer:', peerIdStr, error);
        // Schedule another attempt
        this.scheduleReconnect(peerId);
      }
    }, this.reconnectDelay);

    this.reconnectIntervals.set(peerIdStr, interval);
  }

  /**
   * Clear reconnect interval for a peer
   */
  private clearReconnectInterval(peerIdStr: string): void {
    const interval = this.reconnectIntervals.get(peerIdStr);
    if (interval) {
      clearTimeout(interval);
      this.reconnectIntervals.delete(peerIdStr);
    }
  }

  /**
   * Check if network is started
   */
  isStarted(): boolean {
    return this.libp2p !== null;
  }
}
