import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { GoogleSheetsService } from '../../integrations/google-sheets/google-sheets.service';
import { SheetsSyncJobData } from '../sheets-sync-queue.service';

@Processor('sheets-sync')
export class SheetsSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SheetsSyncProcessor.name);

  constructor(
    private readonly googleSheetsService: GoogleSheetsService,
  ) {
    super();
  }

  async process(job: Job<SheetsSyncJobData>) {
    const { entityType, entityCode } = job.data;
    this.logger.log(
      `Processing sheets-sync job ${job.id}: ${entityType}:${entityCode}`,
    );

    switch (entityType) {
      case 'payment':
        return this.googleSheetsService.syncPayments(entityCode || undefined);
      case 'invoice':
        return this.googleSheetsService.syncInvoices(entityCode || undefined);
      case 'student':
        return this.googleSheetsService.syncStudents(entityCode || undefined);
      case 'monthly':
        await this.googleSheetsService.syncPayments(entityCode || undefined);
        await this.googleSheetsService.syncInvoices(entityCode || undefined);
        return { synced: -1 };
      default:
        await this.googleSheetsService.syncStudents();
        await this.googleSheetsService.syncInvoices();
        return this.googleSheetsService.syncPayments();
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<SheetsSyncJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${error.message}`,
      error.stack,
    );
  }
}
