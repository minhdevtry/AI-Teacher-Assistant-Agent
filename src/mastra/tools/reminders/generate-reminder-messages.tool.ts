import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { InvoicesService } from '../../../domain/invoices/invoices.service';
import { UsersService } from '../../../domain/users/users.service';

export function createGenerateReminderMessagesTool(
  invoicesService: InvoicesService,
  usersService: UsersService,
) {
  return createTool({
    id: 'generate-reminder-messages',
    description: 'Tạo tin nhắn nhắc nhở học phí cá nhân hóa cho học sinh chưa đóng trong lớp',
    inputSchema: z.object({
      classCode: z.string().describe('Mã lớp'),
      billingMonth: z.string().describe('Tháng thanh toán (VD: 2026-07)'),
    }),
    outputSchema: z.object({
      classCode: z.string(),
      billingMonth: z.string(),
      messages: z.array(
        z.object({
          studentCode: z.string(),
          studentName: z.string(),
          amountOwed: z.number(),
          message: z.string(),
        }),
      ),
      totalMessages: z.number(),
    }),
    execute: async (input) => {
      const result = await invoicesService.findAll({
        classCode: input.classCode,
        billingMonth: input.billingMonth,
        limit: 200,
      });

      const unpaidInvoices = result.data.filter(
        (inv: { Status: string }) => inv.Status === 'unpaid' || inv.Status === 'partial',
      );

      const messages = await Promise.all(
        unpaidInvoices.map(
          async (inv: {
            StudentCode: string;
            RemainingAmount: number;
          }) => {
            let studentName = inv.StudentCode;
            try {
              const student = await usersService.findByCode(inv.StudentCode);
              studentName = student.Name;
            } catch {
              // fallback to code
            }

            const formattedAmount = new Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
            }).format(inv.RemainingAmount);

            return {
              studentCode: inv.StudentCode,
              studentName,
              amountOwed: inv.RemainingAmount,
              message: `Kính chào phụ huynh em ${studentName}. Trung tâm xin nhắc nhở học phí tháng ${input.billingMonth} còn lại ${formattedAmount}. Vui lòng thanh toán sớm. Trân trọng cảm ơn!`,
            };
          },
        ),
      );

      return {
        classCode: input.classCode,
        billingMonth: input.billingMonth,
        messages,
        totalMessages: messages.length,
      };
    },
  });
}
