import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { PaymentsService } from '../../../domain/payments/payments.service';

export function createAllocatePaymentTool(paymentsService: PaymentsService) {
  return createTool({
    id: 'allocate-payment',
    description: 'Phân bổ thanh toán vào hóa đơn cụ thể',
    inputSchema: z.object({
      paymentCode: z.string().describe('Mã phiếu thanh toán'),
      invoiceCode: z.string().describe('Mã hóa đơn cần phân bổ vào'),
    }),
    outputSchema: z.object({
      paymentCode: z.string(),
      invoiceCode: z.string(),
      amount: z.number(),
      status: z.string(),
      success: z.boolean(),
    }),
    execute: async (input) => {
      const result = await paymentsService.allocateToInvoice(
        input.paymentCode,
        input.invoiceCode,
      );

      return {
        paymentCode: result.Code,
        invoiceCode: result.InvoiceCode,
        amount: result.Amount,
        status: result.Status,
        success: true,
      };
    },
  });
}
