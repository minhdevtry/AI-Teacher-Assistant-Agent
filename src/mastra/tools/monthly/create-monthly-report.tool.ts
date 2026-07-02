import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ClassesService } from '../../../domain/classes/classes.service';
import { InvoicesService } from '../../../domain/invoices/invoices.service';

export function createCreateMonthlyReportTool(
  classesService: ClassesService,
  invoicesService: InvoicesService,
) {
  return createTool({
    id: 'create-monthly-report',
    description: 'Tạo báo cáo chốt sổ tháng cho một lớp',
    inputSchema: z.object({
      classCode: z.string().describe('Mã lớp'),
      billingMonth: z.string().describe('Tháng báo cáo (VD: 2026-07)'),
    }),
    outputSchema: z.object({
      classCode: z.string(),
      className: z.string(),
      billingMonth: z.string(),
      totalStudents: z.number(),
      expectedRevenue: z.number(),
      collectedRevenue: z.number(),
      outstandingDebt: z.number(),
      collectionRate: z.number(),
      status: z.string(),
      reportJson: z.string(),
    }),
    execute: async (input) => {
      const classData = await classesService.findByCode(input.classCode);
      const studentCount = await classesService.getStudentCount(input.classCode);

      const result = await invoicesService.findAll({
        classCode: input.classCode,
        billingMonth: input.billingMonth,
        limit: 500,
      });

      const expectedRevenue = studentCount * classData.FeeAmount;
      const collectedRevenue = result.data.reduce(
        (sum: number, inv: { PaidAmount: number }) => sum + (inv.PaidAmount || 0),
        0,
      );
      const outstandingDebt = result.data.reduce(
        (sum: number, inv: { RemainingAmount: number }) =>
          sum + (inv.RemainingAmount || 0),
        0,
      );

      const collectionRate =
        expectedRevenue > 0
          ? Math.round((collectedRevenue / expectedRevenue) * 100)
          : 0;

      const reportJson = JSON.stringify({
        classCode: input.classCode,
        className: classData.Name,
        billingMonth: input.billingMonth,
        totalStudents: studentCount,
        expectedRevenue,
        collectedRevenue,
        outstandingDebt,
        collectionRate,
        generatedAt: new Date().toISOString(),
      });

      return {
        classCode: input.classCode,
        className: classData.Name,
        billingMonth: input.billingMonth,
        totalStudents: studentCount,
        expectedRevenue,
        collectedRevenue,
        outstandingDebt,
        collectionRate,
        status: collectionRate >= 100 ? 'complete' : 'draft',
        reportJson,
      };
    },
  });
}
