/**
 * Zalo-specific types for webhook payloads and bot interactions.
 * Based on the Zalo Bot API and node-zalo-bot SDK conventions.
 */

/** Supported Zalo message event types */
export type ZaloEventType =
  | 'message'
  | 'text'
  | 'photo'
  | 'sticker'
  | 'voice'
  | 'video'
  | 'file';

/** Chat object embedded in every Zalo message */
export interface ZaloChat {
  /** Unique chat/conversation identifier */
  id: string;
  /** Chat type: 'private' for 1-on-1, 'group' for group chats */
  type?: string;
  /** Chat title (group chats) */
  title?: string;
}

/** Sender / user object */
export interface ZaloUser {
  /** Unique user identifier */
  id: string;
  /** Display name */
  first_name?: string;
  /** Last name */
  last_name?: string;
  /** Username (if set) */
  username?: string;
}

/** Photo size entry */
export interface ZaloPhotoSize {
  file_id?: string;
  width: number;
  height: number;
  file_url?: string;
}

/** Incoming Zalo message payload (from webhook or polling) */
export interface ZaloMessage {
  /** Unique message identifier */
  message_id?: string;
  /** Sender user object */
  from?: ZaloUser;
  /** Chat object */
  chat?: ZaloChat;
  /** Unix timestamp */
  date?: number;
  /** Plain text content */
  text?: string;
  /** Photo sizes array */
  photo?: ZaloPhotoSize[];
  /** Sticker identifier */
  sticker?: { file_id: string };
  /** Voice message */
  voice?: { file_id: string; duration: number; file_url?: string };
  /** Caption for media messages */
  caption?: string;
}

/** Top-level webhook update envelope */
export interface ZaloUpdate {
  /** Update sequence identifier */
  update_id?: number;
  /** Embedded message (most common event) */
  message?: ZaloMessage;
}

/** Configuration options for ZaloService */
export interface ZaloServiceOptions {
  /** Bot token from Zalo developer portal */
  token: string;
  /** Whether to use long polling (dev mode) */
  polling: boolean;
}
