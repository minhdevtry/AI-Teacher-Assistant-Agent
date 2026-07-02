import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import type { ToolAction } from '@mastra/core/tools';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = ToolAction<any, any>;

export interface BillingAgentTools {
  getStudentBalance: AnyTool;
  getClassDebtList: AnyTool;
  createPaymentDraft: AnyTool;
  confirmPayment: AnyTool;
  rejectPaymentDraft: AnyTool;
  detectDuplicatePayment: AnyTool;
  allocatePayment: AnyTool;
  extractBillFromImage: AnyTool;
  generateReminderMessages: AnyTool;
  collectMonthlyData: AnyTool;
  createMonthlyReport: AnyTool;
  queueGoogleSheetSync: AnyTool;
}

/**
 * BillingAgent factory.
 *
 * Handles ALL money-related tasks: balances, debts, payment drafts,
 * confirmations, duplicate detection, monthly reports, and Google Sheets sync.
 */
export function createBillingAgent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  tools: BillingAgentTools,
): Agent {
  return new Agent({
    id: 'billing',
    name: 'Billing Agent',
    instructions: `Bạn là chuyên viên thanh toán của trung tâm gia sư, làm việc hoàn toàn bằng tiếng Việt.
Nhiệm vụ chính của bạn:
- Quản lý số dư học viên, danh sách công nợ theo lớp.
- Tạo phiếu thanh toán nháp (payment draft) và chờ xác nhận.
- Xác nhận hoặc từ chối phiếu thanh toán.
- Phát hiện thanh toán trùng lặp.
- Phân bổ thanh toán vào các khoản nợ tương ứng.
- Trích xuất hóa đơn từ hình ảnh (OCR).
- Tạo tin nhắn nhắc nhở thanh toán.
- Thu thập dữ liệu hàng tháng và tạo báo cáo tháng.
- Đồng bộ dữ liệu lên Google Sheets.

Quy tắc:
1. Mọi thao tác liên quan đến tiền đều phải rõ ràng, có xác nhận.
2. Không tự ý xác nhận thanh toán — luôn chờ giáo viên/phụ huynh xác nhận.
3. Khi phát hiện trùng lặp → cảnh báo và đưa ra tùy chọn.
4. Báo cáo tháng phải đầy đủ, chính xác, dễ đọc.
5. Luôn trả lời bằng tiếng Việt.`,
    model,
    tools: {
      getStudentBalance: tools.getStudentBalance,
      getClassDebtList: tools.getClassDebtList,
      createPaymentDraft: tools.createPaymentDraft,
      confirmPayment: tools.confirmPayment,
      rejectPaymentDraft: tools.rejectPaymentDraft,
      detectDuplicatePayment: tools.detectDuplicatePayment,
      allocatePayment: tools.allocatePayment,
      extractBillFromImage: tools.extractBillFromImage,
      generateReminderMessages: tools.generateReminderMessages,
      collectMonthlyData: tools.collectMonthlyData,
      createMonthlyReport: tools.createMonthlyReport,
      queueGoogleSheetSync: tools.queueGoogleSheetSync,
    },
    memory: new Memory(),
  });
}
