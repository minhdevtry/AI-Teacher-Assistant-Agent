# Code Review — Batch 5/10

## Issue #41 — ⚠️ `searchStudent` tool filter ở memory thay vì DB
**File:** `src/mastra/tools/users/search-student.tool.ts` (Line 25-31)
**Severity:** Performance

```typescript
const results = await usersService.search(input.query); // ← fetch TẤT CẢ users match
const students = results.filter(
  (u) => u.Role === 'student' && (!input.classCode || u.ClassCode === input.classCode),
);
```

`usersService.search()` trả về **TẤT CẢ** users (teachers, students, parents) match query. Sau đó filter `Role === 'student'` và `classCode` trong JavaScript.

Vấn đề:
- Fetch data không cần thiết (teachers, parents) → tốn bandwidth
- `classCode` filter ở memory → nếu có 1000 results nhưng chỉ 5 cùng class → vẫn fetch 1000

**Fix:** Push filters xuống DB query: thêm `role` và `classCode` param vào `search()`.

---

## Issue #42 — 🐛 `createStudent` và `createClass` không validate references
**Files:** `src/mastra/tools/users/create-student.tool.ts` (Line 28), `src/mastra/tools/users/create-class.tool.ts` (Line 33)
**Severity:** Data integrity

```typescript
// create-student
const result = await usersService.create({
  ClassCode: input.classCode,  // ← không check class tồn tại
});

// create-class
const result = await classesService.create({
  TeacherCode: input.teacherCode,  // ← không check teacher tồn tại
});
```

AI agent có thể tạo học sinh với `classCode: "CLS999"` (không tồn tại) → orphan record. Hoặc tạo lớp với `teacherCode: "TCH999"` → lớp không có giáo viên thật.

**Fix:** Validate reference tồn tại trước khi create (hoặc thêm FK constraint ở DB level).

---

## Issue #43 — 🎨 `get-class-detail` có dead code sau `findByCode`
**File:** `src/mastra/tools/users/get-class-detail.tool.ts` (Line 31-32)
**Severity:** Cleanup

```typescript
const cls = await classesService.findByCode(input.classCode);
if (!cls) throw new Error(`Không tìm thấy lớp ${input.classCode}`); // ← DEAD CODE
```

`classesService.findByCode()` đã **throw `NotFoundException`** nếu không tìm thấy (users.service.ts line 86). Dòng `if (!cls)` không bao giờ reach.

Hơn nữa, throw generic `Error` thay vì `NotFoundException` → nếu có reach, sẽ trả về 500 thay vì 404.

**Fix:** Xóa dead code line.

---

## Issue #44 — ⚠️ `detectDuplicatePayment` để AI agent kiểm soát threshold
**File:** `src/mastra/tools/billing/detect-duplicate-payment.tool.ts` (Line 13)
**Severity:** Security

```typescript
toleranceMinutes: z.number().optional().default(5)
  .describe('Khoảng thời gian cho phép (phút)'),
```

AI agent truyền `toleranceMinutes` vào service. Agent (hoặc LLM hallucination) có thể gửi `toleranceMinutes: 0` → disable duplicate detection, hoặc `10080` (1 week) → flag mọi payment là duplicate.

**Fix:** Hardcode threshold ở server-side, không expose cho AI agent.

---

## Issue #45 — ⚠️ Thiếu `@IsIn()` validation cho enum fields (3 DTOs)
**Files:**
- `src/domain/invoices/dto/query-invoices.dto.ts` (Line 24)
- `src/domain/payments/dto/query-payments.dto.ts` (Line 19, 24)
- `src/domain/monthly-closing/dto/query-monthly-closing.dto.ts` (Line 19)
**Severity:** Validation gap

```typescript
// query-invoices.dto.ts
status?: string;  // ← ApiProperty có enum nhưng KHÔNG có @IsIn()

// query-payments.dto.ts
status?: string;  // ← không có @IsIn()
method?: string;  // ← không có @IsIn()

// query-monthly-closing.dto.ts
status?: string;  // ← không có @IsIn()
```

Cùng bug pattern như #37 (batch 4). Client gửi `?status=banana` → validation pass → query trả về empty (hoặc worse).

**Fix:** Thêm `@IsIn([...])` cho tất cả enum fields.

---

## Issue #46 — 🐢 `get-student-balance` fetch tất cả invoices rồi filter ở memory
**File:** `src/mastra/tools/billing/get-student-balance.tool.ts` (Line 29-36)
**Severity:** Performance

```typescript
const result = await invoicesService.findAll({
  studentCode: input.studentCode,
  limit: 100,  // ← fetch 100 invoices bất kể status
});
const unpaidInvoices = result.data.filter(
  (inv) => inv.Status === 'unpaid' || inv.Status === 'partial',
);
```

Fetch 100 invoices mới nhất rồi filter lấy unpaid/partial. Nếu học sinh có 90 invoices đã paid và 10 unpaid → chỉ lấy về 10 unpaid (hoặc ít hơn nếu paid nằm xen kẽ).

Hơn nữa, `findAll` không hỗ trợ filter by `status` → phải filter ở memory.

**Fix:** Thêm `status` filter vào `findAll()`, hoặc query trực tiếp: `WHERE Status IN ('unpaid', 'partial')`.

---

## Issue #47 — 🐢 `get-teacher-profile` throw generic Error thay vì HttpException
**File:** `src/mastra/tools/users/get-teacher-profile.tool.ts` (Line 39, 43)
**Severity:** Error handling

```typescript
throw new Error('Không tìm thấy giáo viên');      // ← generic Error
throw new Error('Phải cung cấp mã hoặc SĐT...');  // ← generic Error
```

Tool throw generic `Error`. Khi Mastra tool propagate error → agent nhận "Error" message nhưng không có HTTP status code. Nếu expose qua REST API → 500 thay vì 404.

**Fix:** Throw `NotFoundException` hoặc trả về structured error object.

---

## Issue #48 — ⚠️ `saveChannelEvent` dùng code prefix 'CE' — inconsistency
**File:** `src/mastra/agent-router.service.ts` (Line 262)
**Severity:** Consistency

```typescript
const code = CodeGenerator.generate('CE', maxRow?.Code ?? null);
```

Tất cả entities dùng 3-letter prefixes: `TCH`, `STD`, `CLS`, `INV`, `PAY`, `PRT`. Nhưng ChannelEvent dùng `CE` (2 chars). Khi vượt 999 → `CE1000` (4 digits) → sort order sai (cùng bug #10 batch 1).

Ngoài ra, `like('Code', 'CE%')` có thể match nhầm với entities khác bắt đầu bằng "CE" (nếu có).

**Fix:** Dùng prefix 3 chars: `CHN` hoặc `CEV`.

---

## Issue #49 — 🐢 `searchStudent` tool không có result limit
**File:** `src/mastra/tools/users/search-student.tool.ts` (Line 26)
**Severity:** Performance

```typescript
const results = await usersService.search(input.query);
```

`usersService.search()` không có `limit`. Query "a" match hàng ngàn users → fetch tất cả → filter memory → trả về cho agent.

LLM context window có giới hạn. Gửi 1000 students vào tool result → agent bị overload.

**Fix:** Thêm `limit: 20` vào search query. Trả về `total` + `hasMore` nếu cần.

---

## Issue #50 — ⚠️ `createStudent` tool `classCode` là required nhưng không nên
**File:** `src/mastra/tools/users/create-student.tool.ts` (Line 11)
**Severity:** UX/Design

```typescript
classCode: z.string().describe('Mã lớp'),  // ← required
```

`classCode` là required → khi tạo học sinh chưa xếp lớp, agent buộc phải bịa một classCode hoặc hỏi lại. DB schema cho phép `ClassCode` nullable → tool nên cho phép optional.

**Fix:** Đổi thành `classCode: z.string().optional()`.

---

## Tóm tắt

| # | Issue | Mức độ |
|---|---|---|
| 41 | searchStudent filter ở memory | 🐢 Performance |
| 42 | createStudent/createClass không validate refs | 🐛 Data integrity |
| 43 | get-class-detail dead code | 🎨 Cleanup |
| 44 | detectDuplicatePayment để AI kiểm soát threshold | ⚠️ Security |
| 45 | Thiếu @IsIn() cho 3 query DTOs | ⚠️ Validation |
| 46 | get-student-balance fetch rồi filter memory | 🐢 Performance |
| 47 | get-teacher-profile throw generic Error | ⚠️ Error handling |
| 48 | ChannelEvent code prefix 'CE' inconsistency | ⚠️ Consistency |
| 49 | searchStudent không result limit | 🐢 Performance |
| 50 | createStudent classCode required (unnecessary) | ⚠️ Design |
