import { Injectable, Logger } from '@nestjs/common';
import { MastraService } from './mastra.service';
import { ApprovalService } from './approval.service';
import { AuditService } from '../domain/common/audit.service';
import type { ChannelEvent } from '../channels/common/channel-event';
import type { Workflow } from '@mastra/core/workflows';

/**
 * Triggers Mastra workflows from NestJS services.
 *
 * Workflows are started here (NOT from agent tools) to work around
 * Mastra issue #11015 where tool-initiated workflow runs lose context.
 */
@Injectable()
export class WorkflowTriggerService {
  private readonly logger = new Logger(WorkflowTriggerService.name);

  constructor(
    private readonly mastraService: MastraService,
    private readonly approvalService: ApprovalService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Trigger the record-payment-from-text workflow.
   * Returns the result text (or error message).
   */
  async triggerRecordPaymentFromText(
    event: ChannelEvent,
    content: string,
    eventCode: string,
  ): Promise<string> {
    this.logger.log(`Triggering record-payment-from-text for ${event.senderId}`);

    try {
      const workflow = this.mastraService.getWorkflow('record-payment-from-text') as Workflow;
      const run = await workflow.createRun();

      const result = await run.start({
        inputData: {
          rawText: content,
          senderId: event.senderId,
          senderName: event.senderName,
          platform: event.platform,
          eventCode,
        },
      });

      return this.extractResultText(result, 'record-payment-from-text');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`record-payment-from-text failed: ${msg}`);
      return `❌ Lỗi khi xử lý thanh toán: ${msg}`;
    }
  }

  /**
   * Trigger the record-payment-from-bill workflow.
   */
  async triggerRecordPaymentFromBill(
    event: ChannelEvent,
    imageUrl: string,
    eventCode: string,
  ): Promise<string> {
    this.logger.log(`Triggering record-payment-from-bill for ${event.senderId}`);

    try {
      const workflow = this.mastraService.getWorkflow('record-payment-from-bill') as Workflow;
      const run = await workflow.createRun();

      const result = await run.start({
        inputData: {
          imageUrl,
          senderId: event.senderId,
          senderName: event.senderName,
          platform: event.platform,
          eventCode,
        },
      });

      return this.extractResultText(result, 'record-payment-from-bill');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`record-payment-from-bill failed: ${msg}`);
      return `❌ Lỗi khi xử lý hóa đơn: ${msg}`;
    }
  }

  /**
   * Trigger the fee-question-answer workflow.
   */
  async triggerFeeQuestionAnswer(
    event: ChannelEvent,
    question: string,
    eventCode: string,
  ): Promise<string> {
    this.logger.log(`Triggering fee-question-answer for ${event.senderId}`);

    try {
      const workflow = this.mastraService.getWorkflow('fee-question-answer') as Workflow;
      const run = await workflow.createRun();

      const result = await run.start({
        inputData: {
          question,
          senderId: event.senderId,
          senderName: event.senderName,
          platform: event.platform,
          eventCode,
        },
      });

      return this.extractAnswer(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`fee-question-answer failed: ${msg}`);
      return `❌ Lỗi khi tra cứu học phí: ${msg}`;
    }
  }

  /**
   * Trigger the generate-reminder workflow.
   */
  async triggerGenerateReminder(
    classCode: string,
    billingMonth: string,
    senderId?: string,
    eventCode?: string,
  ): Promise<string> {
    this.logger.log(`Triggering generate-reminder for class ${classCode}`);

    try {
      const workflow = this.mastraService.getWorkflow('generate-reminder') as Workflow;
      const run = await workflow.createRun();

      const result = await run.start({
        inputData: {
          classCode,
          billingMonth,
          senderId: senderId ?? 'system',
          senderName: 'System',
          platform: 'web',
          eventCode: eventCode ?? `reminder-${Date.now()}`,
        },
      });

      return this.extractResultText(result, 'generate-reminder');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`generate-reminder failed: ${msg}`);
      return `❌ Lỗi khi tạo nhắc nhở: ${msg}`;
    }
  }

  /**
   * Resume a suspended workflow with the approval result.
   */
  async resumeWorkflow(
    workflowRunId: string,
    approvalResult: 'approved' | 'rejected',
    workflowId: string = 'record-payment-from-text',
  ): Promise<string> {
    this.logger.log(
      `Resuming workflow ${workflowId} run ${workflowRunId} with ${approvalResult}`,
    );

    try {
      const workflow = this.mastraService.getWorkflow(workflowId) as Workflow;

      // Get the existing run to resume it
      const run = await workflow.createRun({ runId: workflowRunId });
      const result = await run.resume({
        resumeData: { approvalStatus: approvalResult },
        label: 'approval-response',
      });

      return this.extractResultText(result, workflowId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Resume workflow failed: ${msg}`);
      return `❌ Lỗi khi tiếp tục workflow: ${msg}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract the resultText from the last step's output in a workflow run result.
   */
  private extractResultText(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: any,
    workflowId: string,
  ): string {
    if (!result || !result.steps) {
      this.logger.warn(`Workflow ${workflowId} returned no steps`);
      return `⚠️ Workflow ${workflowId} không trả về kết quả.`;
    }

    // Find the last completed step with a resultText
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stepEntries = Object.entries(result.steps) as [string, any][];
    for (let i = stepEntries.length - 1; i >= 0; i--) {
      const [, stepResult] = stepEntries[i];
      if (stepResult.output && typeof stepResult.output.resultText === 'string') {
        return stepResult.output.resultText;
      }
    }

    // Fallback: check for answer field (fee-qa)
    for (let i = stepEntries.length - 1; i >= 0; i--) {
      const [, stepResult] = stepEntries[i];
      if (stepResult.output && typeof stepResult.output.answer === 'string') {
        return stepResult.output.answer;
      }
    }

    // Check if workflow is suspended
    if (result.status === 'suspended') {
      return '⏳ Đang chờ xác nhận từ giáo viên. Vui lòng trả lời "ok" hoặc "hủy".';
    }

    return `⚠️ Workflow ${workflowId} hoàn thành nhưng không có kết quả.`;
  }

  /**
   * Extract the answer field from a fee-qa workflow result.
   */
  private extractAnswer(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: any,
  ): string {
    if (!result || !result.steps) {
      return '⚠️ Không có kết quả tra cứu.';
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stepEntries = Object.entries(result.steps) as [string, any][];
    for (let i = stepEntries.length - 1; i >= 0; i--) {
      const [, stepResult] = stepEntries[i];
      if (stepResult.output && typeof stepResult.output.answer === 'string') {
        return stepResult.output.answer;
      }
    }

    return this.extractResultText(result, 'fee-question-answer');
  }
}
