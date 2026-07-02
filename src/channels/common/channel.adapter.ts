import { ChannelEvent } from './channel-event';
import { ChannelResponse } from './channel-response';

/**
 * Abstract base class for platform-specific channel adapters.
 * Each platform (Zalo, Telegram, Web) must implement this class
 * to normalize incoming events and translate outgoing responses.
 */
export abstract class ChannelAdapter {
  /**
   * Transform a raw platform-specific webhook payload into a ChannelEvent.
   */
  abstract normalizeEvent(rawEvent: unknown): ChannelEvent;

  /**
   * Send a normalized response through the platform's API.
   */
  abstract sendResponse(response: ChannelResponse): Promise<void>;

  /**
   * Return the platform identifier string.
   */
  abstract getPlatform(): string;
}
