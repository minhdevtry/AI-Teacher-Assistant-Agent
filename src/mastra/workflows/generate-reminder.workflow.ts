import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import type { UsersService } from '../../domain/users/users.service';
import type { InvoicesService } from '../../domain/invoices/invoices.service';
import type { ClassesService } from '../../domain/classes/classes.service';

const ctxSchema = z.object({
  // --- Input ---
  classCode: z.string(),
  billingMonth: z.string(),
  senderId: z.string().optional(),
  senderName: z.string().optional(),
  platform: z.string().optional(),
  eventCode: z.string().optional(),
  // --- Resolved ---
  className: z.string().optional(),
  teacherName: z.string().optional(),
  // --- Data ---
  unpaidStudents: z.array(
    z.object({
      studentCode: z.string(),
      studentName: z.string(),
      amountOwed: z.number(),
      parentPhone: z.string().optional(),
    }),
  ).optional(),
  // --- Messages ---
  messages: z.array(
    z.object({
      studentCode: z.string(),
      studentName: z.string(),
      amountOwed: z.number(),
      message: z.string(),
    }),
  ).optional(),
  totalMessages: z.number().optional(),
  // --- Output ---
  resultText: z.string().optional(),
  error: z.string().optional(),
});

type Ctx = z.infer<typeof ctxSchema>;

/**
 * Build the generate-reminder workflow.
 *
 * Steps:
 * 1. resolveClass              — find the class
 * 2. getUnpaidStudents         — students with unpaid invoices
 * 3. generatePersonalizedMessages — personalized reminder per parent
 * 4. createReminderBatch       — compile all messages
 * 5. sendReviewToTeacher       — send list to teacher for review (NOT auto-send to parents)
 */
export function createGenerateReminderWorkflow(
  usersService: UsersService,
  invoicesService: InvoicesService,
  classesService: ClassesService,
) {
  // ------------------------------------------------------------------
  // Step 1: resolveClass
  // ------------------------------------------------------------------
  const resolveClass = createStep({
    id: 'resolveClass',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (!inputData.classCode) {
        return { ...inputData, error: 'Thiếu mã lớp.' };
      }
      try {
        const cls = await classesService.findByCode(inputData.classCode);
        // Also find teacher name
        let teacherName: string | undefined;
        try {
          const teacher = await usersService.findByCode(cls.TeacherCode);
          teacherName = teacher.Name;
        } catch {
          // ignore
        }
        return {
          ...inputData,
          className: cls.Name,
          teacherName,
        };
      } catch {
        return { ...inputData, error: `Không tìm thấy lớp "${inputData.classCode}".` };
      }
    },
  });

  // ------------------------------------------------------------------
  // Step 2: getUnpaidStudents
  // ------------------------------------------------------------------
  const getUnpaidStudents = createStep({
    id: 'getUnpaidStudents',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error) return inputData;
      try {
        const result = await invoicesService.findAll({
          classCode: inputData.classCode,
          billingMonth: inputData.billingMonth,
          limit: 200,
        });

        const unpaidInvoices = result.data.filter(
          (inv: { Status: string }) => inv.Status === 'unpaid' || inv.Status === 'partial',
        );

        const unpaidStudents = await Promise.all(
          unpaidInvoices.map(
            async (inv: { StudentCode: string; RemainingAmount: number }) => {
              let studentName = inv.StudentCode;
              let parentPhone: string | undefined;
              try {
                const student = await usersService.findByCode(inv.StudentCode);
                studentName = student.Name;
                // Find parent phone if available
                if (student.ParentId) {
                  try {
                    const parent = await usersService.findByCode(student.ParentId);
                    parentPhone = parent.Phone ?? undefined;
                  } catch {
                    // ignore
                  }
                }
              } catch {
                // fallback to code
              }
              return {
                studentCode: inv.StudentCode,
                studentName,
                amountOwed: inv.RemainingAmount,
                parentPhone,
              };
            },
          ),
        );

        return { ...inputData, unpaidStudents };
      } catch {
        return { ...inputData, error: 'Lỗi khi lấy danh sách học sinh chưa đóng.' };
      }
    },
  });

  // ------------------------------------------------------------------
  // Step 3: generatePersonalizedMessages
  // ------------------------------------------------------------------
  const generatePersonalizedMessages = createStep({
    id: 'generatePersonalizedMessages',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error || !inputData.unpaidStudents) return inputData;

      const fmt = (n: number) =>
        new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

      const className = inputData.className ?? inputData.classCode;
      const month = inputData.billingMonth;

      const messages = inputData.unpaidStudents.map((s) => ({
        studentCode: s.studentCode,
        studentName: s.studentName,
        amountOwed: s.amountOwed,
        message:
          `Kính chào phụ huynh em ${s.studentName}.\n` +
          `Trung tâm xin nhắc nhở học phí ${month} lớp ${className} còn lại ${fmt(s.amountOwed)}.\n` +
          `Vui lòng thanh toán sớm. Trân trọng cảm ơn!`,
      }));

      return { ...inputData, messages };
    },
  });

  // ------------------------------------------------------------------
  // Step 4: createReminderBatch
  // ------------------------------------------------------------------
  const createReminderBatch = createStep({
    id: 'createReminderBatch',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error || !inputData.messages) return inputData;
      return {
        ...inputData,
        totalMessages: inputData.messages.length,
      };
    },
  });

  // ------------------------------------------------------------------
  // Step 5: sendReviewToTeacher
  // ------------------------------------------------------------------
  const sendReviewToTeacher = createStep({
    id: 'sendReviewToTeacher',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error) {
        return { ...inputData, resultText: `❌ ${inputData.error}` };
      }

      const msgs = inputData.messages ?? [];
      if (msgs.length === 0) {
        return {
          ...inputData,
          resultText: `✅ Tất cả học sinh lớp ${inputData.className ?? inputData.classCode} đã đóng đầy đủ học phí ${inputData.billingMonth}.`,
        };
      }

      const fmt = (n: number) =>
        new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

      const lines = msgs.map(
        (m, i) =>
          `  ${i + 1}. ${m.studentName} — ${fmt(m.amountOwed)}`,
      );

      const totalAmount = msgs.reduce((s, m) => s + m.amountOwed, 0);

      const resultText =
        `📋 Danh sách nhắc nhở học phí ${inputData.billingMonth}\n` +
        `Lớp: ${inputData.className ?? inputData.classCode}\n` +
        `Số học sinh chưa đóng: ${msgs.length}\n` +
        `Tổng còn nợ: ${fmt(totalAmount)}\n\n` +
        lines.join('\n') +
        `\n\n💡 Trả lời "gửi" để gửi tin nhắn nhắc nhở cho phụ huynh, hoặc "hủy" để bỏ qua.`;

      return { ...inputData, resultText };
    },
  });

  // ------------------------------------------------------------------
  // Compose workflow
  // ------------------------------------------------------------------
  return createWorkflow({
    id: 'generate-reminder',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
  })
    .then(resolveClass)
    .then(getUnpaidStudents)
    .then(generatePersonalizedMessages)
    .then(createReminderBatch)
    .then(sendReviewToTeacher)
    .commit();
}
