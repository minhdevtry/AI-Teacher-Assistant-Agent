import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { InvoicesService } from '../../../domain/invoices/invoices.service';
import { UsersService } from '../../../domain/users/users.service';

export function createGetClassDebtListTool(
  invoicesService: InvoicesService,
  usersService: UsersService,
) {
  return createTool({
    id: 'get-class-debt-list',
    description: 'Danh sách học sinh có hóa đơn chưa thanh toán hoặc thanh toán một phần trong lớp',
    inputSchema: z.object({
      classCode: z.string().describe('Mã lớp'),
      billingMonth: z.string().optional().describe('Tháng thanh toán (VD: 2026-07)'),
    }),
    outputSchema: z.object({
      classCode: z.string(),
      students: z.array(
        z.object({
          studentCode: z.string(),
          studentName: z.string(),
          invoiceCode: z.string(),
          totalAmount: z.number(),
          paidAmount: z.number(),
          remainingAmount: z.number(),
          status: z.string(),
        }),
      ),
      totalDebt: z.number(),
    }),
    execute: async (input) => {
      const query: Record<string, unknown> = {
        classCode: input.classCode,
        limit: 200,
      };
      if (input.billingMonth) query['billingMonth'] = input.billingMonth;

      const result = await invoicesService.findAll(query);

      const debtInvoices = result.data.filter(
        (inv: { Status: string }) => inv.Status === 'unpaid' || inv.Status === 'partial',
      );

      const students = await Promise.all(
        debtInvoices.map(
          async (inv: {
            StudentCode: string;
            Code: string;
            TotalAmount: number;
            PaidAmount: number;
            RemainingAmount: number;
            Status: string;
          }) => {
            let name = inv.StudentCode;
            try {
              const student = await usersService.findByCode(inv.StudentCode);
              name = student.Name;
            } catch {
              // fallback to code
            }
            return {
              studentCode: inv.StudentCode,
              studentName: name,
              invoiceCode: inv.Code,
              totalAmount: inv.TotalAmount,
              paidAmount: inv.PaidAmount,
              remainingAmount: inv.RemainingAmount,
              status: inv.Status,
            };
          },
        ),
      );

      const totalDebt = students.reduce(
        (sum: number, s: { remainingAmount: number }) => sum + s.remainingAmount,
        0,
      );

      return { classCode: input.classCode, students, totalDebt };
    },
  });
}
