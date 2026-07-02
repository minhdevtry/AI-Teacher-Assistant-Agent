import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../integrations/supabase/supabase.service';

/** Result of checking whether a message is an approval response. */
export interface ApprovalCheckResult {
  isApproval: boolean;
  approvalStatus?: 'approved' | 'rejected';
  channelEventCode?: string;
}

/** Positive / negative response keywords (Vietnamese + English). */
const APPROVE_KEYWORDS = new Set([
  'ok',
  'duyệt',
  'duyet',
  'đồng ý',
  'dong y',
  'xác nhận',
  'xac nhan',
  'đồng',
  'yes',
  'y',
  'đúng',
  'dung',
]);

const REJECT_KEYWORDS = new Set([
  'hủy',
  'huy',
  'từ chối',
  'tu choi',
  'không',
  'khong',
  'no',
  'n',
  'sai',
  'cancel',
]);

/**
 * Handles human-in-the-loop approval flows for agent actions.
 *
 * When an agent creates a payment draft (or any action requiring confirmation),
 * the ApprovalService records the pending approval in the ChannelEvent table.
 * Subsequent messages from the same sender are checked against known approval
 * keywords to determine whether the user approved or rejected the action.
 *
 * This service is a building block for Task 8 (suspend/resume workflows).
 */
@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Determine whether a message is an approval response for a pending action.
   *
   * Looks up the most recent pending approval ChannelEvent for the sender
   * and matches the message content against known approval/rejection keywords.
   */
  async checkApproval(
    senderId: string,
    content: string,
  ): Promise<ApprovalCheckResult> {
    const normalised = content.trim().toLowerCase();

    // Quick exit — not a recognisable approval/rejection keyword
    const isApprove = APPROVE_KEYWORDS.has(normalised);
    const isReject = REJECT_KEYWORDS.has(normalised);

    if (!isApprove && !isReject) {
      return { isApproval: false };
    }

    // Find the most recent pending approval for this sender
    const client = this.supabaseService.getClient();
    const { data: pendingEvent } = await client
      .from('ChannelEvent')
      .select('Code, ExpiresAt')
      .eq('SenderId', senderId)
      .eq('ApprovalStatus', 'pending')
      .order('Id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pendingEvent) {
      return { isApproval: false };
    }

    // Check expiration
    if (pendingEvent.ExpiresAt && new Date(pendingEvent.ExpiresAt) < new Date()) {
      this.logger.log(`Approval ${pendingEvent.Code} has expired`);
      await this.markExpired(pendingEvent.Code);
      return { isApproval: false };
    }

    return {
      isApproval: true,
      approvalStatus: isApprove ? 'approved' : 'rejected',
      channelEventCode: pendingEvent.Code,
    };
  }

  /**
   * Create a new pending-approval record on an existing ChannelEvent.
   *
   * Called by the agent router (or a workflow step) when human approval is
   * required before proceeding.
   */
  async createApproval(
    eventCode: string,
    summary: string,
    action: string,
    expiresAt: Date,
  ): Promise<void> {
    const client = this.supabaseService.getClient();

    await client
      .from('ChannelEvent')
      .update({
        ApprovalStatus: 'pending',
        ApprovalSummary: summary.slice(0, 1000),
        ApprovalAction: action.slice(0, 32),
        ExpiresAt: expiresAt.toISOString(),
      })
      .eq('Code', eventCode);

    this.logger.log(
      `Approval created for ${eventCode}: "${action}" — expires ${expiresAt.toISOString()}`,
    );
  }

  /**
   * Process an approval decision — update the ChannelEvent status.
   *
   * In Task 8 this will also resume a suspended Mastra workflow.
   */
  async processApproval(
    channelEventCode: string,
    approved: boolean,
  ): Promise<void> {
    const client = this.supabaseService.getClient();

    await client
      .from('ChannelEvent')
      .update({
        ApprovalStatus: approved ? 'approved' : 'rejected',
        ApprovedAt: new Date().toISOString(),
      })
      .eq('Code', channelEventCode);

    this.logger.log(
      `Approval ${approved ? 'granted' : 'rejected'} for ${channelEventCode}`,
    );

    // TODO (Task 8): Resume suspended Mastra workflow with approval result
  }

  /** Mark an expired approval so it is no longer considered pending. */
  private async markExpired(code: string): Promise<void> {
    const client = this.supabaseService.getClient();
    await client
      .from('ChannelEvent')
      .update({ ApprovalStatus: 'expired' })
      .eq('Code', code);
  }
}
