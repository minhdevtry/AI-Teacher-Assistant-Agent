import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { MonthlyClosingService } from '../../../domain/monthly-closing/monthly-closing.service';

export function createCreateMonthlyReportTool(
  monthlyClosingService: MonthlyClosingService,
) {
  return createTool({
    id: 'create-monthly-report',
    description: 'Tạo báo cáo chốt sổ tháng cho một lớp dưới dạng nháp và lưu trữ',
    inputSchema: z.object({
      classCode: z.string().describe('Mã lớp'),
      billingMonth: z.string().describe('Tháng báo cáo (VD: 2026-07)'),
    }),
    outputSchema: z.any(),
    execute: async (input) => {
      const draft = await monthlyClosingService.createOrUpdateDraft(
        input.classCode,
        input.billingMonth,
      );

      const collectionRate = draft.ExpectedRevenue > 0
        ? Math.round((draft.CollectedRevenue / draft.ExpectedRevenue) * 100)
        : 0;

      return {
        classCode: draft.ClassCode,
        className: draft.Name,
        billingMonth: draft.BillingMonth,
        totalStudents: draft.TotalStudents,
        expectedRevenue: draft.ExpectedRevenue,
        collectedRevenue: draft.CollectedRevenue,
        outstandingDebt: draft.OutstandingDebt,
        collectionRate,
        status: draft.Status,
        reportJson: draft.ReportJson,
        closingCode: draft.Code,
      };
    },
  });
}

