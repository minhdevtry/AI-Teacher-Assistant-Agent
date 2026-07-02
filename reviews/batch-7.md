# Code Review — Batch 7: Services & Common Utilities

**Date:** 2026-07-03  
**Files reviewed:** invoices.service.ts, payments.service.ts, monthly-closing.service.ts, code-generator.ts, audit.service.ts, base-response.dto.ts, pagination.dto.ts, approval.service.ts, mastra.service.ts, mastra.controller.ts, supabase.service.ts, prisma/schema.prisma

---

## Issue #61 — CodeGenerator race condition
- **Severity:** Critical (Concurrency)
- **File:** `src/domain/common/code-generator.ts` (line 2-8)
- **Description:** `CodeGenerator.generate()` does `SELECT max Code` → parse → increment → return, with no locking mechanism. Two concurrent requests (e.g., two webhook events arriving simultaneously) can read the same max code and generate duplicate codes, violating the `@unique` constraint on `Code`.
- **Impact:** Duplicate code generation causes DB errors or silent data corruption under concurrent load.
- **Recommendation:** Use `SupabaseService.generateUniqueCode()` (which attempts advisory locks) everywhere, or implement DB-level sequences. Alternatively, use UUID-based codes.

## Issue #62 — AuditService: 2 queries per log entry
- **Severity:** Performance
- **File:** `src/domain/common/audit.service.ts` (line 25-33)
- **Description:** Every `log()` call first queries `SELECT Code FROM AuditLog ... ORDER BY Id DESC LIMIT 1` to find the max code, then inserts. For bulk operations (e.g., `generateForClass` which logs once per student), this doubles the DB round-trips.
- **Impact:** Audit logging adds 2x latency to every business operation. Under load, the max-code query itself becomes a contention point.
- **Recommendation:** Use `SupabaseService.generateUniqueCode()` with advisory locks, or use a DB sequence/identity column for audit codes.

## Issue #63 — SupabaseService.generateUniqueCode() calls non-existent RPC
- **Severity:** Bug
- **File:** `src/integrations/supabase/supabase.service.ts` (line 37)
- **Description:** `client.rpc('pg_advisory_xact_lock', { lock_id: lockId })` calls a PostgreSQL function `pg_advisory_xact_lock` as a Supabase RPC. However, this is a built-in PostgreSQL function that is NOT exposed via Supabase's RPC interface unless explicitly created as a Postgres function accessible via the API. This will fail with "function does not exist" or similar error.
- **Impact:** The `generateUniqueCode()` method is dead code — it's never called. When someone tries to use it, it will crash.
- **Recommendation:** Either create the function in the DB via a migration (`CREATE FUNCTION ...`), or implement advisory locking via a raw connection. Document that this method is not yet functional.

## Issue #64 — Duplicate balance calculation logic
- **Severity:** Maintenance
- **Files:** `src/domain/payments/payments.service.ts` (line 307-357), `src/domain/invoices/invoices.service.ts` (line 150-192)
- **Description:** `PaymentsService.updateInvoiceBalance()` (private) and `InvoicesService.calculateBalance()` (public) contain nearly identical logic: sum confirmed payments → compute paidAmount/remainingAmount → determine status → update invoice. Any fix to one must be manually replicated in the other.
- **Impact:** If the balance calculation logic changes (e.g., adding credit notes, handling overpayments), one copy may be updated while the other is forgotten, causing inconsistent behavior.
- **Recommendation:** Remove `updateInvoiceBalance()` from `PaymentsService` and call `InvoicesService.calculateBalance()` instead. Inject `InvoicesService` into `PaymentsService`.

## Issue #65 — generateForClass inserts one-by-one, not atomic
- **Severity:** Performance + Bug
- **File:** `src/domain/invoices/invoices.service.ts` (line 252-276)
- **Description:** Inserts invoices in a `for` loop with individual `.insert().single()` calls. For a class of 30 students, that's 30 separate DB round-trips. If insert #15 fails (e.g., unique constraint), inserts 1-14 are already committed with no rollback.
- **Impact:** Partial generation leaves the system in an inconsistent state — some students have invoices, others don't. No way to retry without duplicates.
- **Recommendation:** Use Supabase's batch `.insert(arrayOfRows)` for atomicity. Handle existing invoices via upsert or pre-filter (already partially done with `existingCodes`).

## Issue #66 — Hardcoded limit 1000 in createOrUpdateDraft
- **Severity:** Bug
- **File:** `src/domain/monthly-closing/monthly-closing.service.ts` (line 78-82)
- **Description:** `this.invoicesService.findAll({ classCode, billingMonth, limit: 1000 })` hardcodes a limit of 1000 invoices. If a class has more than 1000 invoices in a billing month (unlikely but possible for large centers), the revenue calculations will be based on incomplete data.
- **Impact:** Silent data truncation leads to incorrect financial reports. The teacher won't know the report is wrong.
- **Recommendation:** Either remove the limit (fetch all), or add a warning when the limit is hit. Better: query the count first and paginate if needed.

## Issue #67 — Approval keyword matching too strict
- **Severity:** Feature gap
- **File:** `src/mastra/approval.service.ts` (line 69-70)
- **Description:** `APPROVE_KEYWORDS.has(normalised)` and `REJECT_KEYWORDS.has(normalised)` require exact string match after lowercasing and trimming. Vietnamese users commonly add particles like "nhé", "ạ", "nha", "đi" — e.g., "ok nhé", "duyệt ạ", "hủy nha" — which won't match any keyword.
- **Impact:** Many legitimate approval/rejection messages will be treated as non-approval, causing the workflow to route to the OrchestratorAgent instead of resuming the pending workflow.
- **Recommendation:** Use `Array.some(keyword => normalised.includes(keyword))` or word-boundary regex matching. Also consider trimming common particles before matching.

## Issue #68 — MastraController.chat() has excessive `any` casts
- **Severity:** Maintenance
- **File:** `src/mastra/mastra.controller.ts` (line 113-189)
- **Description:** ~80 lines of manual text extraction from Mastra response with 7 `any` type casts. The `extractFromMessages` helper, `steps` iteration, and `debugInfo` construction are all untyped. The fallback returns a generic Vietnamese error message without any error detail.
- **Impact:** Hard to maintain, refactor, or test. If Mastra's response format changes, this code breaks silently. The debug fallback doesn't help diagnose issues.
- **Recommendation:** Extract text extraction logic to a typed utility function. Define an interface for the Mastra response shape. Include error detail in the fallback message (at least in dev mode).

## Issue #69 — No transaction support for multi-step operations
- **Severity:** Bug (Data Integrity)
- **Files:** `payments.service.ts`, `invoices.service.ts`, `monthly-closing.service.ts`
- **Description:** Multiple services perform multi-step DB operations without transactions. Examples: `PaymentsService.confirm()` updates payment status THEN recalculates invoice balance — if the second fails, the payment is confirmed but the invoice is stale. `generateForClass()` inserts N invoices without a transaction. `createOrUpdateDraft()` reads invoices then writes a closing record — no isolation.
- **Impact:** Partial failures leave the system in an inconsistent state. A confirmed payment with wrong invoice balance is worse than a failed payment — it gives false confidence.
- **Recommendation:** Use Supabase's RPC to call Postgres functions that wrap multi-step operations, or use the `supabase-js` transaction-like pattern (sequential operations with manual rollback on error).

## Issue #70 — Prisma schema defined but not used at runtime
- **Severity:** Maintenance
- **File:** `prisma/schema.prisma` (entire file)
- **Description:** The Prisma schema defines the full data model with types, relations, and defaults. However, all runtime queries use `@supabase/supabase-js` directly via raw table/column names. The Prisma Client is generated (`output = "../generated/prisma"`) but never imported in any service file.
- **Impact:** Schema changes require updating both the Prisma schema AND all Supabase queries manually, with no compile-time safety. Column renames, type changes, or new tables can cause runtime errors that the compiler can't catch. Two sources of truth drift apart.
- **Recommendation:** Either (a) commit to Supabase-only and remove Prisma (keep schema as documentation only), or (b) migrate services to use Prisma Client for type-safe queries. Option (a) is pragmatic; option (b) is safer long-term.

---

## Summary

| # | Severity | Title |
|---|----------|-------|
| 61 | Critical | CodeGenerator race condition |
| 62 | Performance | AuditService: 2 queries per log entry |
| 63 | Bug | SupabaseService.generateUniqueCode() calls non-existent RPC |
| 64 | Maintenance | Duplicate balance calculation logic |
| 65 | Performance + Bug | generateForClass inserts one-by-one, not atomic |
| 66 | Bug | Hardcoded limit 1000 in createOrUpdateDraft |
| 67 | Feature gap | Approval keyword matching too strict |
| 68 | Maintenance | MastraController.chat() has excessive `any` casts |
| 69 | Bug | No transaction support for multi-step operations |
| 70 | Maintenance | Prisma schema defined but not used at runtime |
