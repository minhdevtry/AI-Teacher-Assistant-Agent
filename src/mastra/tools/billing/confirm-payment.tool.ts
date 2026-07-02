import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { PaymentsService } from '../../../domain/payments/payments.service';

export function createConfirmPaymentTool(paymentsService: PaymentsService) {
  return createTool({
    id: 'confirm-payment',
    description: 'Xác nhận phiếu thanh toán nháp (chuyển sang trạng thái confirmed)',
    inputSchema: z.object({
      paymentCode: z.string().describe('Mã phiếu thanh toán (VD: PAY001)'),
    }),
    outputSchema: z.object({
      code: z.string(),
      studentCode: z.string(),
      amount: z.number(),
      status: z.string(),
      invoiceCode: z.string(),
    }),
    execute: async (input) => {
      const result = await paymentsService.confirm(input.paymentCode);
      return {
        code: result.Code,
        studentCode: result.StudentCode,
        amount: result.Amount,
        status: result.Status,
        invoiceCode: result.InvoiceCode,
      };
    },
  });
}
