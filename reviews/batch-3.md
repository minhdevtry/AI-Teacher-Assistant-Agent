# Code Review — Batch 3/10

## Issue #21 — 🐛 ZaloPollingService approval cũng KHÔNG resume workflow
**File:** `src/channels/zalo/zalo-polling.service.ts` (Line 59-84)
**Severity:** Bug (same root cause as #3)

```typescript
if (approvalResult.isApproval && approvalResult.channelEventCode) {
  const approved = approvalResult.approvalStatus === 'approved';
  await this.approvalService.processApproval(
    approvalResult.channelEventCode, approved,
  );
  // ← gửi confirmation nhưng KHÔNG gọi resumeWorkflow()
  return;
}
```

Giống hệt bug #3 (batch 1): `processApproval()` cập nhật DB status nhưng **KHÔNG resume** Mastra workflow đang suspend. Workflow bị treo vĩnh viễn.

Path bị ảnh hưởng: mọi approval qua polling mode (development mode).

**Fix:** Sau `processApproval()`, gọi `workflowTriggerService.resumeWorkflow(workflowRunId, ...)`.

---

## Issue #22 — 🐛 `moveStudent` không validate class tồn tại
**File:** `src/mastra/tools/users/move-student.tool.ts` (Line 19-33)
**Severity:** Bug

```typescript
const student = await usersService.findByCode(input.studentCode);
await usersService.update(input.studentCode, { ClassCode: input.newClassCode });
// ← không check newClassCode có tồn tại không
```

Tool chuyển học sinh sang lớp mới mà **không kiểm tra** lớp mới có tồn tại. Nếu `newClassCode` sai → học sinh mang classCode không hợp lệ → các query hóa đơn/báo cáo sau này sẽ sai lệch.

**Fix:** Gọi `classesService.findByCode(newClassCode)` trước khi update. Throw nếu không tìm thấy.

---

## Issue #23 — 🚨 Missing ZALO_BOT_TOKEN crashes toàn ứng dụng
**File:** `src/channels/zalo/zalo.service.ts` (Line 22-25)
**Severity:** High (Startup)

```typescript
if (!token) {
  this.logger.error('ZALO_BOT_TOKEN is not set...');
  throw new Error('ZALO_BOT_TOKEN environment variable is required');
}
```

Constructor throw → NestJS dependency injection fail → **toàn bộ application không khởi động**. Không thể chạy local dev, chạy test, hoặc deploy ở môi trường chưa có Zalo token.

**Fix:** Log warning và set bot = null. Các method check null trước khi gọi. Hoặc dùng `@Optional()` pattern.

---

## Issue #24 — ⚠️ `sendChannelMessage` tool chỉ là console.log
**File:** `src/mastra/tools/channel/send-channel-message.tool.ts` (Line 19-31)
**Severity:** Feature gap

```typescript
console.log(`[sendChannelMessage] → ${input.recipientCode} via ${input.channel}: ${input.message}`);
return { success: true, ... };
```

Tool được đăng ký cho OrchestratorAgent nhưng **chỉ log ra console**, không gửi tin nhắn thật. `ChannelRegistryService` đã implement nhưng không được inject vào tool.

Agent "nghĩ" rằng tin nhắn đã gửi thành công (nhận `success: true`) → phụ huynh không bao giờ nhận được tin nhắn.

**Fix:** Inject `ChannelRegistryService`, lookup adapter by platform, gọi `adapter.sendResponse()`.

---

## Issue #25 — ⚠️ `extractBillFromImage` tool luôn trả về null
**File:** `src/mastra/tools/vision/extract-bill-from-image.tool.ts` (Line 19-31)
**Severity:** Feature gap

```typescript
return {
  extractedAmount: null,
  extractedBank: null,
  confidenceScore: 0,
  extractedNote: 'OCR chưa được tích hợp — placeholder tool',
};
```

Tool được đăng ký cho BillingAgent nhưng **luôn trả về null/0**. Khi BillingAgent gọi tool này để phân tích hóa đơn, nó nhận `confidenceScore: 0` → không có giá trị sử dụng.

Vision model đã được config trong `MastraService` (`AI_VISION_MODEL`) nhưng tool không có access.

**Fix:** Inject vision model reference vào tool factory, dùng để analyze image.

---

## Issue #26 — 🐢 N+1 Query trong `getClassDebtList` tool
**File:** `src/mastra/tools/billing/get-class-debt-list.tool.ts` (Line 45-73)
**Severity:** Performance

```typescript
const students = await Promise.all(
  debtInvoices.map(async (inv) => {
    const student = await usersService.findByCode(inv.StudentCode); // 1 query/student
    ...
  })
);
```

Với mỗi hóa đơn nợ, thực hiện 1 query riêng để lấy tên học sinh. Lớp 25 học sinh nợ = **25 DB queries** chỉ để lấy tên.

**Fix:** Collect tất cả StudentCodes → 1 query `WHERE Code IN (...)` → map result.

---

## Issue #27 — 🐢 N+1 Query trong `generateReminderMessages` tool
**File:** `src/mastra/tools/reminders/generate-reminder-messages.tool.ts` (Line 41-68)
**Severity:** Performance

```typescript
const messages = await Promise.all(
  unpaidInvoices.map(async (inv) => {
    const student = await usersService.findByCode(inv.StudentCode); // 1 query/student
    ...
  })
);
```

Tương tự #26. Lớp 20 học sinh chưa đóng = **20 DB queries** chỉ để lấy tên.

**Fix:** Batch fetch: `usersService.findByCodes(studentCodes)`.

---

## Issue #28 — 🐛 `GoogleSheetsService.clearAndWrite()` xóa toàn bộ sheet
**File:** `src/integrations/google-sheets/google-sheets.service.ts` (Line 59-80)
**Severity:** Data safety

```typescript
await client.spreadsheets.values.clear({ spreadsheetId, range: sheetName });
// ← XÓA TOÀN BỘ dữ liệu sheet trước khi ghi
```

Nếu 2 sync jobs chạy đồng thời (ví dụ: sync payments + sync invoices):
1. Job A: clear sheet "Payments" → sheet trống
2. Job B: clear sheet "Invoices" → sheet trống
3. Job A: ghi vào "Payments" — OK
4. Job B: ghi vào "Invoices" — OK

Nhưng nếu **cùng sync payments** từ 2 nơi:
1. Job A: clear "Payments" → trống
2. Job B: clear "Payments" → trống (lần nữa)
3. Job A: ghi data A
4. Job B: ghi data B → **ghi đè data A**

Hơn nữa, nếu sync fail sau khi clear → **mất toàn bộ dữ liệu sheet**.

**Fix:** Dùng batchUpdate để atomic clear+write, hoặc write to temp sheet rồi rename.

---

## Issue #29 — ⚠️ `ParentId` dùng integer ID, inconsistency với phần còn lại của hệ thống
**Files:** `prisma/schema.prisma` (Line 22), `src/domain/users/dto/create-user.dto.ts` (Line 40), `src/mastra/tools/users/create-student.tool.ts` (Line 14)
**Severity:** Design inconsistency

Toàn bộ hệ thống liên kết qua **Code strings** (STD001, CLS001, TCH001...) — đó là triết lý thiết kế chính. Nhưng `ParentId` lại dùng **integer ID** (auto-increment primary key).

```prisma
ParentId Int?  // ← Integer, không phải String Code
```

```typescript
parentId: z.number().optional()  // ← Tool nhận number, không phải string
```

Điều này tạo ra inconsistency: khi tạo học sinh, AI agent phải biết DB internal ID của parent thay vì dùng Code như mọi nơi khác.

**Fix:** Đổi `ParentId` thành `ParentCode String?` để thống nhất với pattern Code-based.

---

## Issue #30 — 🐛 `GoogleSheetsService` không có error recovery khi sync fail
**File:** `src/integrations/google-sheets/google-sheets.service.ts` (Line 82-129)
**Severity:** Reliability

```typescript
async syncPayments(billingMonth?: string): Promise<{ synced: number }> {
  // 1. Fetch data from DB
  // 2. Build rows
  // 3. clearAndWrite('Payments', rows)  ← có thể fail ở đây
  // Nếu fail → sheet đã bị clear nhưng data mới chưa ghi → MẤT DỮ LIỆU
}
```

Không có retry logic, không có transaction. Google Sheets API có rate limit (60 requests/minute/project). Nếu fail giữa chừng → dữ liệu cũ đã bị xóa.

**Fix:** Build all rows trong memory trước → chỉ clear+write khi data sẵn sàng. Hoặc dùng Sheets API batchUpdate (atomic).

---

## Tóm tắt

| # | Issue | Mức độ |
|---|---|---|
| 21 | Polling approval không resume workflow | 🐛 Bug |
| 22 | moveStudent không validate class | 🐛 Bug |
| 23 | Missing token crash toàn app | 🚨 High |
| 24 | sendChannelMessage chỉ console.log | ⚠️ Feature gap |
| 25 | extractBillFromImage luôn return null | ⚠️ Feature gap |
| 26 | N+1 Query getClassDebtList | 🐢 Performance |
| 27 | N+1 Query generateReminderMessages | 🐢 Performance |
| 28 | clearAndWrite xóa toàn bộ sheet | 🐛 Data safety |
| 29 | ParentId dùng int, inconsistency | ⚠️ Design |
| 30 | Sheets sync không có recovery | 🐛 Reliability |
