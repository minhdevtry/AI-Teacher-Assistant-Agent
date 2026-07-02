import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { InvoicesService } from '../../../domain/invoices/invoices.service';

export function createGetStudentBalanceTool(invoicesService: InvoicesService) {
  return createTool({
    id: 'get-student-balance',
    description: 'Lấy thông tin công nợ của học sinh (tổng hóa đơn chưa thanh toán)',
    inputSchema: z.object({
      studentCode: z.string().describe('Mã học sinh (VD: STD001)'),
    }),
    outputSchema: z.object({
      studentCode: z.string(),
      invoices: z.array(
        z.object({
          code: z.string(),
          billingMonth: z.string(),
          totalAmount: z.number(),
          paidAmount: z.number(),
          remainingAmount: z.number(),
          status: z.string(),
        }),
      ),
      totalUnpaid: z.number(),
      totalPartial: z.number(),
      totalRemaining: z.number(),
    }),
    execute: async (input) => {
      const result = await invoicesService.findAll({
        studentCode: input.studentCode,
        limit: 100,
      });

      const unpaidInvoices = result.data.filter(
        (inv: { Status: string }) => inv.Status === 'unpaid' || inv.Status === 'partial',
      );

      const invoices = unpaidInvoices.map(
        (inv: {
          Code: string;
          BillingMonth: string;
          TotalAmount: number;
          PaidAmount: number;
          RemainingAmount: number;
          Status: string;
        }) => ({
          code: inv.Code,
          billingMonth: inv.BillingMonth,
          totalAmount: inv.TotalAmount,
          paidAmount: inv.PaidAmount,
          remainingAmount: inv.RemainingAmount,
          status: inv.Status,
        }),
      );

      const totalUnpaid = invoices
        .filter((inv: { status: string }) => inv.status === 'unpaid')
        .reduce((sum: number, inv: { remainingAmount: number }) => sum + inv.remainingAmount, 0);

      const totalPartial = invoices
        .filter((inv: { status: string }) => inv.status === 'partial')
        .reduce((sum: number, inv: { remainingAmount: number }) => sum + inv.remainingAmount, 0);

      return {
        studentCode: input.studentCode,
        invoices,
        totalUnpaid,
        totalPartial,
        totalRemaining: totalUnpaid + totalPartial,
      };
    },
  });
}
