# Code Review — Batch 4/10

## Issue #31 — 🐢 N+1 Query trong `list-classes` tool
**File:** `src/mastra/tools/users/list-classes.tool.ts` (Line 33-44)
**Severity:** Performance

```typescript
const classes = await Promise.all(
  result.data.map(async (c: any) => ({
    ...
    studentCount: await classesService.getStudentCount(c.Code), // 1 query/class
    ...
  })),
);
```

Với mỗi lớp, thực hiện 1 query riêng để đếm học sinh. 10 lớp = **10 DB queries** chỉ để đếm.

**Fix:** Fetch tất cả students 1 lần (`WHERE Role = 'student' AND IsActive = 1`), count theo ClassCode trong memory. Giống pattern đúng trong `getClassFinancials()` (reports.service.ts line 215-231).

---

## Issue #32 — 🐛 `collect-monthly-data` crash khi `ReportJson` null
**File:** `src/mastra/tools/monthly/collect-monthly-data.tool.ts` (Line 22)
**Severity:** Bug

```typescript
const report = JSON.parse(draft.ReportJson);  // ← crash nếu ReportJson = null
```

`MonthlyClosing.ReportJson` là `String?` (nullable). Nếu draft vừa tạo chưa có report → `ReportJson = null` → `JSON.parse(null)` → **throw TypeError**.

`create-monthly-report` tool (file bên cạnh) KHÔNG parse ReportJson → không bị crash. Inconsistency.

**Fix:** Check null trước khi parse: `if (!draft.ReportJson) return { ...basic info, paidList: [], unpaidList: [] };`

---

## Issue #33 — ⚠️ `create-monthly-report` và `collect-monthly-data` gần như giống hệt
**Files:** `src/mastra/tools/monthly/collect-monthly-data.tool.ts`, `src/mastra/tools/monthly/create-monthly-report.tool.ts`
**Severity:** Maintenance

Cả 2 tool:
- Cùng gọi `monthlyClosingService.createOrUpdateDraft(classCode, billingMonth)`
- Cùng inputSchema (`classCode`, `billingMonth`)
- Return overlapping data (classCode, billingMonth, totalStudents, expectedRevenue, collectedRevenue, outstandingDebt, closingCode)

Chỉ khác: `collect` parse ReportJson thành paidList/unpaidList; `create` tính collectionRate.

**Fix:** Merge thành 1 tool `getMonthlyOverview` với optional flag `includeBreakdown: boolean`.

---

## Issue #34 — ⚠️ `listStudents` output có `parentName` luôn = null
**File:** `src/mastra/tools/users/list-students.tool.ts` (Line 38)
**Severity:** Misleading

```typescript
parentName: null,  // ← hardcoded, không bao giờ resolve
```

OutputSchema khai báo `parentName: z.string().nullable()` → AI agent "thấy" field này và có thể dựa vào để quyết định. Nhưng giá trị luôn = `null`.

**Fix:** Hoặc resolve parent name thật (batch fetch), hoặc xóa field khỏi outputSchema.

---

## Issue #35 — 🐛 `listStudents` không có pagination, hardcode 50
**File:** `src/mastra/tools/users/list-students.tool.ts` (Line 28)
**Severity:** Bug

```typescript
const result = await usersService.findAll({ role: 'student', page: 1, limit: 50 });
```

Khi không có classCode, tool fetch max 50 học sinh. Nếu trung tâm có 100+ học sinh → **trả về thiếu dữ liệu** mà không báo cho agent biết.

Agent "nghĩ" mình đã lấy tất cả → đưa ra câu trả lời sai.

**Fix:** Thêm pagination param hoặc trả về `total` + `hasMore` để agent biết còn dữ liệu.

---

## Issue #36 — 🐛 `getDebtors` không có pagination
**File:** `src/domain/reports/reports.service.ts` (Line 406-482)
**Severity:** Performance

```typescript
const { data: invoices, error } = await client
  .from('Invoice')
  .select('*')
  .eq('IsActive', 1)
  .in('Status', ['unpaid', 'partial'])
  .order('RemainingAmount', { ascending: false });
// ← không có limit, fetch ALL unpaid invoices
```

Query lấy **TẤT CẢ** hóa đơn chưa thanh toán. Với hệ thống chạy 2-3 năm, có thể có hàng ngàn invoices → response rất nặng, tốn bộ nhớ.

**Fix:** Thêm pagination (page/limit) hoặc ít nhất `limit: 500`.

---

## Issue #37 — ⚠️ `UpdateInvoiceStatusDto` không validate enum
**File:** `src/domain/invoices/dto/create-invoice.dto.ts` (Line 36-41)
**Severity:** Validation gap

```typescript
export class UpdateInvoiceStatusDto {
  @IsNotEmpty()
  @IsString()
  status: string;  // ← chấp nhận MỌI string
}
```

ApiProperty có `enum: ['unpaid', 'partial', 'paid', 'overdue', 'cancelled']` nhưng **không có `@IsIn()` decorator**. Client gửi `status: "banana"` → validation pass → invalid data vào DB.

**Fix:** Thêm `@IsIn(['unpaid', 'partial', 'paid', 'overdue', 'cancelled'])`.

---

## Issue #38 — ⚠️ `getRevenueTrends` không giới hạn `limit` param
**File:** `src/domain/reports/reports.controller.ts` (Line 30-33)
**Severity:** Validation gap

```typescript
async getRevenueTrends(@Query('limit') limit?: string) {
  const parsedLimit = limit ? parseInt(limit, 10) : 6;
  const data = await this.reportsService.getRevenueTrends(parsedLimit);
```

Không validate max. Client gửi `?limit=10000` → generate 10000 tháng → query khổng lồ → timeout hoặc OOM.

**Fix:** Clamp: `const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 6, 1), 24);`

---

## Issue #39 — ⚠️ `JobsModule` gọi `config()` từ dotenv ở module scope
**File:** `src/jobs/jobs.module.ts` (Line 14)
**Severity:** Architecture

```typescript
import { config } from 'dotenv';
config();  // ← Load .env TRƯỚC khi NestJS ConfigModule init
```

Lý do: cần `REDIS_ENABLED` sớm để quyết định có register BullMQ không. Nhưng tạo **2 lớp config**:
- `dotenv` load `.env` vào `process.env`
- NestJS `ConfigModule.forRoot()` cũng load `.env`

Nếu 2 module đọc từ 2 nguồn khác nhau (1 từ `process.env`, 1 từ `ConfigService`) → risk inconsistency khi env file thay đổi hoặc có env override.

**Fix:** Dùng `ConfigModule.forRoot()` với `isGlobal: true` và ensure module load order, hoặc đọc `process.env.REDIS_ENABLED` trực tiếp (vì NestJS ConfigModule cũng set process.env).

---

## Issue #40 — 🐢 N+1 Query trong `getDashboardSummary` cho historical months
**File:** `src/domain/reports/reports.service.ts` (Line 96-121, lặp lại ở 151-176)
**Severity:** Performance

```typescript
for (const cls of activeClasses) {
  const close = finalizedMap.get(cls.Code);
  if (close) { ... }
  else {
    // ← N+1: query invoices per class
    const { data: invoices } = await client
      .from('Invoice')
      .select(...)
      .eq('ClassCode', cls.Code)
      .eq('BillingMonth', activeMonth);
  }
}
```

Với tháng historical, nếu class chưa finalized closing → query invoices riêng cho class đó. Pattern lặp cho **cả current month VÀ previous month** → 2 vòng N+1.

10 classes, 5 classes chưa finalize = **10 extra queries** (5 current + 5 previous).

**Fix:** Batch fetch tất cả invoices cho tháng trong 1 query (giống pattern đúng ở `getClassFinancials()` line 250-268).

---

## Tóm tắt

| # | Issue | Mức độ |
|---|---|---|
| 31 | N+1 Query list-classes | 🐢 Performance |
| 32 | collect-monthly-data crash null ReportJson | 🐛 Bug |
| 33 | 2 monthly tools trùng lặp logic | ⚠️ Maintenance |
| 34 | parentName luôn = null (misleading) | ⚠️ Misleading |
| 35 | listStudents không pagination | 🐛 Bug |
| 36 | getDebtors không pagination | 🐢 Performance |
| 37 | UpdateInvoiceStatusDto thiếu @IsIn | ⚠️ Validation |
| 38 | getRevenueTrends không giới hạn limit | ⚠️ Validation |
| 39 | dotenv config() ở module scope | ⚠️ Architecture |
| 40 | N+1 Query getDashboardSummary | 🐢 Performance |
