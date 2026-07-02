import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ZaloBot = require('node-zalo-bot');

/**
 * Low-level wrapper around the `node-zalo-bot` SDK.
 * Provides typed methods for all bot operations and handles graceful error logging.
 */
@Injectable()
export class ZaloService implements OnModuleDestroy {
  private readonly logger = new Logger(ZaloService.name);
  private readonly bot: InstanceType<typeof ZaloBot>;
  private pollingErrorCount = 0;
  private readonly POLLING_LOG_THROTTLE = 5; // only log every Nth polling error

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('ZALO_BOT_TOKEN');
    if (!token) {
      this.logger.error(
        'ZALO_BOT_TOKEN is not set. ZaloService will not initialize.',
      );
      throw new Error('ZALO_BOT_TOKEN environment variable is required');
    }

    const mode = this.configService.get<string>('ZALO_MODE', 'webhook');

    this.bot = new ZaloBot(token, {
      polling: mode === 'polling',
    });

    this.logger.log(
      `ZaloBot initialized in "${mode}" mode (token: ...${token.slice(-8)})`,
    );

    // Forward SDK-level errors to the NestJS logger (throttled to reduce noise)
    this.bot.on('polling_error', (err: Error) => {
      this.pollingErrorCount++;
      const isTimeout = err.message.includes('408') || err.message.includes('timeout');
      if (
        this.pollingErrorCount === 1 ||
        this.pollingErrorCount % this.POLLING_LOG_THROTTLE === 0
      ) {
        this.logger.warn(
          `Polling error (#${this.pollingErrorCount}): ${err.message}`,
        );
      } else if (!isTimeout) {
        // Always log non-timeout errors since they may indicate real issues
        this.logger.warn(`Polling error: ${err.message}`);
      }
    });
    this.bot.on('webhook_error', (err: Error) => {
      this.logger.warn(`Webhook error: ${err.message}`);
    });
  }

  /** Access the underlying bot instance (used by ZaloPollingService). */
  getBot(): InstanceType<typeof ZaloBot> {
    return this.bot;
  }

  /** Send a text message to a chat. */
  async sendMessage(
    chatId: string,
    text: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.bot.sendMessage(chatId, text, options);
    } catch (error) {
      this.logger.error(
        `Failed to send message to ${chatId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /** Send a sticker to a chat. */
  async sendSticker(
    chatId: string,
    stickerId: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.bot.sendSticker(chatId, stickerId, options);
    } catch (error) {
      this.logger.error(
        `Failed to send sticker to ${chatId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /** Set a chat action indicator (e.g. typing). */
  async sendChatAction(
    chatId: string,
    action: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.bot.sendChatAction(chatId, action, options);
    } catch (error) {
      this.logger.warn(
        `Failed to send chat action to ${chatId}: ${(error as Error).message}`,
      );
    }
  }

  /** Fetch bot identity information. */
  async getMe(): Promise<Record<string, unknown>> {
    try {
      return await this.bot.getMe();
    } catch (error) {
      this.logger.error(
        `Failed to get bot info: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /** Register a webhook URL with Zalo. */
  async setWebHook(
    url: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.bot.setWebHook(url, options);
      this.logger.log(`Webhook set to: ${url}`);
    } catch (error) {
      this.logger.error(
        `Failed to set webhook: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /** Delete the currently registered webhook. */
  async deleteWebHook(): Promise<void> {
    try {
      await this.bot.deleteWebHook();
      this.logger.log('Webhook deleted');
    } catch (error) {
      this.logger.warn(
        `Failed to delete webhook: ${(error as Error).message}`,
      );
    }
  }

  /** Get current webhook info. */
  async getWebHookInfo(): Promise<Record<string, unknown>> {
    try {
      return await this.bot.getWebHookInfo();
    } catch (error) {
      this.logger.warn(
        `Failed to get webhook info: ${(error as Error).message}`,
      );
      return {};
    }
  }

  /** Process a raw webhook update through the SDK (triggers event listeners). */
  processUpdate(update: unknown): void {
    this.bot.processUpdate(update);
  }

  /** Clean up on module destroy. */
  async onModuleDestroy(): Promise<void> {
    try {
      if (this.bot.isPolling()) {
        this.bot.stopPolling();
        this.logger.log('ZaloBot polling stopped');
      }
    } catch (error) {
      this.logger.warn(
        `Error stopping polling: ${(error as Error).message}`,
      );
    }
  }
}
