import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { PaymentsService } from '../../../domain/payments/payments.service';

export function createCreatePaymentDraftTool(paymentsService: PaymentsService) {
  return createTool({
    id: 'create-payment-draft',
    description: 'Tạo phiếu thanh toán nháp (chờ xác nhận)',
    inputSchema: z.object({
      studentCode: z.string().describe('Mã học sinh'),
      amount: z.number().describe('Số tiền thanh toán'),
      method: z.string().describe('Phương thức: cash, bank_transfer, momo, zalo_pay'),
      invoiceCode: z.string().optional().describe('Mã hóa đơn liên kết'),
      paidAt: z.string().optional().describe('Thời gian thanh toán (ISO string)'),
    }),
    outputSchema: z.object({
      code: z.string(),
      studentCode: z.string(),
      amount: z.number(),
      method: z.string(),
      status: z.string(),
      invoiceCode: z.string(),
    }),
    execute: async (input) => {
      const result = await paymentsService.createDraft({
        StudentCode: input.studentCode,
        Amount: input.amount,
        Method: input.method,
        InvoiceCode: input.invoiceCode,
        PaidAt: input.paidAt,
      });

      return {
        code: result.Code,
        studentCode: result.StudentCode,
        amount: result.Amount,
        method: result.Method,
        status: result.Status,
        invoiceCode: result.InvoiceCode,
      };
    },
  });
}
