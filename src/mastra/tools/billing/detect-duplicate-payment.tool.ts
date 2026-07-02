import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { PaymentsService } from '../../../domain/payments/payments.service';

export function createDetectDuplicatePaymentTool(paymentsService: PaymentsService) {
  return createTool({
    id: 'detect-duplicate-payment',
    description: 'Kiểm tra thanh toán trùng lặp (cùng học sinh, số tiền gần bằng, thời gian gần nhau)',
    inputSchema: z.object({
      studentCode: z.string().describe('Mã học sinh'),
      amount: z.number().describe('Số tiền cần kiểm tra'),
      paidAt: z.string().describe('Thời gian thanh toán (ISO string)'),
      toleranceMinutes: z.number().optional().default(5).describe('Khoảng thời gian cho phép (phút)'),
    }),
    outputSchema: z.object({
      isDuplicate: z.boolean(),
      duplicates: z.array(
        z.object({
          code: z.string(),
          amount: z.number(),
          paidAt: z.string().nullable(),
          status: z.string(),
          method: z.string(),
        }),
      ),
    }),
    execute: async (input) => {
      const result = await paymentsService.detectDuplicate(
        input.amount,
        input.studentCode,
        new Date(input.paidAt),
        input.toleranceMinutes,
      );

      return {
        isDuplicate: result.isDuplicate,
        duplicates: result.duplicates.map(
          (d: {
            Code: string;
            Amount: number;
            PaidAt: string | null;
            Status: string;
            Method: string;
          }) => ({
            code: d.Code,
            amount: d.Amount,
            paidAt: d.PaidAt,
            status: d.Status,
            method: d.Method,
          }),
        ),
      };
    },
  });
}
