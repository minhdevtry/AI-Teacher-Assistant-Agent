# Code Review — Batch 6: Controllers & Infrastructure

**Date:** 2026-07-03  
**Files reviewed:** users.controller.ts, invoices.controller.ts, payments.controller.ts, monthly-closing.controller.ts, create-class.dto.ts, update-class.dto.ts, health.controller.ts, google-sheets.controller.ts, app.controller.ts, app.service.ts, main.ts, app.module.ts, mastra.module.ts, ping.tool.ts, approval-timeout.scheduler.ts

---

## Issue #51 — Search endpoint uses GET with path param
- **Severity:** Bug
- **File:** `src/domain/users/users.controller.ts` (line 47)
- **Description:** `@Get('search/:query')` puts search keyword in URL path. Keywords containing `/`, `+`, `%`, `?`, `#`, or spaces will break URL routing or be silently truncated/misinterpreted.
- **Impact:** Search is unreliable for real-world input like phone numbers with spaces, Vietnamese names with special chars, etc.
- **Recommendation:** Change to `@Get('search')` with `@Query('q') query: string` query parameter.

## Issue #52 — Search endpoint returns all results, no pagination
- **Severity:** Performance
- **File:** `src/domain/users/users.controller.ts` (line 51-53)
- **Description:** `usersService.search(query)` returns all matching records with no limit. The response uses `BaseResponseDto.ok(data)` which doesn't include pagination metadata.
- **Impact:** With thousands of users, this could return massive payloads and slow down the API.
- **Recommendation:** Add pagination parameters or at minimum a `limit` cap (e.g., max 50 results).

## Issue #53 — Query params not parsed as numbers in detect-duplicate
- **Severity:** Bug
- **File:** `src/domain/payments/payments.controller.ts` (line 58-61)
- **Description:** `@Query('amount') amount: number` and `@Query('toleranceMinutes') toleranceMinutes?: number` — NestJS query params are strings by default. Without `ParseFloatPipe` or `ParseIntPipe`, `amount` remains a string at runtime. The service's `detectDuplicate()` will receive a string instead of a number, causing incorrect numeric comparisons.
- **Impact:** Duplicate detection may fail or produce wrong results. `new Date(paidAt)` could also produce Invalid Date for malformed input.
- **Recommendation:** Add `new ParseFloatPipe()` to `amount` and `new ParseIntPipe({ optional: true })` to `toleranceMinutes`.

## Issue #54 — getOverdueInvoices has no pagination
- **Severity:** Performance
- **File:** `src/domain/invoices/invoices.controller.ts` (line 54)
- **Description:** `getOverdueInvoices()` fetches ALL overdue invoices with no limit, offset, or pagination. Returns everything in a single response.
- **Impact:** As the business grows, this endpoint will become increasingly slow and memory-intensive.
- **Recommendation:** Accept a `QueryInvoicesDto` or dedicated DTO with pagination params.

## Issue #55 — FeeType missing @IsIn() validation
- **Severity:** Bug
- **File:** `src/domain/classes/dto/create-class.dto.ts` (line 25-28)
- **Description:** `FeeType` field has `@ApiPropertyOptional({ enum: ['monthly', 'per-session', 'per-course'] })` for Swagger docs, but no `@IsIn(['monthly', 'per-session', 'per-course'])` decorator. Any string value will pass validation.
- **Impact:** Invalid FeeType values (e.g., "weekly", "FREE") will be stored in DB, breaking fee calculations and reports that rely on this field.
- **Recommendation:** Add `@IsIn(['monthly', 'per-session', 'per-course'])` decorator.

## Issue #56 — Redundant controller-level ValidationPipe
- **Severity:** Maintenance
- **File:** `src/domain/monthly-closing/monthly-closing.controller.ts` (line 18)
- **Description:** `@UsePipes(new ValidationPipe({ transform: true }))` is applied at controller level, but `main.ts` already sets a global `ValidationPipe` with `transform: true`. This is redundant. Other controllers (users, invoices, payments) don't have this — inconsistency.
- **Impact:** Confusing for developers — might think other controllers are missing validation. Could cause double-validation overhead.
- **Recommendation:** Remove the controller-level `@UsePipes` since the global pipe already handles it.

## Issue #57 — No authentication/authorization on any endpoint
- **Severity:** Critical (Security)
- **Files:** All controllers, `src/main.ts`, `src/app.module.ts`
- **Description:** No authentication guards, JWT middleware, API keys, or any security layer exists. All endpoints are publicly accessible. Anyone can create/delete users, record payments, trigger Google Sheets sync, access health data, etc.
- **Impact:** Complete lack of security. In production, this exposes all business data and operations to unauthorized access.
- **Recommendation:** Implement JWT authentication with `@nestjs/passport`, add role-based guards (teacher vs parent vs admin), and protect sensitive endpoints. At minimum, add an API key guard for webhook endpoints.

## Issue #58 — HealthController returns non-standard response format
- **Severity:** Maintenance
- **File:** `src/core/health/health.controller.ts` (line 33-38)
- **Description:** Returns raw `{ status, timestamp, latency, supabase }` instead of using `BaseResponseDto` like all other controllers. Inconsistent API response contract.
- **Impact:** API consumers must handle two different response formats. Breaks the convention established by `BaseResponseDto`.
- **Recommendation:** Wrap response in `BaseResponseDto.ok({ status, timestamp, latency, supabase })` or create a dedicated health response type.

## Issue #59 — Google Sheets sync body not validated
- **Severity:** Bug
- **File:** `src/integrations/google-sheets/google-sheets.controller.ts` (line 40)
- **Description:** `@Body() body: { entityType?: string; billingMonth?: string; classCode?: string }` uses an inline type with no DTO class and no validation decorators. Invalid `entityType` values (e.g., "foo") silently fall through to the `default` case which triggers a full sync — potentially unexpected and expensive.
- **Impact:** No input validation. Typos in `entityType` cause unintended full syncs. `billingMonth` format is not validated (could be "abc").
- **Recommendation:** Create a `SyncSheetsDto` with `@IsOptional()` + `@IsIn(['payment', 'invoice', 'student'])` for entityType, and `@Matches(/^\d{4}-\d{2}$/)` for billingMonth.

## Issue #60 — ApprovalTimeoutScheduler doesn't clean up workflow state
- **Severity:** Feature gap
- **File:** `src/jobs/schedulers/approval-timeout.scheduler.ts` (line 22-66)
- **Description:** When approvals expire, the scheduler only updates `ApprovalStatus` to 'expired' in the `ChannelEvent` table. It does NOT: (1) reject the associated payment draft, (2) notify the teacher/parent, (3) clean up Mastra workflow suspend state. The payment draft remains in 'draft' status forever, and the workflow remains suspended.
- **Impact:** Orphaned payment drafts accumulate in DB. Workflows stay suspended indefinitely, consuming resources. Teachers see stale draft payments that can never be confirmed.
- **Recommendation:** In the scheduler, also: update the related Payment status to 'expired/rejected', resume the Mastra workflow with rejection, and optionally send a notification via the channel adapter.

---

## Summary

| # | Severity | Title |
|---|----------|-------|
| 51 | Bug | Search endpoint uses GET with path param |
| 52 | Performance | Search endpoint returns all results, no pagination |
| 53 | Bug | Query params not parsed as numbers in detect-duplicate |
| 54 | Performance | getOverdueInvoices has no pagination |
| 55 | Bug | FeeType missing @IsIn() validation |
| 56 | Maintenance | Redundant controller-level ValidationPipe |
| 57 | Critical | No authentication/authorization on any endpoint |
| 58 | Maintenance | HealthController returns non-standard response format |
| 59 | Bug | Google Sheets sync body not validated |
| 60 | Feature gap | ApprovalTimeoutScheduler doesn't clean up workflow state |
