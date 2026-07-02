import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZaloService } from './zalo.service';
import { ZaloAdapter } from './zalo.adapter';
import { AgentRouterService } from '../../mastra/agent-router.service';
import { ApprovalService } from '../../mastra/approval.service';

/**
 * Polling service for development mode.
 * Only starts when ZALO_MODE=polling.
 * Listens to incoming messages via long polling and routes them through
 * the AI agent pipeline (approval check → agent routing → response).
 */
@Injectable()
export class ZaloPollingService implements OnModuleInit {
  private readonly logger = new Logger(ZaloPollingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly zaloService: ZaloService,
    private readonly zaloAdapter: ZaloAdapter,
    private readonly agentRouter: AgentRouterService,
    private readonly approvalService: ApprovalService,
  ) {}

  onModuleInit(): void {
    const mode = this.configService.get<string>('ZALO_MODE', 'webhook');

    if (mode !== 'polling') {
      this.logger.log('ZALO_MODE is not "polling" — skipping polling setup.');
      return;
    }

    this.logger.log('Starting Zalo long polling for development...');

    const bot = this.zaloService.getBot();

    // Listen to all messages — mirror the webhook controller's full pipeline
    bot.on('message', async (msg: Record<string, unknown>) => {
      const event = this.zaloAdapter.normalizeEvent({ message: msg });
      this.logger.log(
        `[Polling] ${event.eventType} from ${event.senderName} (${event.senderId}): ${event.content || '(media)'}`,
      );

      // Skip non-text/non-image events (stickers, etc.)
      if (
        event.eventType !== 'message.text' &&
        event.eventType !== 'message.image'
      ) {
        this.logger.log(
          `Skipping non-processable event type: ${event.eventType}`,
        );
        return;
      }

      try {
        // Check if this is an approval response (e.g., "ok", "duyệt", "hủy")
        if (event.content) {
          const approvalResult = await this.approvalService.checkApproval(
            event.senderId,
            event.content,
          );

          if (approvalResult.isApproval && approvalResult.channelEventCode) {
            const approved = approvalResult.approvalStatus === 'approved';
            await this.approvalService.processApproval(
              approvalResult.channelEventCode,
              approved,
            );

            const confirmationText = approved
              ? '✅ Đã xác nhận. Thao tác đã được phê duyệt.'
              : '❌ Đã từ chối. Thao tác đã bị huỷ.';

            await this.zaloAdapter.sendResponse({
              platform: event.platform,
              recipientId: event.senderId,
              content: confirmationText,
            });

            this.logger.log(
              `[Polling] Approval processed: ${approvalResult.channelEventCode} → ${approvalResult.approvalStatus}`,
            );
            return;
          }
        }

        // Route through the AI agent pipeline
        const response = await this.agentRouter.route(event);

        // Send response back via Zalo
        await this.zaloAdapter.sendResponse(response);

        this.logger.log(
          `[Polling] Response sent to ${event.senderId} (${response.content.length} chars)`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `[Polling] Message processing error for ${event.senderId}: ${message}`,
        );

        // Send error notification to the user
        try {
          await this.zaloAdapter.sendResponse({
            platform: event.platform,
            recipientId: event.senderId,
            content:
              '❌ Xin lỗi, đã có lỗi xảy ra khi xử lý tin nhắn. Vui lòng thử lại sau.',
          });
        } catch {
          this.logger.error(
            `[Polling] Failed to send error notification to ${event.senderId}`,
          );
        }
      }
    });

    this.logger.log('Zalo polling listeners registered.');
  }
}
