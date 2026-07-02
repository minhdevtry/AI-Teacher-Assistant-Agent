# Code Review — Batch 1/10

## Issue #1 — 🚨 SQL Injection trong `UsersService.search()`
**File:** `src/domain/users/users.service.ts` (Line 90-106)
**Severity:** Critical

```typescript
.or(`Name.ilike.%${query}%,Nickname.ilike.%${query}%,Phone.ilike.%${query}%`)
```

`query` được interpolate trực tiếp vào filter string. Nếu user gửi ký tự đặc biệt (`%`, `"`, `)`, `.`), query sẽ bị break hoặc tạo hành vi không mong muốn.

**Fix:** Escape ký tự đặc biệt trước khi interpolate, hoặc dùng parameterized query.

---

## Issue #2 — 🚨 Race condition trong CodeGenerator (TOÀN HỆ THỐNG)
**File:** `src/domain/common/code-generator.ts`
**Severity:** High

Pattern "SELECT max Code → generate next → INSERT" **không atomic**. 2 request đồng thời có thể đọc cùng maxCode → sinh trùng Code → vi phạm UNIQUE constraint.

Ảnh hưởng: User, Invoice, Payment, ChannelEvent, AuditLog, MonthlyClosing — tất cả đều dùng pattern này.

**Fix:** Dùng DB sequence, hoặc `INSERT ... ON CONFLICT`, hoặc advisory lock.

---

## Issue #3 — 🐛 Approval workflow KHÔNG resume qua ZaloController
**Files:** `src/channels/zalo/zalo.controller.ts` (Line 98-127), `src/mastra/approval.service.ts` (Line 157)
**Severity:** Bug

ZaloController gọi `processApproval()` → cập nhật status nhưng **KHÔNG resume workflow**. Trong `approval.service.ts` line 157 có comment: `// TODO (Task 8): Resume suspended Mastra workflow`.

Trong khi đó, `AgentRouterService.handleApprovalResponse()` **CÓ** gọi `resumeWorkflow()`. Nếu approval đi qua webhook path → workflow bị treo vĩnh viễn.

---

## Issue #4 — ⚠️ Duplicate logic `extractResponseText` (~80 dòng x 2 chỗ)
**Files:** `src/mastra/agent-router.service.ts` (Line 357-441), `src/mastra/mastra.controller.ts` (Line 118-189)
**Severity:** Maintenance

Cùng 1 logic extract text từ Mastra result nhưng copy-paste ở 2 file. Khi Mastra thay đổi response format → phải sửa 2 chỗ.

**Fix:** Extract thành shared utility function.

---

## Issue #5 — ⚠️ `withTimeout` không cancel underlying promise
**File:** `src/mastra/agent-router.service.ts` (Line 444-460)
**Severity:** Resource leak

Khi timeout, Promise reject nhưng `agent.generate()` vẫn chạy ngầm → LLM API call tiếp tục → tốn tài nguyên, tốn token.

**Fix:** Dùng `AbortController` để cancel thực sự.

---

## Issue #6 — 🗑️ `invokeBillingAgent()` là dead code
**File:** `src/mastra/agent-router.service.ts` (Line 216-231)
**Severity:** Cleanup

Method này **không bao giờ được gọi**. BillingAgent giờ là subagent của OrchestratorAgent.

**Fix:** Xóa method.

---

## Issue #7 — 🐛 `updateInvoiceBalance()` silently ignores errors
**File:** `src/domain/payments/payments.service.ts` (Line 307-347)
**Severity:** Bug

```typescript
if (invoiceError || !invoice) return;  // ← silent return
if (payError) return;                   // ← silent return
```

Nếu query invoice hoặc payments fail, method trả về mà không log, không throw. Invoice balance có thể bị sai mà không ai biết.

**Fix:** Throw error hoặc ít nhất log error. Đây là financial data.

---

## Issue #8 — 🐢 N+1 Query trong `generateForClass()`
**File:** `src/domain/invoices/invoices.service.ts` (Line 230-272)
**Severity:** Performance

Với mỗi học sinh, thực hiện **2 query riêng** (check existing + get max code). Lớp 20 học sinh = **40+ DB queries**.

**Fix:** Batch: fetch tất cả existing invoices 1 lần, generate codes trong memory.

---

## Issue #9 — ⚠️ `AuditService.log()` không có error handling
**File:** `src/domain/common/audit.service.ts` (Line 20-39)
**Severity:** Reliability

Nếu audit log insert fail → error propagate lên caller. Toàn bộ operation có thể fail vì audit log.

**Fix:** Wrap trong try-catch, log warning. Audit failure không nên block business operation.

---

## Issue #10 — ⚠️ `CodeGenerator` chỉ pad 3 chữ số
**File:** `src/domain/common/code-generator.ts` (Line 8)
**Severity:** Future-proof

```typescript
return `${prefix}${String(next).padStart(3, '0')}`;  // → 001, ..., 999, 1000
```

Khi vượt 999 entries, code thành `INV1000` (4 digits). String sort sẽ sai: `INV999` > `INV1000`.

**Fix:** Pad 6 digits cho an toàn: `padStart(6, '0')`.

---

## Tóm tắt

| # | Issue | Mức độ |
|---|---|---|
| 1 | SQL Injection | 🚨 Critical |
| 2 | Race condition CodeGenerator | 🚨 High |
| 3 | Approval không resume workflow | 🐛 Bug |
| 4 | Duplicate extractResponseText | ⚠️ Maintenance |
| 5 | withTimeout không cancel | ⚠️ Resource leak |
| 6 | Dead code invokeBillingAgent | 🗑️ Cleanup |
| 7 | updateInvoiceBalance silent fail | 🐛 Bug |
| 8 | N+1 Query generateForClass | 🐢 Performance |
| 9 | AuditService no error handling | ⚠️ Reliability |
| 10 | CodeGenerator pad 3 digits | ⚠️ Future-proof |
