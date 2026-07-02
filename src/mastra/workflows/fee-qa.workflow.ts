import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import type { UsersService } from '../../domain/users/users.service';
import type { InvoicesService } from '../../domain/invoices/invoices.service';
import type { PaymentsService } from '../../domain/payments/payments.service';
import type { ClassesService } from '../../domain/classes/classes.service';

const ctxSchema = z.object({
  // --- Input ---
  question: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  platform: z.string(),
  eventCode: z.string(),
  // --- Classification ---
  queryType: z.enum(['balance', 'debt', 'history', 'class_debt', 'general']).optional(),
  // --- Resolved ---
  studentCode: z.string().optional(),
  studentName: z.string().optional(),
  classCode: z.string().optional(),
  billingMonth: z.string().optional(),
  // --- Data ---
  invoices: z.array(z.any()).optional(),
  payments: z.array(z.any()).optional(),
  totalOwed: z.number().optional(),
  totalPaid: z.number().optional(),
  // --- Output ---
  answer: z.string().optional(),
  suggestion: z.string().optional(),
  error: z.string().optional(),
});

type Ctx = z.infer<typeof ctxSchema>;

/**
 * Build the fee-question-answer workflow (no suspend needed).
 *
 * Steps:
 * 1. classifyQuery     — determine query type
 * 2. resolveTarget     — which student/class/month
 * 3. queryBillingData  — fetch relevant data
 * 4. calculateSummary  — compute totals
 * 5. generateAnswer    — format response in Vietnamese
 * 6. suggestNextAction — suggest: remind, close month, etc.
 */
export function createFeeQuestionAnswerWorkflow(
  usersService: UsersService,
  invoicesService: InvoicesService,
  paymentsService: PaymentsService,
  classesService: ClassesService,
) {
  // ------------------------------------------------------------------
  // Step 1: classifyQuery
  // ------------------------------------------------------------------
  const classifyQuery = createStep({
    id: 'classifyQuery',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      const q = inputData.question.toLowerCase();
      let queryType: Ctx['queryType'] = 'general';

      if (/còn.*nợ|nợ.*bao nhiêu|chưa.*đóng|tổng.*nợ/i.test(q)) {
        queryType = 'debt';
      } else if (/đã.*đóng|lịch sử|thanh toán.*nào/i.test(q)) {
        queryType = 'history';
      } else if (/số dư|học phí|còn lại/i.test(q)) {
        queryType = 'balance';
      } else if (/lớp|cả lớp|danh sách.*nợ/i.test(q)) {
        queryType = 'class_debt';
      }

      // Try to extract billing month
      let billingMonth: string | undefined;
      const monthMatch = q.match(/(\d{4})-(\d{2})/);
      const thangMatch = q.match(/th[áa]ng\s*(\d{1,2})/i);
      if (monthMatch) {
        billingMonth = `${monthMatch[1]}-${monthMatch[2]}`;
      } else if (thangMatch) {
        billingMonth = `${new Date().getFullYear()}-${thangMatch[1].padStart(2, '0')}`;
      }

      return { ...inputData, queryType, billingMonth };
    },
  });

  // ------------------------------------------------------------------
  // Step 2: resolveTarget
  // ------------------------------------------------------------------
  const resolveTarget = createStep({
    id: 'resolveTarget',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error) return inputData;
      // Try to find student by sender ZaloUserId
      try {
        const user = await usersService.findByZaloUserId(inputData.senderId);
        if (user) {
          if (user.Role === 'student') {
            return {
              ...inputData,
              studentCode: user.Code,
              studentName: user.Name,
              classCode: user.ClassCode ?? undefined,
            };
          }
          if (user.Role === 'teacher') {
            // Teacher asking — they might want class-level info
            // Try to extract student name from question
            const nameMatch = inputData.question.match(/(?:em|học sinh)\s+([A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝ][^\d,.\-]{1,40})/i);
            if (nameMatch) {
              const results = await usersService.search(nameMatch[1].trim());
              const student = results.find((u: { Role: string }) => u.Role === 'student');
              if (student) {
                return {
                  ...inputData,
                  studentCode: student.Code,
                  studentName: student.Name,
                  classCode: student.ClassCode ?? undefined,
                };
              }
            }
            // Otherwise teacher asks about class debt — handled by queryType
            return { ...inputData, classCode: undefined };
          }
        }
      } catch {
        // fallthrough
      }
      // Try name-based search from question text
      const nameMatch = inputData.question.match(/(?:em|học sinh|cho)\s+([A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝ][^\d,.\-]{1,40})/i);
      if (nameMatch) {
        try {
          const results = await usersService.search(nameMatch[1].trim());
          const student = results.find((u: { Role: string }) => u.Role === 'student');
          if (student) {
            return {
              ...inputData,
              studentCode: student.Code,
              studentName: student.Name,
              classCode: student.ClassCode ?? undefined,
            };
          }
        } catch {
          // fallthrough
        }
      }
      return inputData;
    },
  });

  // ------------------------------------------------------------------
  // Step 3: queryBillingData
  // ------------------------------------------------------------------
  const queryBillingData = createStep({
    id: 'queryBillingData',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error) return inputData;
      const month = inputData.billingMonth ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

      try {
        if (inputData.queryType === 'class_debt' && inputData.classCode) {
          const result = await invoicesService.findAll({
            classCode: inputData.classCode,
            billingMonth: month,
            status: 'unpaid',
            limit: 200,
          });
          return { ...inputData, invoices: result.data };
        }

        if (inputData.studentCode) {
          const result = await invoicesService.findAll({
            studentCode: inputData.studentCode,
            billingMonth: month,
            limit: 10,
          });
          // Also fetch payment history
          const invoices = result.data;
          const allPayments: unknown[] = [];
          for (const inv of invoices) {
            const pays = await paymentsService.getByInvoice(inv.Code);
            allPayments.push(...pays);
          }
          return { ...inputData, invoices, payments: allPayments };
        }

        return { ...inputData, error: 'Không xác định được học sinh hoặc lớp để tra cứu.' };
      } catch {
        return { ...inputData, error: 'Lỗi khi truy vấn dữ liệu học phí.' };
      }
    },
  });

  // ------------------------------------------------------------------
  // Step 4: calculateSummary
  // ------------------------------------------------------------------
  const calculateSummary = createStep({
    id: 'calculateSummary',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error) return inputData;

      const invoices = (inputData.invoices ?? []) as Array<{
        TotalAmount: number;
        PaidAmount: number;
        RemainingAmount: number;
      }>;
      const payments = (inputData.payments ?? []) as Array<{
        Amount: number;
        Status: string;
      }>;

      const totalOwed = invoices.reduce((s, i) => s + i.RemainingAmount, 0);
      const totalPaid = payments
        .filter((p) => p.Status === 'confirmed')
        .reduce((s, p) => s + p.Amount, 0);

      return { ...inputData, totalOwed, totalPaid };
    },
  });

  // ------------------------------------------------------------------
  // Step 5: generateAnswer
  // ------------------------------------------------------------------
  const generateAnswer = createStep({
    id: 'generateAnswer',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error) {
        return { ...inputData, answer: `❌ ${inputData.error}` };
      }

      const fmt = (n: number) =>
        new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
      const month = inputData.billingMonth ?? 'tháng hiện tại';
      const name = inputData.studentName ?? inputData.studentCode ?? 'lớp';

      switch (inputData.queryType) {
        case 'debt':
        case 'balance': {
          if ((inputData.invoices?.length ?? 0) === 0) {
            return {
              ...inputData,
              answer: `📋 ${name} không có hóa đơn nào trong ${month}.`,
            };
          }
          return {
            ...inputData,
            answer:
              `📋 Học phí ${name} - ${month}:\n` +
              `• Tổng: ${fmt(inputData.totalPaid ?? 0 + (inputData.totalOwed ?? 0))}\n` +
              `• Đã đóng: ${fmt(inputData.totalPaid ?? 0)}\n` +
              `• Còn lại: ${fmt(inputData.totalOwed ?? 0)}`,
          };
        }
        case 'history': {
          const count = inputData.payments?.length ?? 0;
          return {
            ...inputData,
            answer:
              `📋 Lịch sử thanh toán ${name} - ${month}:\n` +
              `• Số giao dịch: ${count}\n` +
              `• Tổng đã đóng: ${fmt(inputData.totalPaid ?? 0)}`,
          };
        }
        case 'class_debt': {
          const invoices = (inputData.invoices ?? []) as Array<{ StudentCode: string; RemainingAmount: number }>;
          const lines = invoices
            .slice(0, 10)
            .map((inv, i) => `  ${i + 1}. ${inv.StudentCode}: ${fmt(inv.RemainingAmount)}`);
          return {
            ...inputData,
            answer:
              `📋 Danh sách chưa đóng học phí ${month} (${invoices.length} học sinh):\n` +
              lines.join('\n') +
              (invoices.length > 10 ? `\n  ... và ${invoices.length - 10} em khác` : ''),
          };
        }
        default:
          return {
            ...inputData,
            answer: `Xin lỗi, tôi chưa hiểu câu hỏi về học phí. Bạn có thể hỏi cụ thể hơn (ví dụ: "em A còn nợ bao nhiêu tháng 7").`,
          };
      }
    },
  });

  // ------------------------------------------------------------------
  // Step 6: suggestNextAction
  // ------------------------------------------------------------------
  const suggestNextAction = createStep({
    id: 'suggestNextAction',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error) return inputData;

      const suggestions: string[] = [];
      if ((inputData.totalOwed ?? 0) > 0) {
        suggestions.push('💡 Gửi nhắc nhở học phí cho phụ huynh');
      }
      if (inputData.queryType === 'class_debt') {
        suggestions.push('💡 Tạo hóa đơn hàng loạt cho lớp');
      }
      suggestions.push('💡 Gửi ảnh chuyển khoản để ghi nhận thanh toán');

      const suggestion = suggestions.length > 0 ? suggestions.join('\n') : undefined;
      const answer = [inputData.answer, suggestion].filter(Boolean).join('\n\n');

      return { ...inputData, answer, suggestion };
    },
  });

  // ------------------------------------------------------------------
  // Compose workflow
  // ------------------------------------------------------------------
  return createWorkflow({
    id: 'fee-question-answer',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
  })
    .then(classifyQuery)
    .then(resolveTarget)
    .then(queryBillingData)
    .then(calculateSummary)
    .then(generateAnswer)
    .then(suggestNextAction)
    .commit();
}
