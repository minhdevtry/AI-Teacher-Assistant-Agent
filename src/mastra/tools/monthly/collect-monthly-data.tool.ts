import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { InvoicesService } from '../../../domain/invoices/invoices.service';
import { ClassesService } from '../../../domain/classes/classes.service';

export function createCollectMonthlyDataTool(
  invoicesService: InvoicesService,
  classesService: ClassesService,
) {
  return createTool({
    id: 'collect-monthly-data',
    description: 'Thu thập dữ liệu thanh toán hàng tháng cho một lớp',
    inputSchema: z.object({
      classCode: z.string().describe('Mã lớp'),
      billingMonth: z.string().describe('Tháng thanh toán (VD: 2026-07)'),
    }),
    outputSchema: z.object({
      classCode: z.string(),
      billingMonth: z.string(),
      className: z.string(),
      feeAmount: z.number(),
      totalStudents: z.number(),
      paidList: z.array(
        z.object({
          studentCode: z.string(),
          invoiceCode: z.string(),
          totalAmount: z.number(),
          paidAmount: z.number(),
        }),
      ),
      unpaidList: z.array(
        z.object({
          studentCode: z.string(),
          invoiceCode: z.string(),
          totalAmount: z.number(),
          remainingAmount: z.number(),
          status: z.string(),
        }),
      ),
      totalExpected: z.number(),
      totalCollected: z.number(),
      totalOutstanding: z.number(),
    }),
    execute: async (input) => {
      const classData = await classesService.findByCode(input.classCode);
      const studentCount = await classesService.getStudentCount(input.classCode);

      const result = await invoicesService.findAll({
        classCode: input.classCode,
        billingMonth: input.billingMonth,
        limit: 500,
      });

      const paidList = result.data
        .filter((inv: { Status: string }) => inv.Status === 'paid')
        .map(
          (inv: {
            StudentCode: string;
            Code: string;
            TotalAmount: number;
            PaidAmount: number;
          }) => ({
            studentCode: inv.StudentCode,
            invoiceCode: inv.Code,
            totalAmount: inv.TotalAmount,
            paidAmount: inv.PaidAmount,
          }),
        );

      const unpaidList = result.data
        .filter(
          (inv: { Status: string }) =>
            inv.Status === 'unpaid' || inv.Status === 'partial',
        )
        .map(
          (inv: {
            StudentCode: string;
            Code: string;
            TotalAmount: number;
            RemainingAmount: number;
            Status: string;
          }) => ({
            studentCode: inv.StudentCode,
            invoiceCode: inv.Code,
            totalAmount: inv.TotalAmount,
            remainingAmount: inv.RemainingAmount,
            status: inv.Status,
          }),
        );

      const totalExpected = studentCount * classData.FeeAmount;
      const totalCollected = paidList.reduce(
        (sum: number, p: { paidAmount: number }) => sum + p.paidAmount,
        0,
      );
      const totalOutstanding = unpaidList.reduce(
        (sum: number, u: { remainingAmount: number }) => sum + u.remainingAmount,
        0,
      );

      return {
        classCode: input.classCode,
        billingMonth: input.billingMonth,
        className: classData.Name,
        feeAmount: classData.FeeAmount,
        totalStudents: studentCount,
        paidList,
        unpaidList,
        totalExpected,
        totalCollected,
        totalOutstanding,
      };
    },
  });
}
