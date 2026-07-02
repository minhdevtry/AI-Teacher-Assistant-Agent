import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import type { UsersService } from '../../domain/users/users.service';
import type { InvoicesService } from '../../domain/invoices/invoices.service';
import type { PaymentsService } from '../../domain/payments/payments.service';
import type { AuditService } from '../../domain/common/audit.service';
import type { ApprovalService } from '../approval.service';
import type { SupabaseService } from '../../integrations/supabase/supabase.service';

const ctxSchema = z.object({
  // --- Input ---
  imageUrl: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  platform: z.string(),
  eventCode: z.string(),
  // --- Bill extraction ---
  extractedAmount: z.number().optional(),
  extractedBank: z.string().optional(),
  extractedTime: z.string().optional(),
  extractedNote: z.string().optional(),
  confidenceScore: z.number().optional(),
  storedImageUrl: z.string().optional(),
  // --- Resolved ---
  studentName: z.string().optional(),
  studentCode: z.string().optional(),
  classCode: z.string().optional(),
  invoiceCode: z.string().optional(),
  invoiceTotal: z.number().optional(),
  paidBefore: z.number().optional(),
  balanceAfter: z.number().optional(),
  billingMonth: z.string().optional(),
  // --- Payment ---
  amount: z.number().optional(),
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
 * Build the record-payment-from-bill-image workflow.
 *
 * Steps:
 *  1. downloadBillImage          — fetch image from Zalo URL
 *  2. storeImageToSupabaseStorage — upload to Supabase Storage
 *  3. extractBillWithVision      — OCR the bill
 *  4. normalizeBillData          — clean extracted data
 *  5. resolveStudentCandidates   — find matching students
 *  6. matchInvoice               — find/create invoice
 *  7. detectDuplicate            — check for duplicates
 *  8. calculateStatus            — balance computation
 *  9. createPaymentDraft         — draft with image evidence
 * 10. suspendForApproval         — SUSPEND with image evidence
 * 11. processApproval            — RESUME
 * 12. attachEvidenceAndConfirm   — confirm payment + queue sync
 * 13. reportResult               — build response
 * 14. writeAuditLog              — audit trail
 */
export function createRecordPaymentFromBillWorkflow(
  usersService: UsersService,
  invoicesService: InvoicesService,
  paymentsService: PaymentsService,
  auditService: AuditService,
  approvalService: ApprovalService,
  supabaseService: SupabaseService,
) {
  // ------------------------------------------------------------------
  // Step 1: downloadBillImage
  // ------------------------------------------------------------------
  const downloadBillImage = createStep({
    id: 'downloadBillImage',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      // In production this would download the actual image bytes.
      // For now we just validate the URL and pass it through.
      if (!inputData.imageUrl) {
        return { ...inputData, error: 'Không có hình ảnh hóa đơn.' };
      }
      return { ...inputData };
    },
  });

  // ------------------------------------------------------------------
  // Step 2: storeImageToSupabaseStorage
  // ------------------------------------------------------------------
  const storeImageToSupabaseStorage = createStep({
    id: 'storeImageToSupabaseStorage',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error) return inputData;
      try {
        const client = supabaseService.getClient();
        const fileName = `bills/${Date.now()}_${inputData.senderId}.jpg`;
        // Store a reference URL — actual upload would need the image buffer
        const { data } = await client.storage
          .from('bills')
          .getPublicUrl(fileName);
        return {
          ...inputData,
          storedImageUrl: data.publicUrl ?? inputData.imageUrl,
        };
      } catch {
        // Fallback to original URL if storage fails
        return { ...inputData, storedImageUrl: inputData.imageUrl };
      }
    },
  });

  // ------------------------------------------------------------------
  // Step 3: extractBillWithVision
  // ------------------------------------------------------------------
  const extractBillWithVision = createStep({
    id: 'extractBillWithVision',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error) return inputData;
      // Placeholder — in production this calls a vision model
      // For now return empty extraction (will be wired to AI_VISION_MODEL)
      return {
        ...inputData,
        extractedAmount: undefined,
        extractedBank: undefined,
        extractedTime: undefined,
        extractedNote: 'OCR chưa được tích hợp — placeholder',
        confidenceScore: 0,
      };
    },
  });

  // ------------------------------------------------------------------
  // Step 4: normalizeBillData
  // ------------------------------------------------------------------
  const normalizeBillData = createStep({
    id: 'normalizeBillData',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error) return inputData;
      // Clean up extracted data: trim strings, validate amount
      const amount = inputData.extractedAmount && inputData.extractedAmount > 0
        ? inputData.extractedAmount
        : undefined;
      const bank = inputData.extractedBank?.trim() || undefined;
      return {
        ...inputData,
        amount,
        extractedBank: bank,
      };
    },
  });

  // ------------------------------------------------------------------
  // Step 5: resolveStudentCandidates
  // ------------------------------------------------------------------
  const resolveStudentCandidates = createStep({
    id: 'resolveStudentCandidates',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error) return inputData;
      // Try to match by sender Zalo ID first
      try {
        const user = await usersService.findByZaloUserId(inputData.senderId);
        if (user && user.Role === 'student') {
          return {
            ...inputData,
            studentCode: user.Code,
            studentName: user.Name,
            classCode: user.ClassCode ?? undefined,
          };
        }
        // If sender is a parent, find linked students
        if (user && user.Role === 'parent') {
          // Search by parent linkage — simplified, just note we couldn't auto-resolve
          return { ...inputData, error: 'Phụ huynh gửi ảnh — vui lòng cho biết tên học sinh.' };
        }
      } catch {
        // fallthrough
      }
      return { ...inputData, error: 'Không thể xác định học sinh từ hình ảnh. Vui lòng gửi kèm tên học sinh.' };
    },
  });

  // ------------------------------------------------------------------
  // Step 6: matchInvoice
  // ------------------------------------------------------------------
  const matchInvoice = createStep({
    id: 'matchInvoice',
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
        if (!inputData.classCode || !inputData.amount) {
          return { ...inputData, error: 'Không tìm thấy hóa đơn và thiếu thông tin để tạo mới.' };
        }
        const inv = await invoicesService.create({
          StudentCode: inputData.studentCode,
          ClassCode: inputData.classCode,
          BillingMonth: month,
          TotalAmount: inputData.amount,
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
  // Step 7: detectDuplicate
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
  // Step 8: calculateStatus
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
      return { ...inputData, balanceAfter: total - paid - paying };
    },
  });

  // ------------------------------------------------------------------
  // Step 9: createPaymentDraft
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
          Method: 'bank_transfer',
          InvoiceCode: inputData.invoiceCode,
          PaidAt: inputData.extractedTime ?? new Date().toISOString(),
          FileUrl: inputData.storedImageUrl ?? inputData.imageUrl,
          FileType: 'image/jpeg',
          ExtractedAmount: inputData.extractedAmount,
          ExtractedNote: inputData.extractedNote,
          ExtractedBank: inputData.extractedBank,
          ExtractedTime: inputData.extractedTime,
          ConfidenceScore: inputData.confidenceScore,
          CreatedFrom: 'ai_extraction',
        });
        return { ...inputData, paymentCode: draft.Code };
      } catch {
        return { ...inputData, error: 'Lỗi khi tạo phiếu thanh toán nháp.' };
      }
    },
  });

  // ------------------------------------------------------------------
  // Step 10: suspendForApproval
  // ------------------------------------------------------------------
  const suspendForApproval = createStep({
    id: 'suspendForApproval',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData, suspend }) => {
      if (inputData.error || !inputData.paymentCode) return inputData;

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await approvalService.createApproval(
        inputData.eventCode,
        `Thanh toán ${inputData.amount?.toLocaleString('vi-VN')}đ từ hóa đơn cho ${inputData.studentName ?? inputData.studentCode}`,
        'record_payment_bill',
        expiresAt,
      );

      return suspend(
        {
          eventCode: inputData.eventCode,
          paymentCode: inputData.paymentCode,
          imageUrl: inputData.storedImageUrl ?? inputData.imageUrl,
          summary: `Xác nhận thanh toán từ hóa đơn ${inputData.amount?.toLocaleString('vi-VN')}đ`,
        },
        { resumeLabel: 'approval-response' },
      ) as unknown as Ctx;
    },
  });

  // ------------------------------------------------------------------
  // Step 11: processApproval
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
  // Step 12: attachEvidenceAndConfirm
  // ------------------------------------------------------------------
  const attachEvidenceAndConfirm = createStep({
    id: 'attachEvidenceAndConfirm',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
    execute: async ({ inputData }) => {
      if (inputData.error || inputData.approvalStatus !== 'approved') return inputData;
      // Queue Google Sheets sync (placeholder — wired in Task 9)
      // Evidence URL is already attached in the payment draft
      return inputData;
    },
  });

  // ------------------------------------------------------------------
  // Step 13: reportResult
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
        const conf = inputData.confidenceScore ? `\nĐộ tin cậy OCR: ${(inputData.confidenceScore * 100).toFixed(0)}%` : '';
        return {
          ...inputData,
          resultText: `✅ Đã xác nhận thanh toán từ hóa đơn ${fmt} cho ${inputData.studentName ?? inputData.studentCode}.${conf}\nHóa đơn: ${inputData.invoiceCode ?? 'N/A'}`,
        };
      }
      return {
        ...inputData,
        resultText: `❌ Thanh toán từ hóa đơn đã bị từ chối cho ${inputData.studentName ?? inputData.studentCode}.`,
      };
    },
  });

  // ------------------------------------------------------------------
  // Step 14: writeAuditLog
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
          Action: 'RECORD_PAYMENT_BILL',
          NewValue: JSON.stringify({
            studentCode: inputData.studentCode,
            amount: inputData.amount,
            approvalStatus: inputData.approvalStatus,
            paymentCode: inputData.paymentCode,
            imageUrl: inputData.storedImageUrl ?? inputData.imageUrl,
            confidenceScore: inputData.confidenceScore,
          }),
          ActorType: 'workflow',
          ActorDetail: 'record-payment-from-bill',
        });
      } catch {
        // Non-blocking
      }
      return inputData;
    },
  });

  // ------------------------------------------------------------------
  // Compose workflow
  // ------------------------------------------------------------------
  return createWorkflow({
    id: 'record-payment-from-bill',
    inputSchema: ctxSchema,
    outputSchema: ctxSchema,
  })
    .then(downloadBillImage)
    .then(storeImageToSupabaseStorage)
    .then(extractBillWithVision)
    .then(normalizeBillData)
    .then(resolveStudentCandidates)
    .then(matchInvoice)
    .then(detectDuplicate)
    .then(calculateStatus)
    .then(createPaymentDraft)
    .then(suspendForApproval)
    .then(processApproval)
    .then(attachEvidenceAndConfirm)
    .then(reportResult)
    .then(writeAuditLog)
    .commit();
}
