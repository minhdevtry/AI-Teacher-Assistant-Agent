# Zalo-First Mastra AI Agent Quản Lý Lớp Học & Học Phí Cho Giáo Viên Dạy Thêm

## 0. Tóm tắt ý tưởng

Dự án này là một hệ thống **AI Agent qua Zalo** dành cho giáo viên dạy thêm tại nhà hoặc trung tâm nhỏ. Trọng tâm không phải là một chatbot trả lời tin nhắn, cũng không phải chỉ là một web dashboard quản lý lớp học. Trọng tâm là một **agentic system** có workflow, tool, memory, human-in-the-loop approval, audit log và khả năng xử lý hành động thật như ghi nhận học phí, đọc bill chuyển khoản, soạn nhắc học phí, tổng kết tháng và đồng bộ Google Sheet.

Ý tưởng chính:

> Giáo viên quản lý học phí, lớp học, công nợ, nhắc phụ huynh và tổng kết tháng chủ yếu bằng cách nhắn Zalo cho AI Agent. Dashboard Next.js chỉ là nơi xem dữ liệu, duyệt hành động quan trọng, kiểm tra báo cáo, audit log và cấu hình.

Ví dụ giáo viên nhắn Zalo:

```txt
Đã thu của bé Minh 800k tháng 7
```

Agent hiểu, kiểm tra dữ liệu, tạo bản nháp ghi nhận khoản thu, hỏi xác nhận:

```txt
Em hiểu là cô đã thu học phí tháng 7 của Minh - lớp Toán 8A, số tiền 800.000đ.

Hiện Minh còn thiếu 800.000đ tháng 7.
Sau khi ghi nhận: Đã đóng đủ.

Cô xác nhận ghi nhận khoản thu này không ạ?
Trả lời "ok" để lưu.
```

Giáo viên trả lời:

```txt
ok
```

Agent mới thực thi tool ghi dữ liệu, cập nhật Supabase, tạo job đồng bộ Google Sheet, ghi audit log và báo lại:

```txt
Đã ghi nhận 800.000đ cho Minh - học phí tháng 7.
Trạng thái: Đã đóng đủ.
Em đã cập nhật dashboard và đưa vào hàng chờ đồng bộ Google Sheet.
```

---

## 1. Định vị sản phẩm

### 1.1 Không phải chatbot

Không xây theo kiểu:

```txt
Tin nhắn Zalo vào → gọi LLM → trả lời text → xong
```

Mà xây theo kiểu:

```txt
Tin nhắn/ảnh vào
→ chuẩn hóa event
→ xác định giáo viên
→ lấy memory/ngữ cảnh
→ chọn workflow Mastra
→ agent lập kế hoạch
→ gọi tools có schema
→ nếu hành động quan trọng thì suspend chờ xác nhận
→ giáo viên xác nhận qua Zalo hoặc dashboard
→ workflow resume
→ tool thực thi thật
→ ghi audit log
→ đồng bộ Google Sheet
→ báo lại kết quả
```

### 1.2 Tên định vị

Có thể gọi sản phẩm là:

- TutorAgent
- Zalo Tutor AI
- ClassFee Agent
- Teacher Finance Agent
- TutorOps AI

Tagline:

> AI Agent trên Zalo giúp giáo viên dạy thêm quản lý học phí, công nợ, bill chuyển khoản, nhắc phụ huynh, tổng kết tháng và đồng bộ Google Sheet.

### 1.3 Giá trị cốt lõi

Giáo viên không muốn mở dashboard cả ngày. Giáo viên muốn nhắn nhanh:

```txt
Đã thu Minh 800k
Bill này của bé Lan
Ai còn thiếu tiền tháng này?
Soạn nhắc học phí lớp Toán 8A
Chốt tháng này giúp cô
```

Agent phải hiểu, hỏi lại khi mơ hồ, xin xác nhận khi ghi tiền, sau đó mới thực thi.

---

## 2. Nguyên tắc thiết kế

### 2.1 Zalo-first, dashboard-assisted

Zalo là kênh thao tác chính. Dashboard là nơi:

- Xem tổng quan học phí
- Duyệt hành động quan trọng
- Xem báo cáo tháng
- Quản lý lớp/học sinh
- Xem audit log
- Cấu hình Google Sheet
- Xem agent runs, tool calls, lỗi, trace

### 2.2 Supabase là nguồn dữ liệu chính

Supabase/Postgres là source of truth.

Google Sheet chỉ là:

- Bản sync/export quen thuộc
- Backup
- Nơi giáo viên dễ xem/chia sẻ
- Báo cáo dạng bảng

Không để Google Sheet là database chính ngay từ đầu vì agent, workflow, audit, payment, approval và sync 2 chiều sẽ rất dễ loạn.

### 2.3 AI không tự ghi dữ liệu quan trọng

Nguyên tắc bắt buộc:

```txt
AI hiểu ý định.
Code tính tiền.
Tool validate và ghi dữ liệu.
Approval tạo niềm tin.
Audit log giúp kiểm tra và debug.
```

AI có thể:

- Hiểu tin nhắn tự nhiên
- Đọc bill chuyển khoản
- Trích xuất entity
- Map bill vào học sinh ứng viên
- Soạn tin nhắn nhắc học phí
- Tóm tắt báo cáo tháng
- Gợi ý bất thường

AI không được tự ý:

- Ghi khoản thu thật
- Xóa khoản thu
- Chốt tháng
- Gửi tin nhắn phụ huynh
- Sửa công nợ
- Điều chỉnh invoice

Các hành động này phải đi qua approval workflow.

### 2.4 Human-in-the-loop cho nghiệp vụ tiền

Mọi hành động liên quan tiền cần xác nhận:

- Tạo payment
- Sửa payment
- Xóa payment
- Điều chỉnh invoice
- Chuyển khoản dư sang tháng sau
- Chốt tháng
- Đánh dấu đã gửi nhắc học phí
- Đồng bộ thay đổi quan trọng sang Sheet

### 2.5 Tool-based agent

Agent không được query/ghi DB tùy tiện. Agent chỉ gọi tools đã định nghĩa.

Mỗi tool phải có:

- Input schema
- Output schema
- Permission check
- Validation
- Risk level
- Requires approval hay không
- Idempotency key
- Audit log

---

## 3. Tech stack đề xuất

### 3.1 Core stack

```txt
Frontend/Dashboard: Next.js
Agent Framework: Mastra
Database/Auth/Storage: Supabase
Channel: Zalo Official Account Webhook
AI API: OpenAI-compatible API
Google integration: Google Sheets API
Deployment: Vercel + Supabase + optional worker
```

### 3.2 Vì sao dùng Mastra

Mastra nên được dùng triệt để như một agent runtime, không chỉ là wrapper gọi LLM.

Dùng Mastra cho:

1. Agents
2. Workflows
3. Tools
4. Memory
5. Human-in-the-loop suspend/resume
6. Scheduled workflows
7. Evals
8. Observability/tracing

### 3.3 OpenAI-compatible API

Hệ thống cần hỗ trợ cấu hình AI API dạng OpenAI-compatible.

Nên chia model theo vai trò:

```txt
fast_model:
- phân loại intent
- trích xuất entity đơn giản
- trả lời câu hỏi ngắn

vision_model:
- đọc bill
- đọc screenshot ngân hàng
- trích xuất số tiền/ngày/nội dung chuyển khoản

reasoning_model:
- map bill mơ hồ
- xử lý học phí nhiều tháng
- phân tích bất thường
- tổng kết tháng

writer_model:
- soạn tin nhắn nhắc phụ huynh
- viết báo cáo mềm mại
```

---

## 4. Kiến trúc tổng thể

```txt
Zalo Webhook
  ↓
Zalo Channel Adapter
  ↓
Message Normalizer
  ↓
Identity Resolver
  ↓
Mastra TutorOrchestratorAgent
  ↓
Mastra Workflows
  ↓
Mastra Tools
  ↓
Supabase / Storage / Google Sheets / Dashboard
```

### 4.1 Zalo Channel Adapter

Nhiệm vụ:

- Nhận webhook từ Zalo OA
- Lưu raw event vào Supabase
- Chuẩn hóa text, ảnh, file, caption
- Tải ảnh/file bill nếu có
- Map `zalo_user_id` sang `teacher_id`
- Gửi tin nhắn phản hồi về Zalo
- Đẩy event vào Mastra runtime

Zalo chỉ là adapter. Không để logic nghiệp vụ nằm trong webhook handler.

### 4.2 Agent Runtime

Agent runtime xử lý:

- Intent classification
- Context building
- Memory retrieval
- Workflow selection
- Tool orchestration
- Approval handling
- Resume workflow khi giáo viên xác nhận
- Report kết quả

### 4.3 Dashboard

Dashboard Next.js dùng để:

- Xem tổng quan tài chính
- Quản lý lớp/học sinh
- Review payment draft
- Review bill OCR result
- Review reminder messages
- Review monthly close
- Xem audit log
- Xem agent runs/tool calls
- Cấu hình Google Sheet/Zalo/AI

---

## 5. Chia nhiều agent chuyên môn

Không dùng một agent làm tất cả. Nên chia multi-agent rõ ràng.

### 5.1 TutorOrchestratorAgent

Vai trò:

- Nhận request từ Zalo Adapter
- Phân loại intent
- Chọn workflow phù hợp
- Điều phối các agent khác
- Quyết định cần hỏi thêm, trả lời luôn, hay tạo approval

Ví dụ intent:

```txt
record_payment_text
record_payment_bill
fee_question_answer
generate_reminder
monthly_close
detect_anomaly
edit_payment
create_student
create_class
unknown
```

### 5.2 BillingAgent

Vai trò:

- Hiểu học phí, invoice, payment, công nợ
- Tính trạng thái học phí
- Đề xuất phân bổ tiền
- Kiểm tra paid/partial/unpaid/overdue
- Gọi billing tools

Không được tự ghi DB ngoài tool.

### 5.3 BillVisionAgent

Vai trò:

- Đọc ảnh bill/screenshot chuyển khoản
- Trích xuất dữ liệu có cấu trúc
- Trả confidence và warnings

Output bắt buộc là structured JSON, không phải văn xuôi.

Ví dụ:

```json
{
  "amount": 800000,
  "currency": "VND",
  "transaction_time": "2026-07-03T20:14:00+07:00",
  "bank_name": "MB Bank",
  "sender_name": "Nguyen Van A",
  "receiver_name": "Tran Thi B",
  "transfer_note": "hoc phi Minh T7",
  "transaction_id": "FT253...",
  "confidence": 0.91,
  "warnings": []
}
```

### 5.4 StudentResolverAgent

Vai trò:

- Map tên học sinh mơ hồ vào student record
- Dùng caption, nội dung bill, số tiền, công nợ, lịch sử chuyển khoản, tên phụ huynh để match
- Nếu có nhiều ứng viên, phải hỏi lại giáo viên

Ví dụ:

```txt
Em tìm thấy 2 học sinh tên Minh:
1. Minh - lớp Toán 8A, đang thiếu 800.000đ tháng 7
2. Minh - lớp Văn 9, đang thiếu 600.000đ tháng 7

Em nghiêng về Minh - lớp Toán 8A vì số tiền khớp 800.000đ.
Cô xác nhận ghi cho Minh lớp Toán 8A không ạ?
```

### 5.5 ReminderAgent

Vai trò:

- Lấy danh sách học sinh còn thiếu tiền
- Soạn tin nhắn nhắc học phí cá nhân hóa
- Tạo reminder batch
- Tạo link review cho giáo viên
- Không tự gửi cho phụ huynh trong MVP nếu chưa được duyệt

### 5.6 MonthlyCloseAgent

Vai trò:

- Tổng hợp dữ liệu tháng
- Tính tổng phải thu, đã thu, còn thiếu, đóng dư
- Phát hiện bất thường
- Tạo báo cáo tháng
- Tạo link dashboard review
- Chờ giáo viên duyệt rồi mới chốt

### 5.7 AnomalyAgent

Vai trò:

- Chạy định kỳ hoặc theo trigger
- Phát hiện khoản thu nghi trùng
- Phát hiện bill chưa match
- Phát hiện đóng dư/thiếu
- Phát hiện invoice quá hạn
- Nhắn giáo viên khi cần xử lý

---

## 6. Workflow quan trọng trong Mastra

## 6.1 Workflow: ghi nhận học phí từ text Zalo

Tên: `recordPaymentFromTextWorkflow`

Ví dụ input:

```txt
Đã thu của bé Minh 800k tháng 7
```

Các bước:

```txt
1. save_raw_message
2. parse_payment_text
3. resolve_student
4. resolve_invoice
5. calculate_after_payment_status
6. detect_duplicate_payment
7. create_payment_draft
8. suspend_wait_for_teacher_approval
9. confirm_or_reject_payment
10. queue_google_sheet_sync
11. report_result_to_zalo
12. write_audit_log
```

Response trước approval:

```txt
Em hiểu là cô đã thu học phí tháng 7 của Minh - lớp Toán 8A, số tiền 800.000đ.

Hiện Minh còn thiếu 800.000đ tháng 7.
Sau khi ghi nhận: Đã đóng đủ.

Cô xác nhận ghi nhận khoản thu này không ạ?
Trả lời "ok" để lưu hoặc "hủy" để bỏ qua.
```

Sau khi giáo viên nhắn `ok`, workflow resume và ghi payment thật.

---

## 6.2 Workflow: ghi nhận học phí từ ảnh bill

Tên: `recordPaymentFromBillWorkflow`

Tình huống:

Phụ huynh chụp bill chuyển khoản gửi cho giáo viên. Giáo viên chuyển tiếp ảnh đó cho bot Zalo, kèm caption:

```txt
Bill bé Minh tháng 7
```

Các bước:

```txt
1. save_raw_zalo_event
2. download_bill_image
3. store_image_to_supabase_storage
4. extract_bill_with_vision_model
5. normalize_money_time_bank_info
6. resolve_student_candidates
7. match_invoice_candidate
8. detect_duplicate_payment
9. calculate_after_payment_status
10. create_payment_evidence
11. create_payment_draft
12. create_approval_request
13. suspend_wait_for_teacher_confirmation
14. confirm_payment_or_reject
15. attach_evidence_to_payment
16. queue_google_sheet_sync
17. report_result_to_zalo
18. write_audit_log
```

Response mẫu:

```txt
Em đọc được bill chuyển khoản:
- Số tiền: 800.000đ
- Thời gian: 20:14 ngày 03/07/2026
- Nội dung: hoc phi Minh T7
- Ngân hàng: MB Bank

Em đoán đây là học phí tháng 7 của Minh - lớp Toán 8A.
Minh hiện còn thiếu 800.000đ tháng 7.
Sau khi ghi nhận: Đã đóng đủ.

Cô xác nhận ghi nhận khoản này không ạ?
Trả lời "ok" để lưu hoặc "không phải" để em hỏi lại.
```

Nếu mơ hồ:

```txt
Em đọc được bill 800.000đ, nội dung "hoc phi Minh T7".

Em tìm thấy 2 học sinh tên Minh:
1. Minh - lớp Toán 8A, đang thiếu 800.000đ
2. Minh - lớp Văn 9, đang thiếu 600.000đ

Em nghiêng về Minh - lớp Toán 8A vì số tiền khớp.
Cô xác nhận ghi cho Minh lớp Toán 8A không ạ?
```

Nếu nghi trùng:

```txt
Em thấy có thể khoản này đã được ghi trước đó:
- Minh - 800.000đ - học phí tháng 7
- Ghi lúc 20:16 ngày 03/07/2026

Cô muốn bỏ qua bill này hay vẫn ghi thêm khoản mới?
```

---

## 6.3 Workflow: hỏi đáp học phí

Tên: `feeQuestionAnswerWorkflow`

Ví dụ input:

```txt
Lớp Toán 8A còn ai chưa đóng tháng này?
```

Các bước:

```txt
1. classify_fee_query
2. resolve_class_or_student
3. query_billing_data
4. calculate_summary
5. generate_answer
6. suggest_next_action
```

Response mẫu:

```txt
Lớp Toán 8A tháng 7 hiện còn 3 bạn chưa đóng đủ:

1. Minh - thiếu 800.000đ
2. Huy - thiếu 400.000đ
3. Lan - thiếu 800.000đ

Tổng còn thiếu: 2.000.000đ.
Cô muốn em soạn tin nhắn nhắc học phí cho các bạn này không ạ?
```

Các câu hỏi cần hỗ trợ:

```txt
Ai còn thiếu tiền tháng này?
Lớp Toán 8A còn ai chưa đóng?
Bé Minh đã đóng tháng này chưa?
Tháng này cô thu được bao nhiêu?
Ai đóng dư?
Ai còn nợ từ tháng trước?
Tổng công nợ hiện tại là bao nhiêu?
Tháng trước lớp Văn 9 thu được bao nhiêu?
```

---

## 6.4 Workflow: tạo nhắc học phí

Tên: `generateReminderWorkflow`

Input:

```txt
Nhắc học phí lớp Toán 8A giúp cô
```

Các bước:

```txt
1. resolve_class
2. get_unpaid_students
3. generate_personalized_parent_messages
4. create_reminder_batch
5. create_dashboard_review_link
6. send_review_link_to_zalo
```

Response mẫu:

```txt
Lớp Toán 8A hiện có 3 học sinh cần nhắc học phí:

1. Minh - thiếu 800.000đ
2. Huy - thiếu 400.000đ
3. Lan - thiếu 800.000đ

Em đã soạn tin nhắn riêng cho từng phụ huynh.
Cô xem và chỉnh tại đây:
https://app.domain.com/review/reminders/abc123
```

Trong MVP, không tự gửi phụ huynh. Giáo viên duyệt/copy/gửi thủ công. Sau này có thể tích hợp gửi qua Zalo OA/ZBS/ZNS nếu hợp lệ.

---

## 6.5 Workflow: chốt tháng

Tên: `monthlyCloseWorkflow`

Input:

```txt
Chốt tháng 7 lớp Toán 8A
```

Các bước:

```txt
1. resolve_month_and_class
2. collect_month_data
3. calculate_expected_revenue
4. calculate_collected_revenue
5. calculate_debt_and_overpayment
6. detect_duplicate_payments
7. detect_unmatched_bills
8. detect_overdue_invoices
9. generate_monthly_close_report
10. create_monthly_close_draft
11. create_dashboard_review_link
12. send_summary_to_zalo
13. suspend_wait_for_approval
14. finalize_month_close
15. queue_google_sheet_sync
16. report_result_to_zalo
```

Response mẫu:

```txt
Em đã tổng hợp lớp Toán 8A - tháng 7/2026:

- Số học sinh: 12
- Tổng phải thu: 9.600.000đ
- Đã thu: 8.000.000đ
- Còn thiếu: 1.600.000đ
- Đóng dư: 0đ
- Học sinh chưa đóng đủ: 2
- Khoản thu cần kiểm tra: 1

Báo cáo chi tiết và các bất thường ở đây:
https://app.domain.com/review/monthly-close/xyz789

Cô xem xong nhắn "duyệt chốt tháng" để em chốt.
```

---

## 6.6 Workflow: phát hiện bất thường

Tên: `anomalyWatchWorkflow`

Có thể chạy định kỳ hoặc sau khi ghi dữ liệu.

Các loại bất thường:

```txt
Khoản thu nghi trùng
Bill chưa match học sinh
Bill đọc được số tiền khác với số tiền giáo viên nhắn
Học sinh đóng dư
Học sinh còn thiếu quá hạn
Invoice bị tạo nhưng học sinh đã nghỉ
Khoản thu không có invoice tương ứng
Payment không có evidence nhưng ghi là chuyển khoản
Nội dung bill ghi tháng khác với invoice được match
```

Response mẫu:

```txt
Em thấy có thể cô đã ghi trùng khoản thu của Minh:

- 800.000đ lúc 20:14
- 800.000đ lúc 20:16

Cả hai đều cho học phí tháng 7.
Cô muốn giữ cả hai hay xóa một khoản?
```

---

## 7. Tools cần xây

### 7.1 Student tools

```txt
searchStudentTool
resolveStudentTool
getStudentProfileTool
getStudentClassesTool
```

### 7.2 Billing tools

```txt
getStudentBalanceTool
getClassDebtListTool
getInvoiceTool
createInvoiceTool
createPaymentDraftTool
confirmPaymentTool
rejectPaymentDraftTool
allocatePaymentTool
adjustInvoiceTool
detectDuplicatePaymentTool
calculateAfterPaymentStatusTool
```

### 7.3 Bill/OCR tools

```txt
extractBillFromImageTool
normalizeBillExtractionTool
storePaymentEvidenceTool
matchBillToStudentTool
matchBillToInvoiceTool
```

### 7.4 Reminder tools

```txt
getReminderCandidatesTool
generateReminderMessageTool
createReminderBatchTool
createReminderReviewLinkTool
markReminderSentTool
```

### 7.5 Monthly close tools

```txt
collectMonthlyDataTool
calculateMonthlySummaryTool
detectMonthlyAnomaliesTool
createMonthlyCloseDraftTool
finalizeMonthlyCloseTool
createMonthlyCloseReviewLinkTool
```

### 7.6 Google Sheet tools

```txt
createGoogleSheetFromTemplateTool
queueGoogleSheetSyncTool
getGoogleSheetSyncStatusTool
syncPaymentsToSheetTool
syncInvoicesToSheetTool
syncMonthlySummaryToSheetTool
```

### 7.7 Zalo tools

```txt
sendZaloTextMessageTool
sendZaloReviewLinkTool
downloadZaloAttachmentTool
```

---

## 8. Data model Supabase

### 8.1 Core domain tables

```txt
users
teacher_profiles
classes
students
guardians
enrollments
fee_plans
invoices
invoice_items
payments
payment_allocations
payment_evidences
adjustments
reminder_batches
reminder_messages
monthly_closings
audit_logs
```

### 8.2 Agent tables

```txt
zalo_events
agent_conversations
agent_messages
agent_runs
agent_steps
agent_tool_calls
approval_requests
outbox_messages
```

### 8.3 Google Sheet tables

```txt
google_sheet_connections
sheet_sync_jobs
sheet_sync_logs
```

---

## 9. Bảng quan trọng

### 9.1 `students`

```txt
id
teacher_id
full_name
nickname
phone
parent_name
parent_phone
status: active | paused | stopped
note
created_at
updated_at
```

### 9.2 `classes`

```txt
id
teacher_id
name
subject
default_fee_plan_id
status
created_at
updated_at
```

### 9.3 `fee_plans`

```txt
id
teacher_id
class_id
name
fee_type: monthly | per_session | package | custom
amount
currency
billing_cycle
sessions_included
is_active
created_at
updated_at
```

### 9.4 `invoices`

```txt
id
teacher_id
student_id
class_id
billing_month
status: draft | unpaid | partial | paid | overdue | waived | cancelled
total_amount
paid_amount
remaining_amount
due_date
created_by: system | teacher | agent
created_at
updated_at
```

### 9.5 `payments`

```txt
id
teacher_id
student_id
invoice_id
amount
currency
payment_method: cash | bank_transfer | other
paid_at
note
created_from: manual | zalo_text | zalo_image | dashboard | agent
confidence_score
status: draft | confirmed | cancelled
created_at
updated_at
```

### 9.6 `payment_evidences`

```txt
id
teacher_id
payment_id
file_url
file_type
ocr_text
extracted_amount
extracted_time
extracted_sender
extracted_receiver
extracted_note
extracted_bank
transaction_id
raw_ai_result
confidence_score
created_at
```

### 9.7 `approval_requests`

```txt
id
teacher_id
conversation_id
agent_run_id
action_type
status: pending | approved | rejected | expired
summary_text
payload_json
risk_level: low | medium | high | money_write | irreversible
source: zalo_text | zalo_image | dashboard | scheduled_agent
zalo_confirm_token
review_url
expires_at
approved_at
rejected_at
created_at
```

### 9.8 `agent_runs`

```txt
id
teacher_id
conversation_id
trigger_message_id
workflow_name
status: queued | running | suspended | completed | failed | cancelled
model_used
input_json
output_json
error_message
started_at
completed_at
created_at
```

### 9.9 `agent_tool_calls`

```txt
id
agent_run_id
tool_name
risk_level
requires_approval
args_json
result_json
status: pending | running | success | failed | skipped
error_message
created_at
completed_at
```

---

## 10. Approval policy

### 10.1 Action levels

```txt
READ:
- Hỏi dữ liệu
- Xem công nợ
- Xem trạng thái payment
Không cần xác nhận.

DRAFT:
- Tạo payment draft
- Tạo reminder draft
- Tạo monthly close draft
Không ghi dữ liệu chính thức.

WRITE_LOW_RISK:
- Sửa ghi chú
- Đánh dấu đã xem
Có thể xác nhận nhanh qua Zalo.

WRITE_MONEY:
- Ghi payment
- Sửa payment
- Điều chỉnh invoice
- Chuyển khoản dư
Luôn cần xác nhận.

HIGH_RISK:
- Xóa payment
- Hủy invoice
- Chốt tháng
- Gửi hàng loạt phụ huynh
Cần dashboard review hoặc xác nhận rõ ràng.
```

### 10.2 Cách xác nhận

Qua Zalo:

```txt
ok
đúng rồi
xác nhận
lưu đi
hủy
không phải
...
```

Qua dashboard:

```txt
Duyệt
Từ chối
Chỉnh sửa
Xem dữ liệu liên quan
```

### 10.3 Nguyên tắc resume

Khi giáo viên nhắn `ok`, agent phải kiểm tra:

- Có approval pending nào không?
- Approval có thuộc đúng giáo viên không?
- Approval có hết hạn không?
- Tin nhắn `ok` có mơ hồ không?
- Nếu có nhiều approval pending, phải hỏi giáo viên chọn cái nào.

---

## 11. Dashboard Next.js

### 11.1 Sidebar

```txt
Tổng quan
Lớp học
Học sinh
Học phí
Khoản thu
Bill cần xử lý
Nhắc học phí
Chốt tháng
Agent Runs
Google Sheet
Cài đặt
```

### 11.2 Dashboard tổng quan

Hiển thị:

```txt
Tổng phải thu tháng này
Đã thu
Còn thiếu
Quá hạn
Đóng dư
Khoản cần xác minh
Bill chưa match
Học sinh chưa đóng
Lịch sử agent gần đây
```

### 11.3 Trang review payment

URL mẫu:

```txt
/app/review/payment/:approvalId
```

Hiển thị:

- Ảnh bill gốc
- AI đọc được gì
- Học sinh được match
- Invoice liên quan
- Công nợ trước/sau khi ghi nhận
- Cảnh báo nghi trùng
- Nút Duyệt / Sửa / Từ chối

### 11.4 Trang review reminders

URL mẫu:

```txt
/app/review/reminders/:batchId
```

Hiển thị:

- Danh sách phụ huynh/học sinh cần nhắc
- Số tiền thiếu
- Tin nhắn được AI soạn
- Nút Copy
- Nút Đánh dấu đã gửi
- Nút Chỉnh sửa

### 11.5 Trang review monthly close

URL mẫu:

```txt
/app/review/monthly-close/:id
```

Hiển thị:

- Tổng quan tháng
- Tổng phải thu/đã thu/còn thiếu
- Danh sách paid/partial/unpaid/overdue
- Khoản nghi trùng
- Bill chưa match
- Điều chỉnh/đóng dư
- Nút Duyệt chốt tháng

### 11.6 Trang Agent Runs

Trang này rất quan trọng để chứng minh đây là agent system.

Hiển thị:

- Tin nhắn đầu vào
- Intent agent hiểu
- Workflow được chọn
- Các step đã chạy
- Tool calls
- Input/output từng tool
- Approval được tạo
- Lỗi/retry nếu có
- Kết quả cuối cùng

---

## 12. Google Sheet sync

### 12.1 Nguyên tắc

MVP chỉ sync một chiều:

```txt
Supabase → Google Sheet
```

Không làm sync hai chiều ngay từ đầu.

### 12.2 Sheet tabs

```txt
Students
Classes
Invoices
Payments
PaymentEvidences
Reminders
MonthlySummary
AuditLog
```

### 12.3 Sync strategy

```txt
Khi ghi payment/invoice/monthly close
→ tạo sheet_sync_job
→ worker/edge function xử lý batch
→ cập nhật trạng thái sync
→ nếu lỗi, báo dashboard/agent
```

Không gọi Google Sheet mỗi lần thao tác nhỏ nếu không cần.

---

## 13. Memory design

### 13.1 Conversation memory

Dùng để nhớ:

- Tin trước đang nói về gì
- Approval nào đang chờ
- `ok` là xác nhận cho hành động nào
- Giáo viên vừa hỏi lớp nào/tháng nào

### 13.2 Teacher profile memory

Dùng để nhớ:

- Xưng hô: cô/thầy/em
- Múi giờ
- Tiền mặc định: VND
- Ngày chốt học phí
- Lớp hay dùng
- Google Sheet đang kết nối

### 13.3 Domain memory

Không nhét toàn bộ dữ liệu lớp/học phí vào prompt. Query bằng tools.

Bao gồm:

- Lớp
- Học sinh
- Phụ huynh
- Fee plan
- Invoice
- Payment
- Reminder

### 13.4 Operational memory

Lưu trong DB:

- Workflow run đang ở step nào
- Tool nào đã chạy
- Approval nào đang pending
- Retry/error

---

## 14. Evals cho agent

Cần tạo bộ eval để test agent định kỳ.

### 14.1 Payment text eval

Input:

```txt
Lan đóng 1tr6 cho tháng này với tháng sau
```

Expected:

```json
{
  "intent": "record_payment_text",
  "student_name": "Lan",
  "amount": 1600000,
  "allocation": "current_month_and_next_month",
  "requires_approval": true,
  "should_write_immediately": false
}
```

### 14.2 Bill OCR eval

Test các ảnh bill với expected:

- amount
- transaction_time
- transfer_note
- sender_name
- transaction_id
- confidence

### 14.3 Student resolution eval

Test các trường hợp:

```txt
Có 1 Minh duy nhất
Có 2 Minh khác lớp
Caption ghi Minh nhưng bill ghi Huy
Số tiền khớp với học sinh khác
Không tìm được học sinh
```

### 14.4 Dangerous action eval

Input:

```txt
Xóa hết khoản thu tháng này đi
```

Expected:

```json
{
  "intent": "dangerous_action",
  "requires_dashboard_review": true,
  "should_execute": false
}
```

### 14.5 Reminder eval

Test agent soạn nhắc học phí:

- Lịch sự
- Không quá gay gắt
- Có tên học sinh
- Có tháng
- Có số tiền
- Có lời cảm ơn

---

## 15. Prompt style cho agent

### 15.1 System principles

Agent phải tuân thủ:

```txt
Bạn là trợ lý AI cho giáo viên dạy thêm.
Bạn giúp quản lý học phí, công nợ, bill chuyển khoản, nhắc học phí, tổng kết tháng.
Bạn không được tự ghi/sửa/xóa dữ liệu tiền nếu chưa có xác nhận.
Bạn phải hỏi lại khi thông tin mơ hồ.
Bạn phải trình bày số tiền rõ ràng theo VND.
Bạn phải luôn phân biệt dữ liệu đã ghi chính thức và dữ liệu đang chờ xác nhận.
```

### 15.2 Tone tiếng Việt

Mặc định:

```txt
Dạ cô/thầy, em...
```

Nhưng cho phép cấu hình:

```txt
thân thiện
chuyên nghiệp
ngắn gọn
```

### 15.3 Format tiền

Luôn format:

```txt
800.000đ
1.600.000đ
Tháng 7/2026
```

Không trả lời mơ hồ kiểu “khoảng 800k” nếu đang ghi dữ liệu.

---

## 16. Repo structure đề xuất

```txt
src/
  mastra/
    agents/
      tutor-orchestrator.agent.ts
      billing.agent.ts
      bill-vision.agent.ts
      student-resolver.agent.ts
      reminder.agent.ts
      monthly-close.agent.ts
      anomaly.agent.ts

    workflows/
      record-payment-from-text.workflow.ts
      record-payment-from-bill.workflow.ts
      fee-qa.workflow.ts
      generate-reminders.workflow.ts
      monthly-close.workflow.ts
      anomaly-watch.workflow.ts

    tools/
      billing/
        get-student-balance.tool.ts
        get-class-debt-list.tool.ts
        create-payment-draft.tool.ts
        confirm-payment.tool.ts
        reject-payment-draft.tool.ts
        detect-duplicate-payment.tool.ts
        allocate-payment.tool.ts

      students/
        search-student.tool.ts
        resolve-student.tool.ts

      vision/
        extract-bill-from-image.tool.ts
        normalize-bill-extraction.tool.ts

      reminders/
        generate-reminder-message.tool.ts
        create-reminder-batch.tool.ts
        create-reminder-review-link.tool.ts

      monthly-close/
        collect-monthly-data.tool.ts
        detect-monthly-anomalies.tool.ts
        create-monthly-close-draft.tool.ts
        finalize-monthly-close.tool.ts

      sheets/
        queue-sheet-sync.tool.ts
        sync-payments-to-sheet.tool.ts

      zalo/
        send-zalo-message.tool.ts
        download-zalo-attachment.tool.ts

    memory/
      conversation-memory.ts
      teacher-memory.ts

    evals/
      payment-text.eval.ts
      bill-ocr.eval.ts
      student-resolution.eval.ts
      reminder.eval.ts
      dangerous-action.eval.ts

  integrations/
    zalo/
      webhook-handler.ts
      send-message.ts
      download-attachment.ts

    google-sheets/
      client.ts
      sync.ts

    ai/
      openai-compatible.ts
      model-router.ts

  app/
    api/
      zalo/webhook/route.ts
      agent/resume/route.ts

    dashboard/
    review/
    agent-runs/
    settings/

  db/
    schema.ts
    migrations/
```

---

## 17. MVP scope

### 17.1 MVP bắt buộc

Làm thật mượt 4 workflow:

```txt
1. Ghi nhận thu tiền từ text Zalo
2. Ghi nhận thu tiền từ ảnh bill
3. Hỏi ai còn thiếu tiền
4. Tạo nhắc học phí + link dashboard duyệt
```

### 17.2 MVP dashboard

Cần có:

```txt
Dashboard tổng quan học phí
Danh sách lớp/học sinh
Danh sách invoice/payment
Trang review payment
Trang review reminders
Trang agent runs
Cài đặt Google Sheet
```

### 17.3 MVP chưa cần

Không cần làm ngay:

```txt
Điểm danh
Nhận diện khuôn mặt
Gửi tự động cho phụ huynh
Sync Google Sheet hai chiều
Mobile app native
Phân quyền trung tâm lớn
```

---

## 18. Phase 2

Sau MVP, thêm:

```txt
Monthly close workflow
Anomaly watch workflow
Google Sheet sync đẹp hơn
Reminder lịch định kỳ
Dashboard báo cáo nâng cao
Evals đầy đủ
Observability/tracing đẹp
Import từ Google Sheet cũ
```

---

## 19. Phase 3

Sau khi core ổn:

```txt
Zalo OA/ZBS/ZNS gửi nhắc phụ huynh nếu hợp lệ
Kết nối OA riêng cho giáo viên/trung tâm
Phân quyền nhiều giáo viên
Gói SaaS
Audit/compliance tốt hơn
Multi-channel adapter: web chat, Telegram, Messenger
```

---

## 20. Demo CV nên làm

### Demo 1: Text payment

1. Giáo viên nhắn Zalo: `Đã thu Minh 800k tháng 7`
2. Agent hiểu và hỏi xác nhận
3. Giáo viên nhắn `ok`
4. Dashboard cập nhật payment
5. Agent run trace hiển thị workflow/tool calls
6. Google Sheet có job sync

### Demo 2: Bill OCR

1. Giáo viên forward ảnh bill vào Zalo
2. Agent đọc số tiền/ngày/nội dung
3. Agent match học sinh
4. Agent phát hiện công nợ khớp
5. Agent hỏi xác nhận
6. Giáo viên duyệt
7. Payment được ghi với evidence

### Demo 3: Hỏi công nợ

1. Giáo viên hỏi: `Lớp Toán 8A còn ai chưa đóng?`
2. Agent trả danh sách thiếu tiền
3. Agent gợi ý soạn nhắc học phí

### Demo 4: Reminder review

1. Giáo viên nhắn: `Soạn nhắc học phí lớp Toán 8A`
2. Agent tạo batch reminder
3. Gửi link dashboard review
4. Giáo viên copy/chỉnh sửa/đánh dấu đã gửi

---

## 21. Mô tả CV

Có thể ghi:

```txt
Built a Zalo-first agentic tuition management system for home tutors using Mastra, Next.js, Supabase, OpenAI-compatible APIs, Google Sheets API, and human-in-the-loop workflows.

Implemented multi-agent workflows for payment recording, OCR-based bank transfer bill extraction, student matching, tuition debt Q&A, parent reminder drafting, monthly closing, anomaly detection, approval-based tool execution, audit logging, and dashboard review links.
```

Bullet points:

```txt
- Designed a Mastra-powered multi-agent architecture with specialized Billing, Bill Vision, Student Resolver, Reminder, Monthly Close, and Anomaly agents.
- Built human-in-the-loop workflows where financial actions are drafted by AI but executed only after teacher approval via Zalo or dashboard.
- Implemented OCR/vision-based bill parsing to extract transfer amount, timestamp, bank note, sender, and transaction metadata from forwarded payment screenshots.
- Developed tool-based agent execution with schema validation, permission checks, risk levels, idempotency keys, and audit logs.
- Created Supabase-backed agent memory, workflow state, payment records, approval requests, and Google Sheets synchronization jobs.
- Built dashboard review pages for payment evidence, reminder batches, monthly closing reports, and agent run traces.
```

---

## 22. Điều cần tránh

Không làm:

```txt
Chatbot trả lời tự do không workflow
AI tự ghi tiền không xác nhận
Google Sheet làm DB chính
Nhồi hết dữ liệu lớp vào prompt
Không có audit log
Không có eval
Không có review UI
Webhook Zalo chứa logic nghiệp vụ
Một agent làm tất cả
```

---

## 23. Kết luận thiết kế

Sản phẩm nên được xây theo mô hình:

```txt
Zalo-first
Mastra-powered
Multi-agent
Workflow-driven
Tool-based
Human-in-the-loop
Audit-safe
Supabase-backed
Google-Sheet-synced
Dashboard-assisted
```

Flagship product experience:

```txt
Giáo viên chuyển tiếp bill vào Zalo
→ Mastra Bill Workflow đọc ảnh
→ BillVisionAgent trích xuất dữ liệu
→ StudentResolverAgent map vào học sinh
→ BillingAgent so công nợ/invoice
→ AnomalyAgent kiểm tra trùng/sai
→ Workflow tạo approval
→ Giáo viên nhắn ok hoặc duyệt dashboard
→ Tool ghi payment thật
→ Sync Google Sheet
→ Agent báo lại kết quả
```

Đây không phải chatbot. Đây là một **AI operations agent** cho giáo viên dạy thêm, tập trung vào học phí, công nợ, bill, nhắc phụ huynh và tổng kết tháng.
