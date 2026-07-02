import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { Queue } from 'bullmq';

export interface SheetsSyncJobData {
  entityType: string;
  entityCode: string;
}

@Injectable()
export class SheetsSyncQueueService {
  private readonly logger = new Logger(SheetsSyncQueueService.name);
  private readonly available: boolean;

  constructor(
    @Optional() @Inject('BullQueue_sheets-sync') private readonly queue?: Queue<SheetsSyncJobData>,
  ) {
    this.available = !!queue;
    if (!this.available) {
      this.logger.warn(
        'BullMQ queue not available — sheets sync jobs will be disabled',
      );
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async enqueue(entityType: string, entityCode: string): Promise<string> {
    if (!this.queue) {
      this.logger.warn(
        `Cannot enqueue sheets-sync job: BullMQ queue not available (Redis may be disabled)`,
      );
      return 'unavailable';
    }

    const job = await this.queue.add(
      'sync',
      { entityType, entityCode },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );
    this.logger.log(
      `Enqueued sheets-sync job ${job.id} for ${entityType}:${entityCode}`,
    );
    return job.id ?? 'queued';
  }
}
