import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiHeader } from '@nestjs/swagger';
import { ZaloAdapter } from './zalo.adapter';
import { ZaloService } from './zalo.service';
import { ConfigService } from '@nestjs/config';
import { AgentRouterService } from '../../mastra/agent-router.service';
import { ApprovalService } from '../../mastra/approval.service';

/**
 * Webhook controller for receiving Zalo Bot events.
 * Endpoint: POST /webhook/zalo
 *
 * Incoming messages flow through:
 *  1. Secret verification
 *  2. SDK processing (polling compatibility)
 *  3. Event normalisation
 *  4. Approval check (human-in-the-loop responses)
 *  5. Agent routing (AI classification + response generation)
 *  6. Response delivery via Zalo Bot API
 */
@ApiTags('Zalo Webhook')
@Controller('webhook/zalo')
export class ZaloController {
  private readonly logger = new Logger(ZaloController.name);

  constructor(
    private readonly zaloAdapter: ZaloAdapter,
    private readonly zaloService: ZaloService,
    private readonly configService: ConfigService,
    private readonly agentRouter: AgentRouterService,
    private readonly approvalService: ApprovalService,
  ) {}

  /**
   * Receive incoming webhook events from Zalo.
   * Validates the secret token header if ZALO_WEBHOOK_SECRET is configured.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive Zalo webhook events',
    description:
      'Processes incoming webhook events from the Zalo Bot platform. ' +
      'Events are normalized, classified by AI, and routed to the appropriate ' +
      'agent (Orchestrator or Billing). Responses are sent back via Zalo.',
  })
  @ApiHeader({
    name: 'x-bot-api-secret-token',
    required: false,
    description: 'Secret token for webhook verification (if configured)',
  })
  @ApiResponse({
    status: 200,
    description: 'Event processed successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Invalid webhook secret token',
  })
  async handleWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('x-bot-api-secret-token') secretToken?: string,
  ): Promise<{ ok: boolean }> {
    // Verify webhook secret if configured
    const expectedSecret = this.configService.get<string>(
      'ZALO_WEBHOOK_SECRET',
    );
    if (expectedSecret && secretToken !== expectedSecret) {
      this.logger.warn('Unauthorized webhook request — invalid secret token');
      return { ok: false };
    }

    // Process the update through the SDK (triggers event listeners for polling mode too)
    this.zaloService.processUpdate(payload);

    // Normalize the event for downstream consumption
    const event = this.zaloAdapter.normalizeEvent(payload);

    this.logger.log(
      `Webhook received: ${event.eventType} from ${event.senderName} (${event.senderId})`,
    );

    // Skip non-text events (stickers, etc.) — agents handle text
    if (event.eventType !== 'message.text' && event.eventType !== 'message.image') {
      this.logger.log(`Skipping non-processable event type: ${event.eventType}`);
      return { ok: true };
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
            `Approval processed: ${approvalResult.channelEventCode} → ${approvalResult.approvalStatus}`,
          );
          return { ok: true };
        }
      }

      // Route to the appropriate agent
      const response = await this.agentRouter.route(event);

      // Send response back via Zalo
      await this.zaloAdapter.sendResponse(response);

      this.logger.log(
        `Response sent to ${event.senderId} (${response.content.length} chars)`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to process webhook for ${event.senderId}: ${message}`,
      );

      // Attempt to send error notification to the user
      try {
        await this.zaloAdapter.sendResponse({
          platform: event.platform,
          recipientId: event.senderId,
          content:
            '❌ Xin lỗi, đã có lỗi xảy ra khi xử lý tin nhắn. Vui lòng thử lại sau.',
        });
      } catch {
        this.logger.error(
          `Failed to send error notification to ${event.senderId}`,
        );
      }
    }

    return { ok: true };
  }
}
