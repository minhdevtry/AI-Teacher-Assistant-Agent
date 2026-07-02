# Design Spec: Reporting and Monthly Closing Module

This design document outlines the implementation plan for the **Reporting** and **Monthly Closing** features, preparing the ZaloAgent backend to support the flagship frontend dashboards and charts.

## 1. Overview

The ZaloAgent currently defines a `MonthlyClosing` table in its database schema (Prisma/Supabase) to keep track of monthly financial closings by class and teacher. However, this table is not yet integrated into the application's NestJS backend. Furthermore, there are no endpoints for retrieval of analytics, dashboard aggregates, historical revenue trends, or debtor summaries.

To build the flagship reporting capabilities, we will implement:
1. **`MonthlyClosingModule`**: Handles the lifecycle of closing a month for a class (draft creation, AI-driven and manual approval, finalization, snapshot caching, and reopening).
2. **`ReportsModule`**: Exposes high-level dashboard summaries, class summaries, collection trends, debtor analysis, and class details.
3. **Mastra Tool Integration**: Connects the `collect-monthly-data` and `create-monthly-report` tools to the `MonthlyClosingService` so they save draft reports to the database rather than just computing them in memory.
4. **Hybrid Calculation Strategy**: Calculates current-month reports in real-time while reading past months' finalized reports directly from the database snapshot (`MonthlyClosing` table), ensuring high performance and data freezing.

---

## 2. Component Boundaries & Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Zalo Bot / API                       │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                  AgentRouterService                     │
└──────────────────────────┬──────────────────────────────┘
                           │
       ┌───────────────────┴───────────────────┐
       │ (Mastra Workflows / Tools)            │
       ▼                                       ▼
┌──────────────┐                       ┌──────────────┐
│   Monthly    │                       │    Billing   │
│ Close Tool   │                       │    Agent     │
└──────┬───────┘                       └──────┬───────┘
       │                                      │
       └───────────────────┬──────────────────┘
                           │
                           ▼
             ┌───────────────────────────┐
             │   MonthlyClosingService   │
             └─────────────┬─────────────┘
                           │
                           ▼
             ┌───────────────────────────┐
             │      Supabase (DB)        │
             └───────────────────────────┘
```

The new modules will reside in `src/domain/`:
*   `src/domain/monthly-closing/`
    *   `monthly-closing.module.ts`
    *   `monthly-closing.service.ts`
    *   `monthly-closing.controller.ts`
    *   `dto/` (create, update, and query DTOs)
*   `src/domain/reports/`
    *   `reports.module.ts`
    *   `reports.service.ts`
    *   `reports.controller.ts`

---

## 3. Database Table Structure (Prisma Schema Match)

The implementation maps exactly to the `MonthlyClosing` table defined in `prisma/schema.prisma`:

```prisma
model MonthlyClosing {
  Id               Int      @id @default(autoincrement())
  Name             String   @db.VarChar(128)
  Code             String   @unique @db.VarChar(24)
  Description      String?  @db.VarChar(512)
  CreatedAt        DateTime @default(now())
  ModifiedAt       DateTime @default(now()) @updatedAt
  IsActive         Int      @default(1)

  ClassCode        String  @db.VarChar(24)
  TeacherCode      String  @db.VarChar(24)
  BillingMonth     String  @db.VarChar(7) // e.g., "2026-07"
  TotalStudents    Int
  ExpectedRevenue  Int
  CollectedRevenue Int
  OutstandingDebt  Int
  Overpayment      Int     @default(0)
  Status           String  @default("draft") @db.VarChar(16) // "draft" | "finalized"
  ReportJson       String? @db.Text // Full student invoice details array

  @@map("MonthlyClosing")
}
```

---

## 4. Service Implementations

### 4.1. MonthlyClosingService

Handles closing operations:
*   `createOrUpdateDraft(classCode: string, billingMonth: string)`:
    *   Calculates details using `ClassesService` and `InvoicesService` (expected revenue, collected revenue, outstanding debt, count of students).
    *   Saves a record to `MonthlyClosing` with status `draft`.
    *   Generates a detailed breakdown of students (paid, partial, unpaid) and saves it as a JSON array in the `ReportJson` field.
*   `finalize(code: string)`:
    *   Sets `Status` to `"finalized"`.
    *   Creates an audit log entry.
    *   Saves state.
*   `reopen(code: string)`:
    *   Sets `Status` to `"draft"`.
    *   Creates an audit log entry.
*   `findByCode(code: string)`: Retrieves the closing record.
*   `findAll(query)`: Searches and lists closings with pagination.

### 4.2. ReportsService

Compiles analytical reports using the hybrid strategy:

*   `getDashboardSummary(month?: string)`:
    *   Calculates total active classes, total active students, expected revenue, collected revenue, outstanding debt, and overall collection rate.
    *   For months in the past: Queries the sum of finalized `MonthlyClosing` records.
    *   For the current month: Dynamically aggregates invoices (`Invoice` table) where `IsActive = 1` and `BillingMonth = currentMonth`.
    *   Calculates month-over-month growth rates by comparing against `previousMonth`.
*   `getClassFinancials(month?: string)`:
    *   Loops through active classes.
    *   Queries `MonthlyClosing` if month is in the past and finalized, otherwise calculates from active invoices in real-time.
*   `getRevenueTrends(limit = 6)`:
    *   Generates a list of the last N months.
    *   For each month, calculates expected/collected revenues and collection rates.
*   `getDebtors()`:
    *   Queries all `Invoice` records where `Status IN ('unpaid', 'partial')` and `IsActive = 1`.
    *   Queries `User` to fetch the student's name, nickname, phone, and parent info.
    *   Queries `Class` to retrieve class subject/name.
    *   Orders by remaining balance descending.

---

## 5. API Controller Endpoint Specifications

### 5.1. `MonthlyClosingController` (`/api/monthly-closing`)
Exposes administrative and agent-triggered lifecycles:

*   `GET /api/monthly-closing`
    *   Lists closing records.
    *   Query parameters: `classCode`, `billingMonth`, `status`, `page`, `limit`.
    *   Returns pagination.
*   `GET /api/monthly-closing/:code`
    *   Returns a single closing record, including `ReportJson` parsed as a structured object.
*   `POST /api/monthly-closing`
    *   Manually triggers/recalculates a monthly closing draft.
    *   Body: `classCode` (string), `billingMonth` (string).
*   `POST /api/monthly-closing/:code/finalize`
    *   Transitions a draft to `"finalized"`.
*   `POST /api/monthly-closing/:code/reopen`
    *   Transitions a finalized record back to `"draft"`.

### 5.2. `ReportsController` (`/api/reports`)
Exposes data specifically for frontend charts and visual dashboards:

*   `GET /api/reports/dashboard-summary`
    *   Query parameters: `month` (e.g. `"2026-07"`).
    *   Returns KPI summary objects with MoM changes.
*   `GET /api/reports/classes`
    *   Query parameters: `month` (e.g. `"2026-07"`).
    *   Returns financial details per class.
*   `GET /api/reports/trends`
    *   Query parameters: `limit` (default: `6`).
    *   Returns list of monthly totals.
*   `GET /api/reports/debtors`
    *   Returns outstanding debtor lists sorted by size of debt.
*   `GET /api/reports/class/:classCode/month/:month`
    *   Returns single class deep dive reports.

---

## 6. Mastra Tools Integration

We will modify the monthly tools in `src/mastra/tools/monthly/` to connect them directly to `MonthlyClosingService` for persistence:

1.  **`collect-monthly-data`**:
    *   Instead of calculations in the tool body, delegate to `MonthlyClosingService.createOrUpdateDraft()`.
    *   This guarantees that whenever the AI agent collects data, a draft is saved in the database.
2.  **`create-monthly-report`**:
    *   Delegates to `MonthlyClosingService.createOrUpdateDraft()` to retrieve/upsert the database record.
    *   Uses this record's code as a reference in the output returned to the BillingAgent.

---

## 7. Verification Plan

We will verify this implementation via:
1.  **Automated Unit Tests**:
    *   `monthly-closing.service.spec.ts`: Verify calculation correctness, draft upsert, finalized freezing, and reopening.
    *   `reports.service.spec.ts`: Test dashboard compilation, class listing, debt aging, and trend aggregates with mock invoices and payments.
2.  **E2E API Verification**:
    *   Query reports endpoints using `curl` or Swagger UI at `/api/docs`.
    *   Confirm response schemas align with expected DTO formats.
3.  **Agent Tool E2E Verification**:
    *   Test agent chat to verify that requesting a monthly report correctly creates `MonthlyClosing` records.
