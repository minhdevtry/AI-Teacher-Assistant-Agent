import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { PaymentsService } from '../../../domain/payments/payments.service';

export function createRejectPaymentDraftTool(paymentsService: PaymentsService) {
  return createTool({
    id: 'reject-payment-draft',
    description: 'Từ chối/hủy phiếu thanh toán nháp',
    inputSchema: z.object({
      paymentCode: z.string().describe('Mã phiếu thanh toán (VD: PAY001)'),
      reason: z.string().describe('Lý do từ chối'),
    }),
    outputSchema: z.object({
      code: z.string(),
      studentCode: z.string(),
      amount: z.number(),
      status: z.string(),
      reason: z.string(),
    }),
    execute: async (input) => {
      const result = await paymentsService.reject(
        input.paymentCode,
        input.reason,
      );
      return {
        code: result.Code,
        studentCode: result.StudentCode,
        amount: result.Amount,
        status: result.Status,
        reason: input.reason,
      };
    },
  });
}
