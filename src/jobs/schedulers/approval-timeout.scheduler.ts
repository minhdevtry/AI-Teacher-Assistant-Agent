import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../integrations/supabase/supabase.service';

/**
 * Cron job that runs every hour to check for expired approval requests.
 *
 * When an approval is created, an ExpiresAt timestamp is set on the ChannelEvent.
 * This scheduler finds pending approvals past their expiration and marks them
 * as 'expired' so they are no longer matched against incoming messages.
 */
@Injectable()
export class ApprovalTimeoutScheduler {
  private readonly logger = new Logger(ApprovalTimeoutScheduler.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Check for expired approvals every hour and mark them.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkExpiredApprovals(): Promise<void> {
    this.logger.debug('Checking for expired approvals...');

    try {
      const client = this.supabaseService.getClient();
      const now = new Date().toISOString();

      // Find all pending approvals that have expired
      const { data: expired, error } = await client
        .from('ChannelEvent')
        .select('Code, ExpiresAt')
        .eq('ApprovalStatus', 'pending')
        .lt('ExpiresAt', now);

      if (error) {
        this.logger.error(`Failed to query expired approvals: ${error.message}`);
        return;
      }

      if (!expired || expired.length === 0) {
        this.logger.debug('No expired approvals found.');
        return;
      }

      // Mark them as expired
      const codes = expired.map((row: { Code: string }) => row.Code);

      const { error: updateError } = await client
        .from('ChannelEvent')
        .update({ ApprovalStatus: 'expired' })
        .in('Code', codes);

      if (updateError) {
        this.logger.error(`Failed to mark expired approvals: ${updateError.message}`);
        return;
      }

      this.logger.log(
        `Marked ${codes.length} approval(s) as expired: ${codes.join(', ')}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Approval timeout check failed: ${msg}`);
    }
  }
}
