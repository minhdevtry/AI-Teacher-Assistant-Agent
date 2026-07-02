# Code Review — Batch 2/10

## Issue #11 — 🐛 Operator precedence bug trong `generateAnswer`
**File:** `src/mastra/workflows/fee-qa.workflow.ts` (Line 257)
**Severity:** Bug

```typescript
`• Tổng: ${fmt(inputData.totalPaid ?? 0 + (inputData.totalOwed ?? 0))}\n`
```

`+` binds tighter than `??`, nên expression = `inputData.totalPaid ?? (0 + (inputData.totalOwed ?? 0))` = `inputData.totalPaid ?? (inputData.totalOwed ?? 0)`.

Kết quả: Khi `totalPaid` có giá trị (ví dụ 500000), "Tổng" hiển thị **500000** thay vì **500000 + 200000 = 700000**.

**Fix:** Thêm ngoặc: `(inputData.totalPaid ?? 0) + (inputData.totalOwed ?? 0)`.

---

## Issue #12 — 🐛 `storeImageToSupabaseStorage` KHÔNG upload ảnh
**File:** `src/mastra/workflows/record-payment-bill.workflow.ts` (Line 93-115)
**Severity:** Bug

```typescript
const { data } = await client.storage.from('bills').getPublicUrl(fileName);
```

`getPublicUrl()` chỉ tạo URL string cho một path — **KHÔNG upload file**. File không tồn tại trong storage. URL trả về trỏ đến nothing.

**Fix:** Dùng `.upload(fileName, imageBuffer)` trước, rồi mới `getPublicUrl()`.

---

## Issue #13 — ⚠️ `extractBillWithVision` là placeholder hoàn toàn
**File:** `src/mastra/workflows/record-payment-bill.workflow.ts` (Line 120-137)
**Severity:** Feature gap

Toàn bộ step OCR trả về giá trị rỗng (`extractedAmount: undefined`, `confidenceScore: 0`). Workflow 14 bước cho bill image **hoàn toàn không hoạt động** — sẽ luôn fail ở `normalizeBillData` vì `amount` = undefined.

**Fix:** Wire vào vision model (`AI_VISION_MODEL`) đã được config trong `MastraService`.

---

## Issue #14 — ⚠️ ~120 dòng trùng lặp giữa text và bill workflows
**Files:** `record-payment-text.workflow.ts` (steps 4-8) vs `record-payment-bill.workflow.ts` (steps 7-11)
**Severity:** Maintenance

5 step gần giống hệt nhau: `detectDuplicate`, `calculateStatus`, `createPaymentDraft`, `suspendForApproval`, `processApproval`. Chỉ khác minor (bill thêm `FileUrl`, `ExtractedBank`).

**Fix:** Extract shared step factories vào common module.

---

## Issue #15 — 🐢 N+1 Query trong `queryBillingData`
**File:** `src/mastra/workflows/fee-qa.workflow.ts` (Line 184-187)
**Severity:** Performance

```typescript
for (const inv of invoices) {
  const pays = await paymentsService.getByInvoice(inv.Code);
  allPayments.push(...pays);
}
```

Mỗi invoice = 1 DB query. Học sinh có 12 tháng history = 12 queries.

**Fix:** Batch fetch: query tất cả payments WHERE `InvoiceCode IN (...)` trong 1 query.

---

## Issue #16 — 🐢 N+1 Query trong `getUnpaidStudents`
**File:** `src/mastra/workflows/generate-reminder.workflow.ts` (Line 111-138)
**Severity:** Performance

Với mỗi unpaid invoice, gọi `usersService.findByCode()` + có thể gọi thêm cho parent. Lớp 20 học sinh chưa đóng = **40 DB queries**.

**Fix:** Batch fetch students và parents trong 2 queries, join trong memory.

---

## Issue #17 — ⚠️ `resolveStudentCandidates` bỏ cuộc khi parent gửi ảnh
**File:** `src/mastra/workflows/record-payment-bill.workflow.ts` (Line 182-184)
**Severity:** Feature gap

```typescript
if (user && user.Role === 'parent') {
  return { ...inputData, error: 'Phụ huynh gửi ảnh — vui lòng cho biết tên học sinh.' };
}
```

Thay vì tìm con của parent qua `ParentId` linkage, workflow trả về error. DB đã có quan hệ `ParentId` — nên query `User WHERE ParentId = user.Code AND Role = 'student'`.

**Fix:** Query students linked to the parent via `ParentId`.

---

## Issue #18 — 🎨 Log "20 tools" nhưng thực tế là 23
**File:** `src/mastra/mastra.service.ts` (Line 171)
**Severity:** Cosmetic

```typescript
this.logger.log('...with %d tools and 4 workflows', 20);
```

orchestratorTools (11) + billingTools (12) = 23. Số `20` là hardcoded và sai.

**Fix:** Dùng `Object.keys(orchestratorTools).length + Object.keys(billingTools).length`.

---

## Issue #19 — ⚠️ `classifyQuery` regex bỏ sót nhiều pattern phổ biến
**File:** `src/mastra/workflows/fee-qa.workflow.ts` (Line 60-71)
**Severity:** UX

Regex-based classifier fail với các câu hỏi phổ biến:
- "học phí tháng 7" → no match → `general`
- "em A đóng chưa" → no match → `general`
- "tiền học" → no match → `general`

Query không match → `queryType = 'general'` → trả lời vô ích.

**Fix:** Dùng LLM cho classification (như OrchestratorAgent), hoặc mở rộng regex đáng kể.

---

## Issue #20 — 🐛 Non-null assertion `sheetsSyncQueueService!` có thể crash
**File:** `src/mastra/mastra.service.ts` (Line 131)
**Severity:** Bug

```typescript
queueGoogleSheetSync: createQueueGoogleSheetSyncTool(this.sheetsSyncQueueService!),
```

`sheetsSyncQueueService` được mark `@Optional()`. Nếu Redis không configured → `undefined`. `!` chỉ suppress TypeScript warning, tool sẽ **crash at runtime** khi được gọi.

**Fix:** Check at init: skip registering tool hoặc provide no-op implementation.

---

## Tóm tắt

| # | Issue | Mức độ |
|---|---|---|
| 11 | Operator precedence bug (`??` vs `+`) | 🐛 Bug |
| 12 | storeImage không upload thật | 🐛 Bug |
| 13 | OCR placeholder — bill workflow không hoạt động | ⚠️ Feature gap |
| 14 | ~120 dòng trùng lặp text/bill workflows | ⚠️ Maintenance |
| 15 | N+1 Query trong queryBillingData | 🐢 Performance |
| 16 | N+1 Query trong getUnpaidStudents | 🐢 Performance |
| 17 | Parent gửi ảnh không tìm được học sinh | ⚠️ Feature gap |
| 18 | Log "20 tools" nhưng thực tế 23 | 🎨 Cosmetic |
| 19 | Regex classify bỏ sót pattern phổ biến | ⚠️ UX |
| 20 | Non-null assertion optional service | 🐛 Bug |
