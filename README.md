<div align="center">

# 🤖 ZaloAgent — AI Tutor Management System

**Hệ thống quản lý gia sư thông minh tích hợp AI, vận hành qua Zalo Bot**

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Mastra AI](https://img.shields.io/badge/Mastra-AI%20Agents-6366F1?logo=openai&logoColor=white)](https://mastra.ai)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![License](https://img.shields.io/badge/License-Private-red)](./LICENSE)

</div>

---

## 📖 Overview

**ZaloAgent** là một hệ thống quản lý gia sư thông minh được xây dựng cho giáo viên tư thục Việt Nam. Thay vì cần phần mềm phức tạp, giáo viên chỉ cần **nhắn tin qua Zalo** — AI sẽ tự động hiểu ý định, ghi nhận học phí, tạo báo cáo tài chính, nhắc nhở phụ huynh, và đồng bộ dữ liệu lên Google Sheets.

### ✨ Điểm nổi bật

- 🎙️ **Nhắn tin tự nhiên** — Không cần học phần mềm, gõ giống như nhắn tin thường
- 🧾 **Ghi nhận học phí** từ text hoặc ảnh chuyển khoản (OCR)
- 📊 **Báo cáo tháng tự động** — Doanh thu kỳ vọng, thực thu, nợ tồn theo từng lớp
- 🔔 **Nhắc nợ thông minh** — Tự tạo tin nhắn cá nhân hóa cho từng phụ huynh
- ✅ **Human-in-the-loop** — Mọi giao dịch phải được giáo viên xác nhận trước khi ghi sổ
- 📋 **Google Sheets đồng bộ** — Dữ liệu luôn sẵn sàng để báo cáo và chia sẻ

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Zalo Bot API                              │
│                 (Webhook / Long-Polling mode)                     │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│                  Channel Adapter Layer                             │
│           ZaloController → ZaloAdapter → ZaloService             │
│          (normalizes Zalo events to ChannelEvent model)           │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│                   AgentRouterService                               │
│     ┌─────────────────────────────────────────────────────┐      │
│     │  AI Intent Classification (via OrchestratorAgent)   │      │
│     │  + Approval Resume Check (human-in-the-loop gate)   │      │
│     └──────┬──────────────┬──────────────┬───────────────┘      │
└────────────┼──────────────┼──────────────┼────────────────────── ┘
             │              │              │
    ┌────────▼───┐  ┌───────▼────┐  ┌────▼───────────────────┐
    │ record     │  │ fee        │  │  OrchestratorAgent      │
    │ Payment    │  │ Question   │  │  (students, classes,    │
    │ Workflow   │  │ Answer     │  │   reminders, etc.)      │
    │ (text/img) │  │ Workflow   │  └────────────┬────────────┘
    └────┬───────┘  └───┬────────┘               │
         │              │                         │
    ┌────▼──────────────▼─────────────────────────▼────────────┐
    │                   Domain Services                          │
    │   UsersService · ClassesService · InvoicesService         │
    │   PaymentsService · MonthlyClosingService · ReportsService│
    └────────────────────────┬──────────────────────────────────┘
                             │
    ┌────────────────────────▼──────────────────────────────────┐
    │                  Supabase (PostgreSQL)                      │
    │   7 tables linked by Code strings (no FK constraints)      │
    └───────────────────────────────────────────────────────────┘
```

### 🔄 Message Flow

```
Teacher types: "Bé Minh lớp Toán đóng 500k rồi nha"
        │
        ▼
AgentRouterService → intent: "record_payment"
        │
        ▼
recordPaymentFromText workflow
  Step 1: Parse text → extract name "Minh", amount 500,000đ
  Step 2: Search student → found STD042 (Nguyễn Văn Minh, CLS003)
  Step 3: Create payment draft → PAY-20260702-001
  Step 4: Suspend workflow, reply to teacher:
          "✅ Tìm thấy: Nguyễn Văn Minh - Lớp Toán 8
           Số tiền: 500,000đ
           Trả lời 'ok' để xác nhận, 'hủy' để bỏ"
        │
Teacher replies: "ok"
        │
        ▼
ApprovalService.resume() → PaymentsService.confirm()
→ Invoice updated: PaidAmount += 500,000đ
→ Reply: "✅ Đã ghi nhận thành công!"
```

---

## 🗃️ Database Design

### Entity Relationship Diagram

```mermaid
erDiagram
    User {
        int     Id          PK
        varchar Code        UK  "TCH001 / STD001 / PRT001"
        varchar Name
        varchar Role            "teacher | student | parent"
        varchar Phone
        varchar ZaloUserId
        varchar ClassCode       "→ Class.Code (student only)"
        int     ParentId        "→ User.Id (student→parent)"
        varchar Nickname
        varchar Title           "teacher honorific"
        varchar Tone
        int     IsActive        "1=active, 0=deleted"
    }

    Class {
        int     Id          PK
        varchar Code        UK  "CLS001"
        varchar Name
        varchar TeacherCode     "→ User.Code"
        varchar Subject
        int     FeeAmount
        varchar FeeType         "monthly | per-session"
        varchar Schedule
        varchar Status          "active | inactive"
        int     IsActive
    }

    Invoice {
        int     Id           PK
        varchar Code         UK  "INV20260701001"
        varchar StudentCode      "→ User.Code"
        varchar ClassCode        "→ Class.Code"
        varchar BillingMonth     "YYYY-MM"
        int     TotalAmount
        int     PaidAmount
        int     RemainingAmount
        varchar Status           "unpaid | partial | paid | overdue"
        datetime DueDate
        int     IsActive
    }

    Payment {
        int     Id            PK
        varchar Code          UK  "PAY20260702001"
        varchar StudentCode       "→ User.Code"
        varchar InvoiceCode       "→ Invoice.Code"
        varchar TeacherCode       "→ User.Code"
        int     Amount
        varchar Method            "cash | transfer"
        varchar Status            "draft | confirmed | rejected"
        varchar CreatedFrom       "manual | text | bill_image"
        varchar FileUrl           "bill image URL (OCR source)"
        decimal ConfidenceScore   "AI OCR confidence"
        int     IsActive
    }

    MonthlyClosing {
        int     Id              PK
        varchar Code            UK  "MCL-CLS001-2026-07"
        varchar ClassCode           "→ Class.Code"
        varchar TeacherCode         "→ User.Code"
        varchar BillingMonth        "YYYY-MM"
        int     TotalStudents
        int     ExpectedRevenue     "Σ Invoice.TotalAmount"
        int     CollectedRevenue    "Σ Invoice.PaidAmount"
        int     OutstandingDebt     "Σ Invoice.RemainingAmount"
        int     Overpayment
        varchar Status              "draft | finalized"
        text    ReportJson          "full snapshot JSON"
        int     IsActive
    }

    ChannelEvent {
        int      Id            PK
        varchar  Code          UK  "CE001"
        varchar  Platform          "zalo"
        varchar  SenderId
        varchar  EventType         "message | image | reaction"
        varchar  Content
        varchar  MediaUrl
        varchar  Intent            "AI-classified intent"
        varchar  ApprovalStatus    "none | pending | approved | rejected"
        text     ApprovalPayload   "draft data awaiting approval"
        datetime ApprovedAt
        datetime ExpiresAt
        int      IsActive
    }

    AuditLog {
        int     Id          PK
        varchar Code        UK
        varchar TeacherCode     "→ User.Code"
        varchar EntityType      "Invoice | Payment | Class..."
        varchar EntityCode      "→ any entity Code"
        varchar Action          "create | update | delete | confirm..."
        text    OldValue        "JSON snapshot before"
        text    NewValue        "JSON snapshot after"
        varchar ActorType       "teacher | system | ai"
        int     IsActive
    }

    User        ||--o{ Invoice        : "StudentCode"
    User        ||--o{ Payment        : "StudentCode"
    User        ||--o{ Payment        : "TeacherCode"
    Class       ||--o{ Invoice        : "ClassCode"
    Class       ||--o{ MonthlyClosing : "ClassCode"
    Invoice     ||--o{ Payment        : "InvoiceCode"
    User        ||--o{ MonthlyClosing : "TeacherCode"
```

### 💡 Vì sao thiết kế DB này vượt trội?

#### 1. Liên kết qua `Code` thay vì Foreign Key

Toàn bộ 7 bảng liên kết nhau thông qua **chuỗi Code có ý nghĩa** (ví dụ `CLS001`, `STD042`, `INV20260701001`) thay vì khóa ngoại số nguyên truyền thống.

| Tiêu chí | FK truyền thống | Code-string linkage |
|---|---|---|
| Đọc hiểu dữ liệu | ❌ Chỉ thấy số `42` | ✅ Ngay lập tức biết `STD042` là học sinh |
| Debug production | ❌ Phải JOIN để trace | ✅ Code tự giải thích |
| Viết báo cáo SQL | ❌ Multi-JOIN phức tạp | ✅ `WHERE ClassCode = 'CLS001'` |
| Tích hợp AI tools | ❌ Agent không biết `42` là gì | ✅ Agent hiểu `STD042` ngay |
| Nhập liệu thủ công | ❌ Cần biết ID | ✅ Gõ code trực tiếp |
| Migration dữ liệu | ❌ Cascade FK phức tạp | ✅ Copy rows tự do |

#### 2. Soft Delete qua `IsActive`

Không bao giờ xóa dữ liệu thật. `IsActive = 0` nghĩa là "đã xóa" nhưng vẫn giữ nguyên trong lịch sử → **AuditLog luôn toàn vẹn**, báo cáo lịch sử không bao giờ mất dữ liệu.

#### 3. Code Prefix Convention

```
TCH001  → Giáo viên (Teacher)
STD001  → Học sinh (Student)
PRT001  → Phụ huynh (Parent)
CLS001  → Lớp học (Class)
INV20260701001 → Hóa đơn (Invoice) với timestamp
PAY20260702001 → Thanh toán (Payment)
MCL-CLS001-2026-07 → Đối soát tháng (MonthlyClosing)
```

Convention này cho phép **bất kỳ nhân viên nào đọc được dữ liệu** mà không cần tài liệu tra cứu, và AI agent có thể **tự suy luận** loại entity từ Code mà không cần query thêm.

#### 4. MonthlyClosing — Snapshot thông minh

`MonthlyClosing` lưu **ảnh chụp tài chính cuối tháng** của từng lớp. Đây là điểm thiết kế quan trọng nhất:

```
Tháng hiện tại  → Tính LIVE từ Invoice + Payment tables
Tháng cũ        → Đọc từ MonthlyClosing snapshot (microseconds)
```

Lợi ích:
- **Dashboard load tức thì** dù có hàng nghìn invoice lịch sử
- **Dữ liệu tháng đã đóng sổ không bao giờ thay đổi** → báo cáo consistent
- **ReportJson** lưu toàn bộ chi tiết → có thể reconstruct báo cáo mà không cần tính lại
- Hỗ trợ `reopen` → giáo viên có thể điều chỉnh rồi đóng sổ lại

#### 5. ChannelEvent — Audit trail cho mọi tin nhắn

Mọi tin nhắn Zalo vào đều được lưu kèm:
- Intent phân loại bởi AI
- Trạng thái approval (pending / approved / rejected)
- ApprovalPayload — dữ liệu draft chờ xác nhận
- ExpiresAt — tự động hủy nếu quá thời gian

→ Không bao giờ mất giao dịch dù app crash hay timeout.

---

## 🛠️ Tech Stack

| Layer | Technology | Lý do chọn |
|---|---|---|
| **Backend** | NestJS 11 + TypeScript 5.7 | Dependency injection, module hóa sạch |
| **AI Agents** | Mastra (`@mastra/core`) | Suspend/resume workflow, thread memory |
| **Database** | PostgreSQL via Supabase | Row-level security, realtime, free tier |
| **ORM** | Prisma (migrations only) | Schema-first, type-safe migrations |
| **DB Client** | Supabase JS SDK | Direct queries, không ORM overhead |
| **Messaging** | Zalo Bot API | 76M users ở Việt Nam |
| **Background Jobs** | BullMQ + Redis | Reliable queues, retry, delay |
| **OCR / Vision** | OpenAI GPT-4o Vision | Extract bill amount từ ảnh chuyển khoản |
| **Sheets Export** | Google Sheets API v4 | Giáo viên quen dùng, không cần dashboard |
| **Build** | SWC | 10× faster than tsc |
| **API Docs** | Swagger UI | Auto-generated từ decorators |

---

## 📁 Project Structure

```
src/
├── channels/                   # Channel adapters
│   ├── common/                 # ChannelEvent, ChannelResponse, ChannelRegistry
│   └── zalo/                   # ZaloController, ZaloService, ZaloAdapter, ZaloPollingService
│
├── core/                       # Cross-cutting concerns
│   ├── config/                 # ConfigModule, ConfigService
│   ├── filters/                # Global exception filters
│   ├── health/                 # GET /api/health
│   └── interceptors/           # Request interceptors
│
├── domain/                     # Business domain (pure NestJS modules)
│   ├── common/                 # AuditService, BaseResponseDto, CodeGenerator
│   ├── users/                  # CRUD + search (students, teachers, parents)
│   ├── classes/                # Class management + fee updates
│   ├── invoices/               # Invoice generation (per-student, bulk)
│   ├── payments/               # Payment workflow (draft → confirm/reject)
│   ├── monthly-closing/        # Monthly financial snapshots + lifecycle
│   └── reports/                # Dashboard KPI, trends, debtors, class detail
│
├── integrations/               # External services
│   ├── supabase/               # Supabase client wrapper
│   ├── google-sheets/          # Sheets sync service + controller
│   └── ai/                     # OpenAI model configuration
│
├── jobs/                       # Background processing
│   ├── processors/             # SheetsSyncProcessor (BullMQ)
│   └── schedulers/             # ApprovalTimeoutScheduler
│
└── mastra/                     # AI layer
    ├── agents/                 # OrchestratorAgent, BillingAgent
    ├── tools/                  # 20 tools (users, billing, vision, monthly, sheets)
    ├── workflows/              # 4 workflows with suspend/resume
    ├── agent-router.service.ts # AI intent classification
    ├── approval.service.ts     # Human-in-the-loop approval
    └── workflow-trigger.service.ts
```

---

## 🤖 AI Agents

### OrchestratorAgent

Tác nhân chính, tiếp nhận mọi tin nhắn và phân loại intent bằng AI (không dùng keyword matching).

**8 tools:** `searchStudent`, `createStudent`, `updateStudent`, `createClass`, `updateClass`, `moveStudent`, `getTeacherProfile`, `sendChannelMessage`

### BillingAgent

Tác nhân chuyên biệt về tài chính — ghi nhận học phí, phát hành hóa đơn, nhắc nợ, báo cáo.

**12 tools:** `getStudentBalance`, `getClassDebtList`, `createPaymentDraft`, `confirmPayment`, `rejectPaymentDraft`, `detectDuplicatePayment`, `allocatePayment`, `extractBillFromImage`, `generateReminderMessages`, `collectMonthlyData`, `createMonthlyReport`, `queueGoogleSheetSync`

### 4 Workflows (Suspend/Resume)

| Workflow | Trigger | Mô tả |
|---|---|---|
| `recordPaymentFromText` | Intent: record_payment (text) | Parse → Tìm học sinh → Tạo draft → Chờ xác nhận |
| `recordPaymentFromBill` | Intent: record_payment (image) | OCR ảnh → Validate → Tạo draft → Chờ xác nhận |
| `feeQuestionAnswer` | Intent: fee_query | Truy vấn dữ liệu → Trả lời câu hỏi học phí |
| `generateReminder` | Intent: generate_reminder | Tạo tin nhắn nhắc nợ cá nhân hóa theo lớp |

---

## 📊 Reporting System

### Hybrid Calculation Strategy

```
GET /api/reports/dashboard-summary?month=2026-07

  Tháng hiện tại (2026-07):
    → Query LIVE từ Invoice table
    → Tổng hợp real-time

  Tháng cũ (2026-06, 2026-05, ...):
    → Đọc từ MonthlyClosing snapshot (finalized)
    → Fallback sang Invoice nếu chưa đóng sổ
    → Per-class: finalized lấy snapshot, unclosed tính live
```

### Report Endpoints

| Endpoint | Mô tả |
|---|---|
| `GET /api/reports/dashboard-summary` | KPI tổng: doanh thu, nợ, tỉ lệ thu, so sánh tháng trước |
| `GET /api/reports/classes` | Báo cáo từng lớp: học sinh, doanh thu kỳ vọng vs thực thu |
| `GET /api/reports/trends?limit=6` | Xu hướng doanh thu 6 tháng gần nhất |
| `GET /api/reports/debtors` | Danh sách con nợ, sắp xếp theo số tiền nợ |
| `GET /api/reports/class/:code/month/:month` | Chi tiết từng học sinh trong lớp cho một tháng |

### Monthly Closing Lifecycle

```
createOrUpdateDraft()  →  [draft]
                              │
                         finalize()
                              │
                          [finalized]  ←→  reopen()
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 22+
- Redis (BullMQ job queues)
- Supabase project (PostgreSQL)
- OpenAI API key (GPT-4o for vision, GPT-4o-mini for agents)
- Zalo Developer account + OA Bot

### Installation

```bash
# 1. Clone & install
git clone <repo-url>
cd ZaloAgent
npm install

# 2. Configure environment
cp .env.example .env
# Fill in your credentials (see Environment Variables section)

# 3. Run database migrations
npx prisma migrate dev

# 4. Start development server
npm run start:dev

# Or in polling mode (no ngrok required)
ZALO_MODE=polling npm run start:dev
```

### Environment Variables

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Zalo Bot
ZALO_BOT_TOKEN=your-bot-token
ZALO_WEBHOOK_SECRET=optional-secret
ZALO_MODE=webhook   # or "polling"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# AI
AI_PROVIDER=openai
AI_API_KEY=your-openai-api-key
AI_MODEL=gpt-4o-mini
AI_VISION_MODEL=gpt-4o

# Google Sheets (optional)
GOOGLE_SHEETS_CLIENT_EMAIL=
GOOGLE_SHEETS_PRIVATE_KEY=
GOOGLE_SHEETS_SHEET_ID=

# App
NODE_ENV=development
PORT=3000
```

### Available Scripts

| Command | Description |
|---|---|
| `npm run start:dev` | Start in watch mode |
| `npm run start:prod` | Start production server |
| `npm run build` | Build with SWC |
| `npm run test` | Run unit tests |
| `npm run lint` | ESLint |
| `npx prisma migrate dev` | Run DB migrations |
| `npx prisma studio` | Visual DB browser |

---

## 🌐 API Reference

Swagger UI: **http://localhost:3000/api/docs**

### Core Endpoints

<details>
<summary><strong>Health & Agents</strong></summary>

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check + Supabase connectivity |
| GET | `/api/agents` | List all registered Mastra agents |
| POST | `/api/agents/:id/chat` | Chat with an agent |

</details>

<details>
<summary><strong>Users</strong></summary>

| Method | Path | Description |
|---|---|---|
| GET | `/api/users` | List users (filter by role, classCode) |
| GET | `/api/users/search/:q` | Search by name/nickname/phone |
| GET | `/api/users/:code` | Get user by code |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:code` | Update user |
| DELETE | `/api/users/:code` | Soft delete |

</details>

<details>
<summary><strong>Classes</strong></summary>

| Method | Path | Description |
|---|---|---|
| GET | `/api/classes` | List classes |
| GET | `/api/classes/:code` | Get class by code |
| POST | `/api/classes` | Create class |
| PUT | `/api/classes/:code` | Update class |
| DELETE | `/api/classes/:code` | Soft delete |

</details>

<details>
<summary><strong>Invoices</strong></summary>

| Method | Path | Description |
|---|---|---|
| GET | `/api/invoices` | List & filter invoices |
| GET | `/api/invoices/overdue` | Overdue invoices |
| POST | `/api/invoices` | Create invoice |
| POST | `/api/invoices/generate` | Bulk generate for class |
| PUT | `/api/invoices/:code` | Update invoice |

</details>

<details>
<summary><strong>Payments</strong></summary>

| Method | Path | Description |
|---|---|---|
| GET | `/api/payments` | List payments |
| GET | `/api/payments/detect-duplicate` | Duplicate check |
| POST | `/api/payments` | Create payment draft |
| POST | `/api/payments/:code/confirm` | Confirm draft |
| POST | `/api/payments/:code/reject` | Reject draft |
| POST | `/api/payments/:code/allocate/:inv` | Allocate to invoice |

</details>

<details>
<summary><strong>Reports & Monthly Closing</strong></summary>

| Method | Path | Description |
|---|---|---|
| GET | `/api/reports/dashboard-summary` | KPI dashboard |
| GET | `/api/reports/classes` | Revenue by class |
| GET | `/api/reports/trends` | 6-month revenue trends |
| GET | `/api/reports/debtors` | Overdue student list |
| GET | `/api/reports/class/:code/month/:m` | Class detail report |
| GET | `/api/monthly-closing` | List all monthly closings |
| POST | `/api/monthly-closing` | Create/update draft |
| POST | `/api/monthly-closing/:code/finalize` | Finalize closing |
| POST | `/api/monthly-closing/:code/reopen` | Reopen finalized closing |

</details>

---

## 🔒 Key Design Principles

### Human-in-the-Loop Approval

Mọi giao dịch tài chính đều đi qua bước xác nhận của giáo viên trước khi ghi sổ:

```
AI tạo PaymentDraft → Hỏi giáo viên → Giáo viên gõ "ok" → Confirm
                                      → Giáo viên gõ "hủy" → Reject
                                      → Timeout 30 phút → Auto-reject
```

### Channel-Agnostic Architecture

Agents không biết gì về Zalo. Mọi thứ được abstract qua `ChannelAdapter` → dễ dàng thêm Telegram, Facebook Messenger, hay Web App sau này.

### Workflows ≠ Agent Tools

Workflows với suspend/resume **được trigger từ NestJS service** (không phải từ agent tool) vì Mastra không hỗ trợ resume workflow khi được gọi từ trong tool.

---

## 🧪 Testing

```bash
npm run test          # Unit tests (37 tests, 5 suites)
npm run test:e2e      # End-to-end tests
npm run test:cov      # Coverage report
```

**Test coverage:** Services, Controllers (MonthlyClosing, Reports, AppController)
- `37/37 tests passing` ✅
- Mock-driven unit tests với Supabase client stubs

---

## 📄 License

Private — All rights reserved.

---

<div align="center">

Built with ❤️ for Vietnamese tutors · Powered by NestJS + Mastra AI + Supabase

</div>
