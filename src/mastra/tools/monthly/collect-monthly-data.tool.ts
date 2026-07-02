import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { MonthlyClosingService } from '../../../domain/monthly-closing/monthly-closing.service';

export function createCollectMonthlyDataTool(
  monthlyClosingService: MonthlyClosingService,
) {
  return createTool({
    id: 'collect-monthly-data',
    description: 'Thu thập dữ liệu thanh toán hàng tháng cho một lớp và lưu vào nháp',
    inputSchema: z.object({
      classCode: z.string().describe('Mã lớp'),
      billingMonth: z.string().describe('Tháng thanh toán (VD: 2026-07)'),
    }),
    outputSchema: z.any(),
    execute: async (input) => {
      const draft = await monthlyClosingService.createOrUpdateDraft(
        input.classCode,
        input.billingMonth,
      );

      const report = JSON.parse(draft.ReportJson);
      const paidList = report.students.filter((s: any) => s.status === 'paid');
      const unpaidList = report.students.filter((s: any) => s.status !== 'paid');

      return {
        classCode: draft.ClassCode,
        billingMonth: draft.BillingMonth,
        className: report.className,
        feeAmount: report.feeAmount || 0,
        totalStudents: draft.TotalStudents,
        paidList,
        unpaidList,
        totalExpected: draft.ExpectedRevenue,
        totalCollected: draft.CollectedRevenue,
        totalOutstanding: draft.OutstandingDebt,
        closingCode: draft.Code,
      };
    },
  });
}

