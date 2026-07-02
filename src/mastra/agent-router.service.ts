import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../integrations/supabase/supabase.service';
import { AuditService } from '../domain/common/audit.service';
import { MastraService } from './mastra.service';
import { ApprovalService } from './approval.service';
import { WorkflowTriggerService } from './workflow-trigger.service';
import type { ChannelEvent } from '../channels/common/channel-event';
import type { ChannelResponse } from '../channels/common/channel-response';
import { CodeGenerator } from '../domain/common/code-generator';

/** Recognized intent categories for agent routing. */
export type Intent =
  | 'record_payment'
  | 'fee_query'
  | 'check_balance'
  | 'debt_list'
  | 'monthly_report'
  | 'reminder'
  | 'payment_confirm'
  | 'invoice'
  | 'manage_student'
  | 'manage_class'
  | 'greeting'
  | 'other';

/** Default timeout for agent generation (3 minutes — accommodates slow local LLM with multiple tool calls). */
const AGENT_TIMEOUT_MS = 180_000;

/**
 * Routes incoming ChannelEvents to the appropriate Mastra agent.
 *
 * Flow:
 *  1. Persist the ChannelEvent to Supabase.
 *  2. Check for approval responses (human-in-the-loop).
 *  3. Route workflow-triggering intents (record_payment, fee_query) via NestJS.
 *  4. Route everything else to OrchestratorAgent (handles classification + billing internally).
 *  5. Persist the agent response and return a ChannelResponse.
 */
@Injectable()
export class AgentRouterService {
  private readonly logger = new Logger(AgentRouterService.name);

  constructor(
    private readonly mastraService: MastraService,
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
    private readonly approvalService: ApprovalService,
    private readonly workflowTriggerService: WorkflowTriggerService,
  ) {}

  /**
   * Main entry point — route a ChannelEvent to the correct agent and
   * return a ChannelResponse ready to send back through the adapter.
   */
  async route(event: ChannelEvent): Promise<ChannelResponse> {
    // Step 1: Persist the inbound event
    const eventCode = await this.saveChannelEvent(event);

    try {
      // Step 1b: Check if this is an approval response for a pending action
      if (event.content) {
        const approvalResult = await this.approvalService.checkApproval(
          event.senderId,
          event.content,
        );
        if (approvalResult.isApproval && approvalResult.channelEventCode) {
          return this.handleApprovalResponse(
            event,
            eventCode,
            approvalResult.approvalStatus!,
            approvalResult.channelEventCode,
          );
        }
      }

      // Step 2: AI-driven intent classification + agent/workflow execution
      const { intent, text } = await this.classifyAndGenerate(event, eventCode);

      // Step 3: Persist the result
      await this.updateResult(eventCode, intent, text);

      // Step 4: Audit log
      await this.auditService.log({
        EntityType: 'ChannelEvent',
        EntityCode: eventCode,
        Action: 'agent_response',
        ActorType: 'agent',
        ActorDetail: intent,
      });

      // Step 5: Build the response
      return this.buildResponse(event, text);
    } catch (error) {
      return this.handleError(event, eventCode, error);
    }
  }

  /**
   * Handle an approval response from the teacher.
   * Resumes the suspended workflow with the approval decision.
   */
  private async handleApprovalResponse(
    event: ChannelEvent,
    eventCode: string,
    approvalStatus: 'approved' | 'rejected',
    channelEventCode: string,
  ): Promise<ChannelResponse> {
    try {
      // Resume the workflow with the approval result
      const result = await this.workflowTriggerService.resumeWorkflow(
        channelEventCode,
        approvalStatus,
      );

      await this.updateResult(eventCode, 'record_payment', result);
      await this.auditService.log({
        EntityType: 'ChannelEvent',
        EntityCode: eventCode,
        Action: 'approval_response',
        ActorType: 'teacher',
        ActorDetail: approvalStatus,
      });

      return this.buildResponse(event, result);
    } catch (error) {
      return this.handleError(event, eventCode, error);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Route the user message directly to the OrchestratorAgent.
   *
   * The OrchestratorAgent handles intent classification internally via its
   * system prompt and delegates billing tasks to its BillingAgent subagent.
   * This eliminates the separate classifyIntent() LLM round-trip (~14s saved).
   *
   * Workflows (record_payment, fee_query) are still triggered explicitly
   * because they require NestJS-initiated suspend/resume (Mastra limitation).
   */
  private async classifyAndGenerate(
    event: ChannelEvent,
    eventCode: string,
  ): Promise<{ intent: Intent; text: string }> {
    const threadId = this.getThreadId(event);
    const resourceId = event.senderId;

    // Check for workflow-triggering patterns (no LLM call — simple heuristic)
    // These workflows MUST be triggered from NestJS, not from agent tools.
    const lowerContent = (event.content || '').toLowerCase();

    // record_payment: image → recordPaymentFromBill workflow
    if (event.mediaUrl && event.eventType === 'message.image') {
      const hasPaymentKeywords = /thanh toán|thu tiền|đóng tiền|nộp tiền|trả tiền|ghi nhận/.test(lowerContent);
      if (hasPaymentKeywords) {
        const text = await this.workflowTriggerService.triggerRecordPaymentFromBill(
          event, event.mediaUrl, eventCode,
        );
        return { intent: 'record_payment', text };
      }
    }

    // record_payment: text → recordPaymentFromText workflow
    if (/^(ghi nhận|thu tiền|đóng tiền|nộp tiền|thanh toán|nhận tiền)/i.test(lowerContent.trim())) {
      const text = await this.workflowTriggerService.triggerRecordPaymentFromText(
        event, event.content, eventCode,
      );
      return { intent: 'record_payment', text };
    }

    // fee_query → feeQuestionAnswer workflow
    if (/^(học phí|bảng giá|mức phí|phí học|tiền học)/i.test(lowerContent.trim())) {
      const text = await this.workflowTriggerService.triggerFeeQuestionAnswer(
        event, event.content, eventCode,
      );
      return { intent: 'fee_query', text };
    }

    // Everything else → OrchestratorAgent (handles classification + billing delegation internally)
    this.logger.log(`Routing to OrchestratorAgent for sender=${event.senderId}`);
    const text = await this.invokeOrchestratorAgent(event, threadId, resourceId);
    return { intent: 'other', text };
  }

  /** Invoke the OrchestratorAgent with the original user message. */
  private async invokeOrchestratorAgent(
    event: ChannelEvent,
    threadId: string,
    resourceId: string,
  ): Promise<string> {
    const agent = this.mastraService.getAgent('orchestrator');
    const result = await this.withTimeout(
      agent.generate(this.buildPrompt(event), {
        threadId,
        resourceId,
        maxSteps: 5,
      } as any), // eslint-disable-line @typescript-eslint/no-explicit-any
      AGENT_TIMEOUT_MS,
    );
    const text = this.extractResponseText(result);
    this.logger.log(
      `OrchestratorAgent response length=${text.length}, raw keys=[${Object.keys(result).join(', ')}]`,
    );
    if (!text) {
      this.logger.warn(
        `OrchestratorAgent returned empty text. Raw result snippet: ${JSON.stringify(result).slice(0, 500)}`,
      );
    }
    return text;
  }

  /** Invoke the BillingAgent with the original user message. */
  private async invokeBillingAgent(
    event: ChannelEvent,
    threadId: string,
    resourceId: string,
  ): Promise<string> {
    const agent = this.mastraService.getAgent('billing');
    const result = await this.withTimeout(
      agent.generate(this.buildPrompt(event), {
        threadId: `billing-${threadId}`,
        resourceId,
        maxSteps: 5,
      } as any), // eslint-disable-line @typescript-eslint/no-explicit-any
      AGENT_TIMEOUT_MS,
    );
    return this.extractResponseText(result);
  }

  /** Build a contextual prompt from the ChannelEvent. */
  private buildPrompt(event: ChannelEvent): string {
    const parts = [`Tin nhắn từ ${event.senderName} (${event.senderId}):`];
    if (event.content) parts.push(event.content);
    if (event.mediaUrl) parts.push(`[Đính kèm: ${event.mediaUrl}]`);
    return parts.join('\n');
  }

  /** Derive a stable thread ID from the sender for conversation memory. */
  private getThreadId(event: ChannelEvent): string {
    return `${event.platform}-${event.senderId}`;
  }

  // ---------------------------------------------------------------------------
  // Database helpers
  // ---------------------------------------------------------------------------

  /** Persist a new ChannelEvent row and return the generated Code. */
  private async saveChannelEvent(event: ChannelEvent): Promise<string> {
    const client = this.supabaseService.getClient();

    const { data: maxRow } = await client
      .from('ChannelEvent')
      .select('Code')
      .like('Code', 'CE%')
      .order('Id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const code = CodeGenerator.generate('CE', maxRow?.Code ?? null);

    await client.from('ChannelEvent').insert({
      Name: `${event.eventType} from ${event.senderName}`,
      Code: code,
      Description: `Incoming ${event.eventType} event`,
      Platform: event.platform,
      SenderId: event.senderId,
      SenderName: event.senderName,
      EventType: event.eventType,
      Content: event.content || null,
      MediaUrl: event.mediaUrl ?? null,
      RawPayload: JSON.stringify(event.rawPayload),
    });

    this.logger.debug(`Saved ChannelEvent ${code}`);
    return code;
  }

  /** Update the ChannelEvent with intent and result text. */
  private async updateResult(
    code: string,
    intent: Intent,
    resultText: string,
  ): Promise<void> {
    const client = this.supabaseService.getClient();
    await client
      .from('ChannelEvent')
      .update({
        Intent: intent,
        ResultText: resultText.slice(0, 2000), // respect column limit
      })
      .eq('Code', code);
  }

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  /** Handle agent execution errors gracefully. */
  private handleError(
    event: ChannelEvent,
    eventCode: string,
    error: unknown,
  ): ChannelResponse {
    const message =
      error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('timeout')) {
      this.logger.warn(
        `Agent timeout for event ${eventCode} from ${event.senderId}`,
      );
      return this.buildResponse(
        event,
        '⏳ Xin lỗi, tôi cần thêm thời gian để xử lý. Vui lòng thử lại.',
      );
    }

    this.logger.error(
      `Agent error for event ${eventCode}: ${message}`,
    );

    return this.buildResponse(
      event,
      '❌ Xin lỗi, đã có lỗi xảy ra khi xử lý yêu cầu. Vui lòng thử lại sau.',
    );
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /** Build a ChannelResponse targeting the event sender. */
  private buildResponse(event: ChannelEvent, content: string): ChannelResponse {
    // Strip <think> blocks from reasoning models (Qwen, etc.) — supports multiline
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Handle unclosed <think> tags (strip everything from <think> to end)
    content = content.replace(/<think>[\s\S]*$/gi, '').trim();

    // Detect if content contains markdown formatting
    const hasMarkdown = /[*_~`#>\-+]|^\d+\.|\{(?:red|green|orange|yellow|big|underline)\}/m.test(content);

    return {
      platform: event.platform,
      recipientId: event.senderId,
      content,
      parseMode: hasMarkdown ? 'markdown' : undefined,
    };
  }

  /**
   * Robustly extract the text from a Mastra agent generate() result.
   * When tools are called, the response text may live in different paths
   * depending on the provider and Mastra version.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractResponseText(result: any): string {
    // Log all top-level keys for debugging
    const keys = Object.keys(result || {});
    this.logger.debug(`extractResponseText: top-level keys=[${keys.join(', ')}]`);

    // --- Helper: extract text from a messages array (last assistant msg) ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractFromMessages = (messages: any[]): string | null => {
      if (!Array.isArray(messages)) return null;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg?.role !== 'assistant') continue;
        const content = msg?.content;
        if (typeof content === 'string' && content.length > 0) return content;
        if (Array.isArray(content)) {
          const textParts = content
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((p: any) => p?.type === 'text' && p?.text)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((p: any) => p.text);
          if (textParts.length > 0) return textParts.join('\n');
        }
      }
      return null;
    };

    // 1. Primary path: FullOutput.text (works when no tools are called)
    if (typeof result?.text === 'string' && result.text.length > 0) {
      return result.text;
    }

    // 2. Check response.messages (AI SDK v4/v5 raw response)
    const fromMessages = extractFromMessages(result?.response?.messages);
    if (fromMessages) return fromMessages;

    // 3. Check steps array — when tools are called, each step may have text
    if (Array.isArray(result?.steps)) {
      for (let i = result.steps.length - 1; i >= 0; i--) {
        const step = result.steps[i];
        if (typeof step?.text === 'string' && step.text.length > 0) {
          return step.text;
        }
        // Step may contain its own response.messages
        const fromStepMsgs = extractFromMessages(step?.response?.messages);
        if (fromStepMsgs) return fromStepMsgs;
      }
    }

    // 4. Check response.body.output (some providers nest text here)
    try {
      const bodyOutput = result?.response?.body?.output;
      if (Array.isArray(bodyOutput)) {
        for (let i = bodyOutput.length - 1; i >= 0; i--) {
          const item = bodyOutput[i];
          if (item?.role === 'assistant') {
            if (typeof item?.content === 'string') return item.content;
            if (Array.isArray(item?.content)) {
              const texts = item.content
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .filter((p: any) => p?.type === 'text')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((p: any) => p.text)
                .filter(Boolean);
              if (texts.length > 0) return texts.join('\n');
            }
          }
        }
      }
    } catch {
      // ignore
    }

    // 5. Fallback: reasoningText (reasoning models)
    if (typeof result?.reasoningText === 'string' && result.reasoningText.length > 0) {
      return result.reasoningText;
    }

    // 6. Last resort: log and return fallback message
    this.logger.warn(
      `Could not extract text from agent result. Keys: [${keys.join(', ')}]. ` +
      `Snippet: ${JSON.stringify(result).slice(0, 1000)}`,
    );
    return 'Xin lỗi, tôi không thể xử lý yêu cầu này. Vui lòng thử lại.';
  }

  /** Wrap a promise with a timeout guard. */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Agent execution timeout after ${ms}ms`)),
        ms,
      );
      promise
        .then((val) => {
          clearTimeout(timer);
          resolve(val);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
