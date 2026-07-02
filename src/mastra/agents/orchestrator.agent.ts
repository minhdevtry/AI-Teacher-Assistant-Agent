import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import type { ToolAction } from '@mastra/core/tools';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = ToolAction<any, any>;

export interface OrchestratorAgentTools {
  searchStudent: AnyTool;
  createStudent: AnyTool;
  updateStudent: AnyTool;
  listStudents: AnyTool;
  createClass: AnyTool;
  updateClass: AnyTool;
  listClasses: AnyTool;
  getClassDetail: AnyTool;
  moveStudent: AnyTool;
  getTeacherProfile: AnyTool;
  sendChannelMessage: AnyTool;
}

/**
 * OrchestratorAgent factory.
 *
 * Receives messages from teachers via Zalo, classifies intent,
 * handles CRUD for students/classes, and delegates billing to BillingAgent.
 */
export function createOrchestratorAgent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  tools: OrchestratorAgentTools,
  billingAgent: Agent,
): Agent {
  return new Agent({
    id: 'orchestrator',
    name: 'Orchestrator Agent',
    instructions: `Bạn là trợ lý quản lý trung tâm gia sư bằng tiếng Việt.
Nhiệm vụ chính của bạn:
- Nhận tin nhắn từ giáo viên qua Zalo.
- Phân loại ý định và xử lý các thao tác CRUD cho học viên và lớp học.
- Chuyển các tác vụ liên quan đến thanh toán/học phí cho BillingAgent (subagent).
- Luôn hỏi xác nhận trước khi thực hiện thay đổi dữ liệu quan trọng.
- Trả lời bằng tiếng Việt, thân thiện và chuyên nghiệp.

Quy tắc:
1. Khi giáo viên yêu cầu thêm/sửa/xóa học viên hoặc lớp → xác nhận trước khi thực hiện.
2. Khi yêu cầu liên quan đến tiền (học phí, thanh toán, công nợ, số dư, hóa đơn, báo cáo tháng) → delegate cho BillingAgent.
3. Nếu không chắc chắn về ý định → hỏi lại rõ ràng.
4. Luôn trả lời ngắn gọn, dễ hiểu.
5. Khi người dùng nhắc đến tên lớp (ví dụ "Toán 12") thay vì mã lớp, hãy gọi listClasses trước để tìm mã lớp tương ứng, sau đó mới gọi tool cần thiết. Đừng bao giờ hỏi lại mã lớp nếu đã có tên lớp.
6. Khi người dùng yêu cầu xem danh sách học sinh của một lớp, hãy dùng getClassDetail (không phải listStudents) để có thông tin đầy đủ nhất.`,
    model,
    tools: {
      searchStudent: tools.searchStudent,
      createStudent: tools.createStudent,
      updateStudent: tools.updateStudent,
      listStudents: tools.listStudents,
      createClass: tools.createClass,
      updateClass: tools.updateClass,
      listClasses: tools.listClasses,
      getClassDetail: tools.getClassDetail,
      moveStudent: tools.moveStudent,
      getTeacherProfile: tools.getTeacherProfile,
      sendChannelMessage: tools.sendChannelMessage,
    },
    agents: {
      billing: billingAgent,
    },
    memory: new Memory(),
  });
}
