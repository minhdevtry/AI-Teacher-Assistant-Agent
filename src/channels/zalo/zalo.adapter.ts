import { Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter, ChannelEvent, ChannelResponse } from '../common';
import { ZaloService } from './zalo.service';
import { ZaloUpdate } from './zalo.types';

/**
 * Zalo-specific channel adapter.
 * Converts Zalo webhook payloads into normalized ChannelEvents
 * and sends ChannelResponses through the Zalo Bot API.
 */
@Injectable()
export class ZaloAdapter extends ChannelAdapter {
  private readonly logger = new Logger(ZaloAdapter.name);

  constructor(private readonly zaloService: ZaloService) {
    super();
  }

  /**
   * Transform a raw Zalo webhook update into a normalized ChannelEvent.
   */
  normalizeEvent(rawEvent: unknown): ChannelEvent {
    const update = rawEvent as ZaloUpdate;
    const message = update.message;

    if (!message) {
      this.logger.warn('Received webhook update without a message field');
      return {
        platform: 'zalo',
        senderId: 'unknown',
        senderName: 'Unknown',
        eventType: 'message.text',
        content: '',
        rawPayload: rawEvent,
        timestamp: new Date(),
      };
    }

    const senderId = message.chat?.id ?? message.from?.id ?? 'unknown';
    const senderName = [message.from?.first_name, message.from?.last_name]
      .filter(Boolean)
      .join(' ') || 'Unknown';

    let eventType: ChannelEvent['eventType'] = 'message.text';
    let content = message.text ?? '';
    let mediaUrl: string | undefined;

    if (message.photo && message.photo.length > 0) {
      eventType = 'message.image';
      // Use the largest available photo
      const largestPhoto = message.photo.reduce((prev, curr) =>
        (curr.width * curr.height) > (prev.width * prev.height) ? curr : prev,
      );
      mediaUrl = largestPhoto.file_url;
      content = message.caption ?? '';
    } else if (message.voice) {
      eventType = 'message.voice';
      mediaUrl = message.voice.file_url;
    } else if (message.sticker) {
      eventType = 'message.sticker';
    }

    const event: ChannelEvent = {
      platform: 'zalo',
      senderId,
      senderName,
      eventType,
      content,
      mediaUrl,
      rawPayload: rawEvent,
      timestamp: message.date
        ? new Date(message.date * 1000)
        : new Date(),
    };

    this.logger.debug(
      `Normalized event: ${event.eventType} from ${event.senderName} (${event.senderId})`,
    );

    return event;
  }

  /**
   * Send a normalized response through the Zalo Bot API.
   * Converts unsupported markdown (tables) to Zalo-friendly alternatives.
   */
  async sendResponse(response: ChannelResponse): Promise<void> {
    const { recipientId, content, mediaUrl, parseMode } = response;

    // Send text content with optional parse_mode for rich text
    if (content) {
      // Convert markdown tables to bullet lists (Zalo doesn't support tables)
      const processedContent = parseMode
        ? this.convertMarkdownTables(content)
        : content;

      const options: Record<string, unknown> = {};
      if (parseMode) {
        options.parse_mode = parseMode;
      }
      await this.zaloService.sendMessage(recipientId, processedContent, options);
    }

    // If there is a media URL, log a note (photo sending requires file upload API)
    if (mediaUrl) {
      this.logger.warn(
        `Media URL provided but Zalo Bot SDK photo upload is not yet implemented. URL: ${mediaUrl}`,
      );
    }

    // Buttons are not natively supported by Zalo Bot API yet
    if (response.buttons && response.buttons.length > 0) {
      this.logger.warn(
        'Button responses are not yet supported by the Zalo Bot API.',
      );
    }
  }

  /**
   * Convert markdown tables to bullet lists for Zalo display.
   * Zalo Bot API does not render markdown tables; this transforms them into
   * readable key-value bullet lists using the header row as keys.
   *
   * Example:
   * | Name | Amount |
   * |------|--------|
   * | Alice | 100    |
   * | Bob   | 200    |
   *
   * Becomes:
   * - Alice: 100
   * - Bob: 200
   */
  private convertMarkdownTables(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      // Detect table header: a line with at least 2 pipe-delimited cells
      const headerLine = lines[i];
      const separatorLine = lines[i + 1];

      if (
        headerLine &&
        separatorLine &&
        this.isTableRow(headerLine) &&
        this.isTableSeparator(separatorLine)
      ) {
        // Parse header cells
        const headers = this.parseTableRow(headerLine);
        i += 2; // skip header + separator

        // Convert each data row to a bullet
        while (i < lines.length && this.isTableRow(lines[i])) {
          const cells = this.parseTableRow(lines[i]);
          const pairs: string[] = [];
          for (let c = 0; c < cells.length; c++) {
            const key = headers[c] || `Col${c + 1}`;
            pairs.push(`**${key}**: ${cells[c]}`);
          }
          result.push(`- ${pairs.join(', ')}`);
          i++;
        }
        result.push(''); // blank line after table
      } else {
        result.push(lines[i]);
        i++;
      }
    }

    return result.join('\n');
  }

  /** Check if a line is a markdown table row (starts and ends with |). */
  private isTableRow(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1;
  }

  /** Check if a line is a markdown table separator (e.g. |---|---|). */
  private isTableSeparator(line: string): boolean {
    return /^\|[\s\-:|]+\|$/.test(line.trim());
  }

  /** Parse a markdown table row into an array of cell strings. */
  private parseTableRow(line: string): string[] {
    const trimmed = line.trim();
    // Remove leading/trailing pipes, then split by pipe
    return trimmed
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());
  }

  /** Platform identifier */
  getPlatform(): string {
    return 'zalo';
  }
}
