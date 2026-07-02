# Zalo-First Tutor Agent — Kế Hoạch Triển Khai

## Kết Quả Validate Kỹ Thuật

### Mastra Framework — ĐẠT (có lưu ý)
- **Suspend/Resume**: Hỗ trợ đầy đủ, snapshot persist vào PostgreSQL (Supabase). Workflow suspend tại step, chờ xác nhận, rồi resume từ đúng chỗ đó. Server restart vẫn giữ state.
- **Multi-agent**: Supervisor agents + delegation hooks hoạt động tốt.
- **Tool system**: `createTool()` với Zod schema, `requireApproval`, hooks. **Không có** risk levels/idempotency sẵn — phải tự build.
- **Memory**: Thread/resource-based, hỗ trợ PostgreSQL storage (`@mastra/pg`), hoạt động tốt với Supabase.
- **NestJS**: Official `@mastra/nestjs` package, `MastraModule.register()`, `MastraService` inject được.
- **Observability**: Built-in tracing + OpenTelemetry exporters.

### Lưu ý quan trọng từ Mastra research:
1. **Không có suspend timeout** — phải tự build cron job kiểm tra workflow treo.
2. **Agent KHÔNG gọi được workflow-as-tool khi workflow có suspend** (issue #11015) → Workflows phải trigger từ NestJS services, KHÔNG phải từ agent tools.
3. **ESM/CJS**: Cần Node.js 22+, `moduleResolution: "bundler"`.
4. **Supply chain incident (June 2026)**: Hơn 140 packages Mastra bị compromise → Pin version cẩn thận, audit dependencies.
5. **Tool validation không runtime-enforced** → Phải tự validate trong `execute`.

### Zalo Bot API — ĐẠT (có giới hạn free tier)
- **Telegram-style API**, token-based auth, webhook + long polling.
- **Nhận ảnh**: Có — webhook trả về `photo` URL, download được để OCR.
- **Rich text**: Markdown/HTML formatting, buttons, quick replies (qua SDK).
- **Free tier**: 50 users/bot, 3,000 msgs/month — đủ cho MVP/dev, cần upgrade khi scale.
- **SDK**: `node-zalo-bot` (npm) — thư viện chính thức được chọn.
- **Image handling**: Photo URL trực tiếp trong webhook payload, 5MB limit.

### NestJS + Mastra Integration — ĐẠT
- `@mastra/nestjs` chạy in-process, DI đầy đủ.
- Channel adapter pattern: abstract base + Zalo implementation.
- BullMQ + Redis cho background jobs (Google Sheets sync, scheduled tasks).
- Supabase as global service module với service role key.

---

## Quyết Định Kiến Trúc (Dựa Trên Feedback)

| Quyết định | Chi tiết |
|---|---|
| **Backend** | NestJS (không Next.js giai đoạn đầu) |
| **Agent framework** | Mastra via `@mastra/nestjs` |
| **Agents** | 2 agents: OrchestratorAgent + BillingAgent |
| **Models** | 1 text model + 1 vision model |
| **Channel** | Zalo Bot API via `node-zalo-bot` (channel-agnostic, thay được) |
| **Database** | Supabase (PostgreSQL + Storage). KHÔNG foreign key, liên kết qua Code (varchar 24), CamelCase, soft delete |
| **Background jobs** | BullMQ + Redis |
| **Google Sheets** | Sync sau khi job hoàn tất. Config trong code/env, không bảng DB |
| **UI** | Chưa làm — NestJS API only trước |

---

## Kiến Trúc Agents Tinh Gọn

### Agent 1: OrchestratorAgent
- Nhận mọi tin nhắn/ảnh từ channel adapter
- Phân loại intent (dùng AI, không hardcode keyword)
- Điều phối: tự xử lý hoặc delegate sang BillingAgent
- Xử lý trực tiếp các tác vụ CRUD: thêm/sửa/xóa học sinh, lớp, lịch học, chuyển lớp, v.v.
- Quản lý conversation memory
- Hỏi lại khi mơ hồ, xác nhận trước khi ghi dữ liệu quan trọng

**Tools của OrchestratorAgent:**
- `searchStudentTool` — tìm học sinh theo tên/nickname
- `createStudentTool` — thêm học sinh mới
- `updateStudentTool` — sửa thông tin học sinh
- `createClassTool` — tạo lớp mới
- `updateClassTool` — sửa lớp (đổi lịch, đổi tên)
- `moveStudentTool` — chuyển học sinh giữa các lớp
- `getTeacherProfileTool` — lấy thông tin giáo viên
- `sendChannelMessageTool` — gửi tin nhắn qua channel (Zalo/web/...)

### Agent 2: BillingAgent
- Xử lý TẤT CẢ liên quan tiền: ghi thu, đọc bill, tính công nợ, nhắc học phí, tổng kết
- Được OrchestratorAgent delegate khi intent liên quan tiền
- Hoặc tự xử lý khi được gọi trực tiếp

**Tools của BillingAgent:**
- `getStudentBalanceTool` — xem công nợ học sinh
- `getClassDebtListTool` — danh sách thiếu tiền theo lớp
- `createPaymentDraftTool` — tạo nháp khoản thu
- `confirmPaymentTool` — xác nhận ghi payment (sau approval)
- `rejectPaymentDraftTool` — từ chối nháp
- `detectDuplicatePaymentTool` — phát hiện trùng
- `allocatePaymentTool` — phân bổ tiền vào invoice
- `extractBillFromImageTool` — OCR đọc bill (dùng vision model)
- `generateReminderMessagesTool` — soạn tin nhắn nhắc học phí
- `collectMonthlyDataTool` — tổng hợp dữ liệu tháng
- `createMonthlyReportTool` — tạo báo cáo tháng
- `queueGoogleSheetSyncTool` — đẩy job sync Sheet sau khi hoàn tất

### Các thứ KHÔNG cần agent riêng (chỉ cần tools):
- BillVisionAgent cũ → gộp thành `extractBillFromImageTool` trong BillingAgent
- StudentResolverAgent cũ → gộp thành `searchStudentTool` + `moveStudentTool` trong OrchestratorAgent
- MonthlyCloseAgent cũ → gộp thành `collectMonthlyDataTool` + `createMonthlyReportTool` trong BillingAgent
- AnomalyAgent cũ → gộp thành `detectDuplicatePaymentTool` trong BillingAgent

---

## Kiến Trúc Channel Adapter

```
Tin nhắn Zalo → Zalo Webhook/Long Polling
  → ZaloController (NestJS)
  → ZaloAdapter.normalizeEvent() → ChannelEvent (format chung)
  → AgentRouterService.route(channelEvent)
  → OrchestratorAgent.generate()
  → Response → ChannelResponse → ZaloAdapter.sendResponse()
  → sendMessage API → Zalo
```

Channel adapter là lớp mỏng, chỉ:
1. Nhận raw event từ platform
2. Chuẩn hóa thành `ChannelEvent` interface chung
3. Gửi response qua platform API

Mọi logic nghiệp vụ nằm trong agents/tools, KHÔNG nằm trong adapter.

---

## Workflow Design

### Workflow 1: Ghi Nhận Học Phí Từ Text
Tên: `recordPaymentFromTextWorkflow`

```
Step 1: parsePaymentText (extract tên, số tiền, tháng từ text)
Step 2: resolveStudent (tìm học sinh matching)
Step 3: resolveInvoice (tìm/tạo invoice tương ứng)
Step 4: calculateStatus (tính công nợ trước/sau)
Step 5: detectDuplicate (kiểm tra trùng)
Step 6: createPaymentDraft (tạo nháp)
Step 7: suspendForApproval — SUSPEND chờ giáo viên xác nhận
Step 8: processApproval — RESUME với kết quả xác nhận
  → Nếu approved: confirmPayment + queueSheetSync
  → Nếu rejected: rejectDraft + báo lại
Step 9: reportResult (gửi kết quả về channel)
Step 10: writeAuditLog
```

**Quan trọng**: Workflow trigger từ NestJS service (KHÔNG từ agent tool) do Mastra issue #11015.

### Workflow 2: Ghi Nhận Học Phí Từ Ảnh Bill
Tên: `recordPaymentFromBillWorkflow`

```
Step 1: downloadBillImage (tải ảnh từ Zalo)
Step 2: storeImageToSupabaseStorage
Step 3: extractBillWithVision (OCR bằng vision model)
Step 4: normalizeBillData (chuẩn hóa amount/time/bank)
Step 5: resolveStudentCandidates (tìm học sinh matching)
Step 6: matchInvoice
Step 7: detectDuplicate
Step 8: calculateStatus
Step 9: createPaymentDraft (kèm evidence)
Step 10: suspendForApproval — SUSPEND
Step 11: processApproval — RESUME
Step 12: attachEvidence + confirmPayment + queueSheetSync
Step 13: reportResult
Step 14: writeAuditLog
```

### Workflow 3: Hỏi Đáp Học Phí
Tên: `feeQuestionAnswerWorkflow` — Đơn giản, không cần suspend

```
Step 1: classifyQuery (phân loại câu hỏi)
Step 2: resolveTarget (lớp/học sinh/tháng)
Step 3: queryBillingData
Step 4: calculateSummary
Step 5: generateAnswer
Step 6: suggestNextAction (gợi ý nhắc, chốt tháng, v.v.)
```

### Workflow 4: Tạo Nhắc Học Phí
Tên: `generateReminderWorkflow`

```
Step 1: resolveClass
Step 2: getUnpaidStudents
Step 3: generatePersonalizedMessages (soạn tin riêng cho từng PH)
Step 4: createReminderBatch
Step 5: sendReviewInfo (gửi danh sách + tin nhắn về Zalo cho GV review)
```

### Google Sheets Sync Strategy
- Config Google Sheet (Sheet ID, OAuth credentials) lưu trong **environment variables** hoặc **hardcode trong code**, không cần bảng DB riêng
- Sync KHÔNG real-time
- Sau khi workflow hoàn tất (payment confirmed, monthly close done), tool `queueGoogleSheetSyncTool` tạo BullMQ job
- BullMQ processor xử lý batch sync: đọc data từ Supabase → ghi vào Google Sheet
- Nếu lỗi, retry với exponential backoff
- Tracking sync qua field `SheetSynced` trong ChannelEvent (0 = chưa sync, 1 = đã sync)

---

## Data Model (Supabase) — 7 Bảng Tinh Gọn

### Quy ước bắt buộc (KHÔNG ngoại lệ)

| Quy ước | Chi tiết |
|---|---|
| **Naming** | CamelCase cho mọi field |
| **Không khóa phụ** | Tuyệt đối không dùng foreign key constraint |
| **Liên kết** | Qua `Code` (varchar 24) hoặc `Id` (int) tùy ngữ cảnh. Ví dụ: User có `ClassCode` → học sinh thuộc lớp có Code đó. User có `ParentId` → liên kết đến phụ huynh |
| **Trường mặc định** | Mọi bảng đều có: `Id` (int, auto-increment từ 1), `Name` (nvarchar 128), `Code` (varchar 24), `Description` (nvarchar 512), `CreatedAt` (datetime), `ModifiedAt` (datetime), `IsActive` (int, 0=deleted/1=active — soft delete) |
| **Trường bổ sung** | Tùy bảng, đặt sau các trường mặc định |

### Ví dụ query liên kết (không FK):
```sql
SELECT u.Name AS StudentName, c.Name AS ClassName
FROM [User] u
LEFT JOIN Class c ON u.ClassCode = c.Code
WHERE u.IsActive = 1 AND u.Role = 'student' AND c.IsActive = 1
  AND c.Name LIKE N'%Toán%'
```

---

### Bảng 1: User — Giáo viên / Học sinh / Phụ huynh (gộp chung)

Một bảng duy nhất cho tất cả users. Phân biệt bằng `Role`.

| Field | Type | Note |
|---|---|---|
| Id, Name, Code, Description, CreatedAt, ModifiedAt, IsActive | *(mặc định)* | |
| Role | varchar 16 | `teacher` / `student` / `parent` |
| Phone | varchar 20 | SĐT |
| ZaloUserId | varchar 64 | Zalo user ID (cho giáo viên nhận tin nhắn, cho PH nếu có) |
| ParentId | int | Liên kết đến User phụ huynh (chỉ cho student, null nếu không có) |
| ClassCode | varchar 24 | Liên kết lớp (chỉ cho student, null nếu chưa vào lớp) |
| Nickname | nvarchar 64 | Tên gọi khác (cho student) |
| Title | nvarchar 32 | Xưng hô: cô/thầy (cho teacher) |
| Tone | nvarchar 32 | Phong cách giao tiếp (cho teacher) |
| Timezone | varchar 32 | Múi giờ, default Asia/Ho_Chi_Minh |

**Quy tắc:**
- Giáo viên: 1 record duy nhất, Role = teacher
- Học sinh: Role = student, có `ClassCode` nối vào lớp, có `ParentId` nối đến phụ huynh (nếu có)
- Phụ huynh: Role = parent, không cần nối gì thêm
- Một học sinh chỉ có 1 phụ huynh quản lý

---

### Bảng 2: Class — Lớp học (chứa luôn học phí)

Học phí nằm trong Class, không tách bảng riêng. Khi tạo lớp → set mức học phí chung. Học sinh nào đặc biệt thì override ở Payment.

| Field | Type | Note |
|---|---|---|
| Id, Name, Code, Description, CreatedAt, ModifiedAt, IsActive | *(mặc định)* | |
| TeacherCode | varchar 24 | Liên kết giáo viên |
| Subject | nvarchar 64 | Môn học: Toán, Văn, Anh... |
| FeeAmount | int | Học phí mặc định (VND) |
| FeeType | varchar 16 | `monthly` (theo tháng) / `per_session` (theo buổi) |
| Schedule | nvarchar 256 | Lịch học: "Chiều T2, T4, T6" |
| Status | varchar 16 | `active` / `paused` / `stopped` |

**Quy tắc:**
- FeeAmount + FeeType là học phí mặc định cho mọi học sinh trong lớp
- Cả lớp học thêm (monthly) và gia sư (per_session) đều thu vào cuối tháng
- Override cá nhân: ghi trực tiếp vào Invoice/Payment với số tiền khác

---

### Bảng 3: Invoice — Hóa đơn học phí theo tháng

Mỗi học sinh mỗi tháng có 1 invoice. Tạo tự động khi đến kỳ hoặc agent tạo khi cần.

| Field | Type | Note |
|---|---|---|
| Id, Name, Code, Description, CreatedAt, ModifiedAt, IsActive | *(mặc định)* | |
| StudentCode | varchar 24 | Liên kết học sinh |
| ClassCode | varchar 24 | Liên kết lớp |
| BillingMonth | varchar 7 | Format: `2026-07` |
| Status | varchar 16 | `unpaid` / `partial` / `paid` / `overdue` / `waived` |
| TotalAmount | int | Tổng phải đóng |
| PaidAmount | int | Đã đóng |
| RemainingAmount | int | Còn thiếu |
| DueDate | datetime | Hạn đóng |
| Note | nvarchar 512 | Ghi chú (VD: "Nghỉ 2 buổi, giảm 200k") |

**Quy tắc:**
- Name tự động: `"Hóa đơn [Tên HS] tháng [MM/YYYY]"`
- Status tính tự động dựa trên TotalAmount vs PaidAmount
- Agent tạo invoice khi giáo viên nhắn "tạo hóa đơn tháng 7" hoặc khi chốt tháng

---

### Bảng 4: Payment — Khoản thu (chứa luôn bằng chứng)

Gộp payment + evidence vào 1 bảng. Tiền mặt thì ghi text, chuyển khoản thì kèm ảnh bill.

| Field | Type | Note |
|---|---|---|
| Id, Name, Code, Description, CreatedAt, ModifiedAt, IsActive | *(mặc định)* | |
| StudentCode | varchar 24 | Liên kết học sinh |
| InvoiceCode | varchar 24 | Liên kết hóa đơn |
| TeacherCode | varchar 24 | Liên kết giáo viên |
| Amount | int | Số tiền |
| Method | varchar 16 | `cash` / `bank_transfer` / `other` |
| PaidAt | datetime | Thời điểm đóng |
| Status | varchar 16 | `draft` / `confirmed` / `cancelled` |
| CreatedFrom | varchar 16 | `manual` / `zalo_text` / `zalo_image` / `agent` |
| FileUrl | varchar 512 | URL ảnh bill (nếu có, trong Supabase Storage) |
| FileType | varchar 16 | `image` / `pdf` (nếu có) |
| ExtractedAmount | int | Số tiền AI đọc từ ảnh |
| ExtractedNote | nvarchar 256 | Nội dung CK AI đọc |
| ExtractedBank | nvarchar 64 | Ngân hàng AI đọc |
| ExtractedTime | datetime | Thời gian giao dịch AI đọc |
| RawAiResult | text | JSON kết quả AI gốc (cho debug) |
| ConfidenceScore | decimal 5,2 | Độ tin cậy AI (0-1) |

**Quy tắc:**
- Tiền mặt: FileUrl = null, chỉ có Amount + Method = cash
- Chuyển khoản có ảnh: FileUrl có URL ảnh, AI đọc Extracted* fields
- draft → chờ giáo viên xác nhận → confirmed hoặc cancelled
- Name tự động: `"Thu [Tên HS] [số tiền] [tháng]"` hoặc `"Bill [Tên HS] [ngày]"`

---

### Bảng 5: ChannelEvent — Sự kiện từ channel (chứa luôn approval)

Gộp raw event + approval tracking vào 1 bảng. Mỗi tin nhắn/ảnh nhận được là 1 event. Nếu cần xác nhận → approval fields được populate.

| Field | Type | Note |
|---|---|---|
| Id, Name, Code, Description, CreatedAt, ModifiedAt, IsActive | *(mặc định)* | |
| Platform | varchar 16 | `zalo` / `web` / `telegram` |
| SenderId | varchar 64 | User ID trên platform |
| SenderName | nvarchar 128 | Tên hiển thị |
| EventType | varchar 32 | `message.text` / `message.image` / `message.voice` |
| Content | nvarchar 2000 | Text content |
| MediaUrl | varchar 512 | URL ảnh/file (nếu có) |
| RawPayload | text | JSON raw payload từ platform |
| Intent | varchar 32 | Intent AI phân loại: `record_payment` / `fee_query` / `manage_student` / ... |
| WorkflowRunId | varchar 64 | Mastra workflow run ID (nếu có workflow chạy) |
| ApprovalStatus | varchar 16 | `none` / `pending` / `approved` / `rejected` / `expired` |
| ApprovalSummary | nvarchar 1000 | Tóm tắt cho giáo viên đọc (nếu cần approve) |
| ApprovalPayload | text | JSON dữ liệu chi tiết của action chờ duyệt |
| ApprovalAction | varchar 32 | Loại action: `record_payment` / `monthly_close` / ... |
| ApprovedAt | datetime | Thời điểm duyệt |
| ExpiresAt | datetime | Thời điểm hết hạn approval |
| ResultText | nvarchar 2000 | Kết quả trả lời giáo viên |
| SheetSynced | int | 0 = chưa sync Sheet, 1 = đã sync |

**Quy tắc:**
- Mọi tin nhắn vào → tạo 1 ChannelEvent record
- Nếu action cần xác nhận → populate Approval* fields
- Khi event xử lý xong → sync Google Sheet (SheetSynced = 1)
- ApprovalStatus = `none` cho các event không cần duyệt (hỏi đáp, xem thông tin)

---

### Bảng 6: MonthlyClosing — Chốt tháng

| Field | Type | Note |
|---|---|---|
| Id, Name, Code, Description, CreatedAt, ModifiedAt, IsActive | *(mặc định)* | |
| ClassCode | varchar 24 | Liên kết lớp |
| TeacherCode | varchar 24 | Liên kết giáo viên |
| BillingMonth | varchar 7 | Format: `2026-07` |
| TotalStudents | int | Số học sinh |
| ExpectedRevenue | int | Tổng phải thu |
| CollectedRevenue | int | Đã thu |
| OutstandingDebt | int | Còn thiếu |
| Overpayment | int | Đóng dư |
| Status | varchar 16 | `draft` / `pending` / `approved` / `finalized` |
| ReportJson | text | JSON báo cáo chi tiết (danh sách paid/unpaid/...) |

**Quy tắc:**
- Name tự động: `"Chốt tháng [MM/YYYY] - [Tên lớp]"`
- draft → chờ duyệt → approved → finalized
- ReportJson chứa chi tiết từng học sinh cho dashboard hiển thị

---

### Bảng 7: AuditLog — Nhật ký hành động

| Field | Type | Note |
|---|---|---|
| Id, Name, Code, Description, CreatedAt, ModifiedAt, IsActive | *(mặc định)* | |
| TeacherCode | varchar 24 | Liên kết giáo viên |
| EntityType | varchar 32 | `payment` / `invoice` / `student` / `class` / ... |
| EntityCode | varchar 24 | Code của entity bị tác động |
| Action | varchar 32 | `create` / `update` / `delete` / `confirm` / `reject` |
| OldValue | text | JSON giá trị trước |
| NewValue | text | JSON giá trị sau |
| ActorType | varchar 16 | `teacher` / `agent` / `system` |
| ActorDetail | varchar 64 | Workflow name hoặc `"manual"` |

---

### Tóm tắt: 15 bảng → 7 bảng

| Trước (15 bảng) | Sau (7 bảng) | Thay đổi |
|---|---|---|
| Teacher + Student + Parent (3 bảng) | **User** (1 bảng) | Gộp chung, phân biệt bằng Role |
| Enrollment | *(xóa)* | ClassCode nằm trong User |
| FeePlan | *(xóa)* | FeeAmount + FeeType nằm trong Class |
| PaymentEvidence | *(xóa)* | Gộp vào Payment (FileUrl + Extracted* fields) |
| ReminderBatch + ReminderMessage (2 bảng) | *(xóa)* | Xử lý trong code, không cần bảng |
| ApprovalRequest | *(xóa)* | Gộp vào ChannelEvent (Approval* fields) |
| SheetSyncJob | *(xóa)* | Tracking bằng SheetSynced field trong ChannelEvent |
| GoogleSheetConnection | *(xóa)* | Config trong code/env, không cần bảng DB |
| Class, Invoice, ChannelEvent, MonthlyClosing, AuditLog | **Giữ nguyên** (có điều chỉnh) | |

---

## Project Structure (NestJS)

```
src/
  main.ts
  app.module.ts
  
  core/
    config/                     — @nestjs/config + Zod validation
    filters/                    — Global exception filters
    interceptors/               — Logging interceptor

  mastra/
    index.ts                    — Mastra instance: agents, workflows, storage
    mastra.module.ts            — MastraModule.register()
    agents/
      orchestrator.agent.ts     — OrchestratorAgent definition
      billing.agent.ts          — BillingAgent definition
    tools/
      users/                    — CRUD user (student/parent/teacher) + class tools
      billing/                  — Payment, invoice, balance tools
      vision/                   — Bill OCR tool
      reminders/                — Reminder generation tools (logic trong code, không bảng riêng)
      monthly/                  — Monthly close/report tools
      sheets/                   — Google Sheet sync tool
      channel/                  — Send message via channel
    workflows/
      record-payment-text.workflow.ts
      record-payment-bill.workflow.ts
      fee-qa.workflow.ts
      generate-reminder.workflow.ts

  channels/
    common/
      channel-event.ts          — Normalized event interface
      channel-response.ts       — Normalized response interface
      channel.adapter.ts        — Abstract base adapter
      channel-registry.service.ts
    zalo/
      zalo.adapter.ts           — Zalo event normalizer + sender (dùng node-zalo-bot)
      zalo.controller.ts        — Webhook endpoint
      zalo.service.ts           — Zalo API client (wrapper node-zalo-bot)
      zalo.types.ts

  domain/
    users/                      — User CRUD service (teacher/student/parent)
    classes/                    — Class management service (kèm học phí)
    invoices/                   — Invoice service
    payments/                   — Payment service (kèm evidence)

  integrations/
    supabase/
      supabase.module.ts        — @Global() Supabase service
      supabase.service.ts
    google-sheets/
      google-sheets.module.ts
      google-sheets.service.ts
    ai/
      ai.module.ts              — Model provider config (text + vision)

  jobs/
    jobs.module.ts              — BullMQ setup
    processors/
      sheets-sync.processor.ts  — Google Sheet sync queue
    schedulers/
      approval-timeout.scheduler.ts  — Cron: kiểm tra approval treo
```

---

## Task Breakdown (Thứ Tự Triển Khai)

### Task 1: Project Scaffolding
- Init NestJS project với TypeScript strict mode
- Cài đặt dependencies: `@mastra/core`, `@mastra/nestjs`, `@mastra/pg`, `@nestjs/config`, `@nestjs/bullmq`, `@supabase/supabase-js`, `node-zalo-bot`, `zod`
- Cấu hình `tsconfig.json`: `moduleResolution: "bundler"`, target ES2022, Node 22+
- Setup ESLint, Prettier
- Tạo basic module structure (core, mastra, channels, domain, integrations, jobs)
- **Done criteria**: `npm run build` thành công, `npm run start:dev` chạy được

### Task 2: Supabase Integration + Schema
- Tạo `SupabaseModule` + `SupabaseService` (global)
- Thiết kế và migrate Supabase schema theo quy ước: CamelCase, không FK, liên kết qua Code, mỗi bảng có Id/Name/Code/Description/CreatedAt/ModifiedAt/IsActive
- Seed data mẫu (1 giáo viên, 2 lớp, 5 học sinh, vài invoice) — nhớ populate Code fields đúng format
- **Done criteria**: Kết nối Supabase OK, schema tạo đúng, seed data query được

### Task 3: Mastra Integration + Agent Skeleton
- Cấu hình `MastraModule` trong `AppModule`
- Tạo Mastra instance với `PostgresStore` trỏ Supabase
- Define `OrchestratorAgent` (system prompt + tool list)
- Define `BillingAgent` (system prompt + tool list)
- Tạo 1 test tool đơn giản (ví dụ `pingTool`) để validate
- **Done criteria**: Gọi agent qua API được, agent trả lời, tool execute được

### Task 4: Domain Services (Users, Classes, Invoices, Payments)
- `UsersService`: CRUD cho cả teacher/student/parent, search, filter by role/class
- `ClassesService`: CRUD lớp + quản lý học phí mặc định (FeeAmount, FeeType)
- `InvoicesService`: tạo invoice, tính công nợ, update status
- `PaymentsService`: tạo draft (kèm evidence nếu có ảnh), confirm, reject, allocate vào invoice
- Tất cả dùng Supabase client qua `SupabaseService`
- **Done criteria**: Unit tests pass cho CRUD operations trên 7 bảng

### Task 5: Mastra Tools cho Domain
- Build tất cả tools trong `src/mastra/tools/`
- Mỗi tool: inputSchema (Zod), outputSchema, execute function
- Tools gọi domain services (inject qua NestJS DI)
- **Done criteria**: Agent gọi tool → tool execute → trả kết quả đúng

### Task 6: Channel Adapter Layer
- Define `ChannelEvent`, `ChannelResponse` interfaces
- Abstract `ChannelAdapter` base class
- `ChannelRegistry` service
- **Zalo Adapter**: `ZaloController` (webhook), `ZaloAdapter` (normalize/send), `ZaloService` (wrapper `node-zalo-bot`)
- Support cả webhook mode (prod) và long polling mode (dev, qua `node-zalo-bot`)
- **Done criteria**: Gửi tin nhắn Zalo → webhook nhận → normalize → response gửi lại Zalo

### Task 7: Agent Router + Workflow Integration
- `AgentRouterService`: nhận `ChannelEvent` → chọn agent/workflow
- Intent classification qua AI (không hardcode)
- OrchestratorAgent xử lý general tasks
- Routing sang BillingAgent khi intent liên quan tiền
- **Done criteria**: Nhắn "Đã thu Minh 800k" → agent hiểu intent → xử lý đúng flow

### Task 8: Approval + Suspend/Resume Workflows
- Build 4 workflows theo design ở trên
- Approval flow: workflow suspend → populate Approval* fields trong ChannelEvent → gửi tin hỏi xác nhận → giáo viên trả lời → resume
- Approval timeout: cron job kiểm tra ChannelEvent có ApprovalStatus = pending quá 24h → auto-expire
- Audit logging cho mọi action quan trọng
- **Done criteria**: Full flow text payment → suspend → ok → confirm → audit log

### Task 9: Google Sheets Sync
- `GoogleSheetsModule` + `GoogleSheetsService`
- BullMQ processor cho sync jobs
- Sync strategy: đọc Supabase → batch write vào Sheet
- `queueGoogleSheetSyncTool` trong BillingAgent
- **Done criteria**: Payment confirmed → sync job created → Sheet updated

### Task 10: Integration Testing + Polish
- End-to-end test 4 workflows qua Zalo
- Error handling, retry logic
- Logging + tracing setup
- Approval timeout handling
- Documentation
- **Done criteria**: 4 demo scenarios chạy mượt qua Zalo Bot

---

## Risk Mitigations

| Risk | Mitigation |
|---|---|
| ESM/CJS incompatibility | Test integration ngay từ Task 1. Node 22+, `moduleResolution: "bundler"`. Fallback: `swc` compiler. |
| Mastra supply chain incident | Pin exact versions. Run `npm audit`. Check package integrity hashes. |
| Agent calling suspended workflow (issue #11015) | Trigger workflows từ NestJS services, KHÔNG từ agent tools. |
| Suspend timeout không có sẵn | Build cron job `approval-timeout.scheduler.ts` kiểm tra + auto-expire. |
| Zalo Bot free tier limits (50 users, 3k msgs) | Monitor usage. Sufficient cho MVP. Upgrade Pro khi cần. |
| Tool validation không runtime-enforced | Thêm Zod validation trong mỗi tool's `execute` function. |
| Mastra catch-all route conflicts | Mount `MastraModule` với `prefix: '/api/mastra'` hoặc import LAST. |

---

## Rejected Alternatives

| Alternative | Lý do từ chối |
|---|---|
| 7 agents theo spec gốc | Quá phức tạp cho MVP. Nhiều thứ chỉ cần tool, không cần agent riêng. |
| 4 models (fast/vision/reasoning/writer) | Overkill. 1 text + 1 vision model đủ cho giai đoạn đầu. |
| Next.js full-stack | User yêu cầu tách NestJS (backend) + Next.js (UI sau). NestJS trước. |
| Zalo OA API | User chỉ định dùng Zalo Bot API với `node-zalo-bot` (đơn giản hơn, cho individual dev). |
| Google Sheet làm DB chính | Spec gốc đã reject đúng. Supabase là source of truth. |
| Real-time Google Sheet sync | User đồng ý sync sau khi job done. Đơn giản hơn, ít lỗi hơn. |
| Temporal cho durable workflows | Experimental trong Mastra. Chưa cần cho MVP. Suspend/resume + PostgresStore đủ. |
| LangGraph/LangChain.js | Mastra fit hơn cho TypeScript + NestJS. Ecosystem đầy đủ hơn. |
| 15 bảng DB theo spec gốc | Gộp teacher/student/parent → User. FeePlan → Class. PaymentEvidence → Payment. Reminder không cần bảng. ApprovalRequest → ChannelEvent. GoogleSheetConnection → code/env. Giảm từ 15 → 7 bảng. |
