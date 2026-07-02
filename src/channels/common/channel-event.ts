/**
 * Normalized event interface for cross-platform channel events.
 * All platform-specific webhooks are transformed into this shape.
 */
export interface ChannelEvent {
  /** Source platform identifier */
  platform: 'zalo' | 'web' | 'telegram';
  /** Unique sender identifier on the platform */
  senderId: string;
  /** Human-readable sender name */
  senderName: string;
  /** Discriminated event type */
  eventType:
    | 'message.text'
    | 'message.image'
    | 'message.voice'
    | 'message.sticker';
  /** Text content of the message (empty string for non-text events) */
  content: string;
  /** URL of attached media (image, voice, etc.) */
  mediaUrl?: string;
  /** Original platform-specific payload */
  rawPayload: unknown;
  /** Event timestamp */
  timestamp: Date;
}
