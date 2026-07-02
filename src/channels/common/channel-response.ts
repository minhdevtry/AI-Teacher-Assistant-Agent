/**
 * Normalized response interface for cross-platform channel responses.
 * The adapter layer converts this into platform-specific API calls.
 */
export interface ChannelResponse {
  /** Target platform identifier */
  platform: 'zalo' | 'web' | 'telegram';
  /** Recipient identifier on the platform */
  recipientId: string;
  /** Text content to send */
  content: string;
  /** Optional media URL to attach */
  mediaUrl?: string;
  /** Optional quick-reply buttons */
  buttons?: Array<{ text: string; payload: string }>;
  /**
   * Parse mode for rich text formatting.
   * When set, the content field may contain markup that the platform will render.
   * - 'markdown': Zalo/Telegram markdown syntax
   * - 'html': HTML tag-based formatting
   * When undefined, content is sent as plain text.
   */
  parseMode?: 'markdown' | 'html';
}
