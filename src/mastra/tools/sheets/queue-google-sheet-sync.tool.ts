import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { SheetsSyncQueueService } from '../../../jobs/sheets-sync-queue.service';

export function createQueueGoogleSheetSyncTool(
  sheetsSyncQueueService: SheetsSyncQueueService,
) {
  return createTool({
    id: 'queue-google-sheet-sync',
    description:
      'Đưa job đồng bộ Google Sheets vào hàng đợi BullMQ. Sử dụng khi cần đồng bộ dữ liệu entity (user, class, invoice, payment) sang Google Sheets.',
    inputSchema: z.object({
      entityType: z.string().describe('Loại entity: user, class, invoice, payment'),
      entityCode: z.string().describe('Mã entity cần đồng bộ'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      jobId: z.string(),
      entityType: z.string(),
      entityCode: z.string(),
      status: z.string(),
    }),
    execute: async (input) => {
      if (!sheetsSyncQueueService.isAvailable()) {
        return {
          success: false,
          jobId: '',
          entityType: input.entityType,
          entityCode: input.entityCode,
          status:
            'unavailable: BullMQ/Redis is not configured. Sheets sync jobs are disabled.',
        };
      }

      try {
        const jobId = await sheetsSyncQueueService.enqueue(
          input.entityType,
          input.entityCode,
        );

        return {
          success: true,
          jobId,
          entityType: input.entityType,
          entityCode: input.entityCode,
          status: 'queued',
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          jobId: '',
          entityType: input.entityType,
          entityCode: input.entityCode,
          status: `failed: ${message}`,
        };
      }
    },
  });
}
