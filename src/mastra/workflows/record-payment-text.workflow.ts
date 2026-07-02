import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import type { UsersService } from '../../domain/users/users.service';
import type { InvoicesService } from '../../domain/invoices/invoices.service';
import type { PaymentsService } from '../../domain/payments/payments.service';
import type { AuditService } from '../../domain/common/audit.service';
import type { ApprovalService } from '../approval.service';

/** Shared context passed through every step of the workflow. */
const ctxSchema = z.object({
  // --- Input ---
  rawText: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  platform: z.string(),
  eventCode: z.string(),
  // --- Parsed ---
  studentName: z.string().optional(),
  amount: z.number().optional(),
  billingMonth: z.string().optional(),
  method: z.string().optional(),
  // --- Resolved ---
  studentCode: z.string().optional(),
  classCode: z.string().optional(),
  invoiceCode: z.string().optional(),
  invoiceTotal: z.number().optional(),
  paidBefore: z.number().optional(),
  balanceAfter: z.number().optional(),
  // --- Payment ---
  paymentCode: z.string().optional(),
  isDuplicate: z.boolean().optional(),
  // --- Approval ---
  approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
  // --- Result ---
  resultText: z.string().optional(),
  error: z.string().optional(),
});

type Ctx = z.infer<typeof ctxSchema>;

/**
 * Build the record-payment-from-text workflow.
 *
 * Steps:
 *  1. parsePaymentText  — AI extract student name / amount / month
 *  2. resolveStudent    — match student in DB
 *  3. resolveInvoice    — find or create invoice
 *  4. calculateStatus   — balance before / after
 *  5. detectDuplicate   — check duplicate payment
 *  6. createPaymentDraft — create draft via PaymentsService
 *  7. suspendForApproval — SUSPEND for teacher confirmation
 *  8. processApproval   — RESUME: approved → confirm, rejected → reject
 *  9. reportResult      — build response text
 * 10. writeAuditLog     — audit trail
 */
export function createRecordPaymentFromTextWorkflow(
  usersService: UsersService,
  invoicesService: InvoicesService,
  paymentsService: PaymentsService,
  auditService: AuditService,
  approvalService: ApprovalService,
) {
  // ------------------------------------------------------------------
  // Step 1: parsePaymentText
  // ------------------------------------------------------------------
  const parsePaymentText = createStep({
    id: 'parsePaymentText',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      // Simple heuristic parser — in production an AI model would extract
      const text = inputData.rawText;
      const amountMatch = text.match(/(\d[\d.,]*)/);
      const amount = amountMatch
        ? Number(amountMatch[1].replace(/[.,]/g, ''))
        : undefined;

      // Try to extract a month pattern like "tháng 7" or "2026-07"
      let billingMonth: string | undefined;
      const monthMatch = text.match(/(\d{4})-(\d{2})/);
      const thangMatch = text.match(/th[áa]ng\s*(\d{1,2})/i);
      if (monthMatch) {
        billingMonth = `${monthMatch[1]}-${monthMatch[2]}`;
      } else if (thangMatch) {
        const year = new Date().getFullYear();
        billingMonth = `${year}-${thangMatch[1].padStart(2, '0')}`;
      }

      // Extract student name: take the first proper-noun-like segment
      const nameMatch = text.match(/(?:cho|em|học sinh)\s+([A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝ][^\d,.\-]{1,40})/i);
      const studentName = nameMatch ? nameMatch[1].trim() : undefined;

      // Default method
      const method = /chuyển khoản|bank/i.test(text)
        ? 'bank_transfer'
        : /momo/i.test(text)
          ? 'momo'
          : /zalo.*pay/i.test(text)
            ? 'zalo_pay'
            : 'cash';

      return {
        ...inputData,
        studentName,
        amount,
        billingMonth,
        method,
      };
    },
  });

  // ------------------------------------------------------------------
  // Step 2: resolveStudent
  // ------------------------------------------------------------------
  const resolveStudent = createStep({
    id: 'resolveStudent',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (!inputData.studentName) {
        return { ...inputData, error: 'Không tìm thấy tên học sinh trong tin nhắn.' };
      }
      try {
        const results = await usersService.search(inputData.studentName);
        const student = results.find(
          (u: { Role: string }) => u.Role === 'student',
        );
        if (!student) {
          return { ...inputData, error: `Không tìm thấy học sinh "${inputData.studentName}".` };
        }
        return {
          ...inputData,
          studentCode: student.Code,
          classCode: student.ClassCode ?? undefined,
        };
      } catch {
        return { ...inputData, error: 'Lỗi khi tìm kiếm học sinh.' };
      }
    },
  });

  // ------------------------------------------------------------------
  // Step 3: resolveInvoice
  // ------------------------------------------------------------------
  const resolveInvoice = createStep({
    id: 'resolveInvoice',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error || !inputData.studentCode) return inputData;
      const month = inputData.billingMonth ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      try {
        const result = await invoicesService.findAll({
          studentCode: inputData.studentCode,
          billingMonth: month,
          limit: 1,
        });
        if (result.data.length > 0) {
          const inv = result.data[0];
          return {
            ...inputData,
            invoiceCode: inv.Code,
            invoiceTotal: inv.TotalAmount,
            paidBefore: inv.PaidAmount,
          };
        }
        // No invoice — create one if we have classCode
        if (!inputData.classCode) {
          return { ...inputData, error: 'Không tìm thấy hóa đơn và không có lớp để tạo mới.' };
        }
        const fee = inputData.amount ?? 0;
        const inv = await invoicesService.create({
          StudentCode: inputData.studentCode,
          ClassCode: inputData.classCode,
          BillingMonth: month,
          TotalAmount: fee,
        });
        return {
          ...inputData,
          invoiceCode: inv.Code,
          invoiceTotal: inv.TotalAmount,
          paidBefore: 0,
        };
      } catch {
        return { ...inputData, error: 'Lỗi khi xử lý hóa đơn.' };
      }
    },
  });

  // ------------------------------------------------------------------
  // Step 4: calculateStatus
  // ------------------------------------------------------------------
  const calculateStatus = createStep({
    id: 'calculateStatus',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error) return inputData;
      const total = inputData.invoiceTotal ?? 0;
      const paid = inputData.paidBefore ?? 0;
      const paying = inputData.amount ?? 0;
      return {
        ...inputData,
        balanceAfter: total - paid - paying,
      };
    },
  });

  // ------------------------------------------------------------------
  // Step 5: detectDuplicate
  // ------------------------------------------------------------------
  const detectDuplicate = createStep({
    id: 'detectDuplicate',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error || !inputData.studentCode || !inputData.amount) return inputData;
      try {
        const result = await paymentsService.detectDuplicate(
          inputData.amount,
          inputData.studentCode,
          new Date(),
        );
        return { ...inputData, isDuplicate: result.isDuplicate };
      } catch {
        return { ...inputData, isDuplicate: false };
      }
    },
  });

  // ------------------------------------------------------------------
  // Step 6: createPaymentDraft
  // ------------------------------------------------------------------
  const createPaymentDraft = createStep({
    id: 'createPaymentDraft',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error || inputData.isDuplicate || !inputData.studentCode || !inputData.amount) {
        return inputData;
      }
      try {
        const draft = await paymentsService.createDraft({
          StudentCode: inputData.studentCode,
          Amount: inputData.amount,
          Method: inputData.method ?? 'cash',
          InvoiceCode: inputData.invoiceCode,
          PaidAt: new Date().toISOString(),
        });
        return { ...inputData, paymentCode: draft.Code };
      } catch {
        return { ...inputData, error: 'Lỗi khi tạo phiếu thanh toán nháp.' };
      }
    },
  });

  // ------------------------------------------------------------------
  // Step 7: suspendForApproval
  // ------------------------------------------------------------------
  const suspendForApproval = createStep({
    id: 'suspendForApproval',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData, suspend }) => {
      if (inputData.error || !inputData.paymentCode) return inputData;

      // Create approval record in DB
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
      await approvalService.createApproval(
        inputData.eventCode,
        `Thanh toán ${inputData.amount?.toLocaleString('vi-VN')}đ cho ${inputData.studentName ?? inputData.studentCode}`,
        'record_payment',
        expiresAt,
      );

      // Suspend workflow — will resume when teacher replies
      return suspend(
        {
          eventCode: inputData.eventCode,
          paymentCode: inputData.paymentCode,
          summary: `Xác nhận thanh toán ${inputData.amount?.toLocaleString('vi-VN')}đ`,
        },
        { resumeLabel: 'approval-response' },
      ) as unknown as Ctx;
    },
  });

  // ------------------------------------------------------------------
  // Step 8: processApproval
  // ------------------------------------------------------------------
  const processApproval = createStep({
    id: 'processApproval',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData, resumeData }) => {
      if (inputData.error || !inputData.paymentCode) return inputData;

      const approval = (resumeData as { approvalStatus?: string }) ?? {};
      const status = (approval.approvalStatus ?? 'rejected') as 'approved' | 'rejected';

      try {
        if (status === 'approved') {
          await paymentsService.confirm(inputData.paymentCode);
          await approvalService.processApproval(inputData.eventCode, true);
          return { ...inputData, approvalStatus: 'approved' as const };
        } else {
          await paymentsService.reject(inputData.paymentCode, 'Bị từ chối bởi giáo viên');
          await approvalService.processApproval(inputData.eventCode, false);
          return { ...inputData, approvalStatus: 'rejected' as const };
        }
      } catch {
        return { ...inputData, error: 'Lỗi khi xử lý phê duyệt.', approvalStatus: status };
      }
    },
  });

  // ------------------------------------------------------------------
  // Step 9: reportResult
  // ------------------------------------------------------------------
  const reportResult = createStep({
    id: 'reportResult',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error) {
        return { ...inputData, resultText: `❌ ${inputData.error}` };
      }
      if (inputData.isDuplicate) {
        return {
          ...inputData,
          resultText: `⚠️ Phát hiện thanh toán trùng lặp cho học sinh ${inputData.studentName ?? inputData.studentCode}.`,
        };
      }
      if (inputData.approvalStatus === 'approved') {
        const fmt = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(inputData.amount ?? 0);
        return {
          ...inputData,
          resultText: `✅ Đã xác nhận thanh toán ${fmt} cho ${inputData.studentName ?? inputData.studentCode}.\nHóa đơn: ${inputData.invoiceCode ?? 'N/A'}`,
        };
      }
      return {
        ...inputData,
        resultText: `❌ Thanh toán đã bị từ chối cho ${inputData.studentName ?? inputData.studentCode}.`,
      };
    },
  });

  // ------------------------------------------------------------------
  // Step 10: writeAuditLog
  // ------------------------------------------------------------------
  const writeAuditLog = createStep({
    id: 'writeAuditLog',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      try {
        await auditService.log({
          EntityType: 'Payment',
          EntityCode: inputData.paymentCode ?? inputData.eventCode,
          Action: 'RECORD_PAYMENT_TEXT',
          NewValue: JSON.stringify({
            studentCode: inputData.studentCode,
            amount: inputData.amount,
            approvalStatus: inputData.approvalStatus,
            paymentCode: inputData.paymentCode,
          }),
          ActorType: 'workflow',
          ActorDetail: 'record-payment-from-text',
        });
      } catch {
        // Non-blocking — audit failures should not crash the workflow
      }
      return inputData;
    },
  });

  // ------------------------------------------------------------------
  // Compose workflow
  // ------------------------------------------------------------------
  return createWorkflow({
    id: 'record-payment-from-text',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
  })
    .then(parsePaymentText)
    .then(resolveStudent)
    .then(resolveInvoice)
    .then(calculateStatus)
    .then(detectDuplicate)
    .then(createPaymentDraft)
    .then(suspendForApproval)
    .then(processApproval)
    .then(reportResult)
    .then(writeAuditLog)
    .commit();
}
