import { Network } from './network';
import { Event, isValidEvent } from './events';
import { storeEvent, getAllEventIds, getEventIdsByAuthor, hasEvent, getEvent } from './storage';
import type { PeerId } from '@libp2p/interface';

/**
 * Gossip Protocol
 * 
 * On peer connect:
 * - Exchange known event IDs
 * - Sync missing events
 * - Prevent infinite rebroadcast
 * - Efficient batching
 */

const GOSSIP_PROTOCOL = '/phemossa/gossip/1.0.0';
const MAX_BATCH_SIZE = 100;
const SYNC_TIMEOUT = 30000; // 30 seconds

export interface GossipMessage {
  type: 'sync-request' | 'sync-response' | 'event-request' | 'event-response' | 'new-event';
  data?: any;
}

export class GossipProtocol {
  private network: Network;
  private pendingSyncs: Map<string, {
    peerId: PeerId;
    requestedIds: Set<string>;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private seenEventIds: Set<string> = new Set();
  private eventQueue: Event[] = [];
  private processingQueue = false;

  constructor(network: Network) {
    this.network = network;
  }

  /**
   * Start the gossip protocol
   */
  async start(): Promise<void> {
    if (!this.network.isStarted()) {
      throw new Error('Network must be started before gossip protocol');
    }

    // Set up protocol handler
    await this.network.handleProtocol(GOSSIP_PROTOCOL, async (stream) => {
      const peerId = stream.connection.remotePeer;
      await this.handleIncomingStream(peerId, stream);
    });

    // Load known event IDs from storage
    const knownIds = await getAllEventIds();
    this.seenEventIds = knownIds;

    // Set up peer connect handler
    const originalOnConnect = (this.network as any).config?.onPeerConnect;
    (this.network as any).config = {
      ...(this.network as any).config,
      onPeerConnect: async (peerId: PeerId) => {
        if (originalOnConnect) {
          originalOnConnect(peerId);
        }
        // Start sync with new peer
        await this.syncWithPeer(peerId);
      },
    };

    console.log('Gossip protocol started');
  }

  /**
   * Handle incoming stream from peer
   */
  private async handleIncomingStream(peerId: PeerId, stream: { source: AsyncIterable<Uint8Array>, close: () => void }): Promise<void> {
    try {
      const chunks: Uint8Array[] = [];
      
      // Read all chunks from stream
      for await (const chunk of stream.source) {
        chunks.push(chunk);
      }

      // Combine chunks into single message
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const message = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        message.set(chunk, offset);
        offset += chunk.length;
      }

      // Parse message
      const text = new TextDecoder().decode(message);
      const gossipMessage: GossipMessage = JSON.parse(text);

      // Handle message based on type
      await this.handleMessage(peerId, gossipMessage);

      // Close stream
      await stream.close();
    } catch (error) {
      console.error('Error handling incoming stream:', error);
    }
  }

  /**
   * Handle a gossip message
   */
  private async handleMessage(peerId: PeerId, message: GossipMessage): Promise<void> {
    switch (message.type) {
      case 'sync-request':
        await this.handleSyncRequest(peerId, message.data);
        break;
      case 'sync-response':
        await this.handleSyncResponse(peerId, message.data);
        break;
      case 'event-request':
        await this.handleEventRequest(peerId, message.data);
        break;
      case 'event-response':
        await this.handleEventResponse(peerId, message.data);
        break;
      case 'new-event':
        await this.handleNewEvent(peerId, message.data);
        break;
    }
  }

  /**
   * Send a message to a peer
   */
  private async sendMessage(peerId: PeerId, message: GossipMessage): Promise<void> {
    const text = JSON.stringify(message);
    const data = new TextEncoder().encode(text);
    await this.network.sendMessage(peerId, GOSSIP_PROTOCOL, data);
  }

  /**
   * Sync with a peer (exchange event IDs and request missing events)
   */
  async syncWithPeer(peerId: PeerId): Promise<void> {
    const ourEventIds = await getAllEventIds();
    
    const message: GossipMessage = {
      type: 'sync-request',
      data: {
        eventIds: Array.from(ourEventIds),
      },
    };

    await this.sendMessage(peerId, message);
  }

  /**
   * Handle sync request from peer
   */
  private async handleSyncRequest(peerId: PeerId, data: { eventIds: string[] }): Promise<void> {
    const theirEventIds = new Set(data.eventIds);
    const ourEventIds = await getAllEventIds();
    
    // Find events they have that we don't
    const missingIds = Array.from(theirEventIds).filter(id => !ourEventIds.has(id));
    
    // Find events we have that they don't
    const theirMissingIds = Array.from(ourEventIds).filter(id => !theirEventIds.has(id));

    const response: GossipMessage = {
      type: 'sync-response',
      data: {
        missingIds: theirMissingIds,
        theirMissingIds: missingIds,
      },
    };

    await this.sendMessage(peerId, response);

    // Request events we're missing
    if (missingIds.length > 0) {
      await this.requestEvents(peerId, missingIds);
    }
  }

  /**
   * Handle sync response from peer
   */
  private async handleSyncResponse(peerId: PeerId, data: { missingIds: string[], theirMissingIds: string[] }): Promise<void> {
    // Request events we're missing
    if (data.missingIds && data.missingIds.length > 0) {
      await this.requestEvents(peerId, data.missingIds);
    }
  }

  /**
   * Request specific events from a peer
   */
  private async requestEvents(peerId: PeerId, eventIds: string[]): Promise<void> {
    // Batch requests
    for (let i = 0; i < eventIds.length; i += MAX_BATCH_SIZE) {
      const batch = eventIds.slice(i, i + MAX_BATCH_SIZE);
      
      const message: GossipMessage = {
        type: 'event-request',
        data: {
          eventIds: batch,
        },
      };

      await this.sendMessage(peerId, message);
    }
  }

  /**
   * Handle event request from peer
   */
  private async handleEventRequest(peerId: PeerId, data: { eventIds: string[] }): Promise<void> {
    const events: Event[] = [];
    
    for (const eventId of data.eventIds) {
      const event = await getEvent(eventId);
      if (event) {
        events.push(event);
      }
    }

    const message: GossipMessage = {
      type: 'event-response',
      data: {
        events,
      },
    };

    await this.sendMessage(peerId, message);
  }

  /**
   * Handle event response from peer
   */
  private async handleEventResponse(peerId: PeerId, data: { events: Event[] }): Promise<void> {
    for (const event of data.events) {
      await this.processIncomingEvent(event, peerId);
    }
  }

  /**
   * Handle new event broadcast from peer
   */
  private async handleNewEvent(peerId: PeerId, data: { event: Event }): Promise<void> {
    await this.processIncomingEvent(data.event, peerId);
  }

  /**
   * Process an incoming event (validate, store, rebroadcast)
   */
  private async processIncomingEvent(event: Event, fromPeer: PeerId): Promise<void> {
    // Check if we've already seen this event
    if (this.seenEventIds.has(event.id)) {
      return;
    }

    // Validate event
    const isValid = await isValidEvent(event);
    if (!isValid) {
      console.warn('Invalid event received from peer:', fromPeer.toString(), event.id);
      return;
    }

    // Check if already in storage
    if (await hasEvent(event.id)) {
      this.seenEventIds.add(event.id);
      return;
    }

    // Store event
    await storeEvent(event);
    this.seenEventIds.add(event.id);

    // Add to queue for rebroadcast (prevent infinite loops)
    this.eventQueue.push(event);

    // Process queue if not already processing
    if (!this.processingQueue) {
      this.processEventQueue();
    }
  }

  /**
   * Process event queue and rebroadcast to other peers
   */
  private async processEventQueue(): Promise<void> {
    if (this.processingQueue) {
      return;
    }

    this.processingQueue = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      if (!event) {
        break;
      }

      // Broadcast to all connected peers (except the one we received it from)
      const peers = this.network.getConnectedPeers();
      
      for (const peerId of peers) {
        try {
          const message: GossipMessage = {
            type: 'new-event',
            data: {
              event,
            },
          };

          await this.sendMessage(peerId, message);
        } catch (error) {
          console.error('Failed to broadcast event to peer:', peerId.toString(), error);
        }
      }
    }

    this.processingQueue = false;
  }

  /**
   * Broadcast a new event to all connected peers
   */
  async broadcastEvent(event: Event): Promise<void> {
    // Store locally first
    await storeEvent(event);
    this.seenEventIds.add(event.id);

    // Broadcast to all connected peers
    const peers = this.network.getConnectedPeers();
    
    for (const peerId of peers) {
      try {
        const message: GossipMessage = {
          type: 'new-event',
          data: {
            event,
          },
        };

        await this.sendMessage(peerId, message);
      } catch (error) {
        console.error('Failed to broadcast event to peer:', peerId.toString(), error);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    seenEventIds: number;
    queuedEvents: number;
    connectedPeers: number;
  } {
    return {
      seenEventIds: this.seenEventIds.size,
      queuedEvents: this.eventQueue.length,
      connectedPeers: this.network.getConnectedPeers().length,
    };
  }
}
