# ZaloAgent — Zalo-First Tutor Agent

AI-powered tutoring management system built with NestJS + Mastra AI agents, operating via Zalo Bot.

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend Framework** | NestJS 11 |
| **Language** | TypeScript 5.7 (strict mode) |
| **Runtime** | Node.js 22+ |
| **AI Agent Framework** | Mastra (`@mastra/core`) |
| **Database** | PostgreSQL via Supabase + Prisma ORM |
| **Channel** | Zalo Bot API (`node-zalo-bot`) |
| **Background Jobs** | BullMQ + Redis |
| **Validation** | class-validator, class-transformer, Zod |
| **API Docs** | Swagger (`@nestjs/swagger`) |
| **Build Tool** | SWC |

## Project Structure

```
src/
├── channels/               # Channel adapters (Zalo webhook + long-polling)
│   ├── common/             # ChannelEvent, ChannelResponse, ChannelRegistry
│   └── zalo/               # ZaloController, ZaloService, ZaloAdapter, ZaloPollingService
├── core/                   # Cross-cutting concerns
│   ├── config/             # App configuration (ConfigModule, ConfigService)
│   ├── filters/            # Global exception filters
│   ├── health/             # Health check endpoint (/api/health)
│   └── interceptors/       # Request interceptors
├── domain/                 # Business domain modules
│   ├── common/             # AuditService, BaseResponseDto, CodeGenerator, PaginationDto
│   ├── users/              # Students, teachers, parents (CRUD + search)
│   ├── classes/            # Class management (CRUD + fee updates)
│   ├── invoices/           # Invoice generation (per-student, bulk, balance calc)
│   └── payments/           # Payment workflow (draft → confirm/reject, allocate)
├── integrations/           # External service integrations
│   ├── supabase/           # Supabase client (7 tables, Code-based linkage)
│   ├── google-sheets/      # Google Sheets sync service + controller
│   └── ai/                 # AI model configuration (OpenAI)
├── jobs/                   # BullMQ background jobs + schedulers
│   ├── processors/         # SheetsSyncProcessor
│   ├── schedulers/         # ApprovalTimeoutScheduler
│   └── sheets-sync-queue.service.ts
├── mastra/                 # Mastra AI agents & workflows
│   ├── agents/             # OrchestratorAgent, BillingAgent
│   ├── tools/              # 20 agent tools (users, billing, vision, monthly, sheets, channel)
│   ├── workflows/          # 4 workflows (payment text/bill, fee Q&A, reminders)
│   ├── mastra.service.ts   # Mastra instance wrapper
│   ├── agent-router.service.ts    # AI intent classification + routing
│   ├── approval.service.ts        # Human-in-the-loop approval flow
│   ├── workflow-trigger.service.ts # Workflow execution from NestJS
│   └── mastra.controller.ts       # REST API for agents
├── app.module.ts           # Root module
└── main.ts                 # Entry point (Swagger, ValidationPipe, listen)
```

## Getting Started

### Prerequisites

- **Node.js** 22+ (tested on v24.14.1)
- **npm** 11+
- **Redis** — for BullMQ job queues (default: `localhost:6379`)
- **PostgreSQL** — or a Supabase project
- **OpenAI API key** — for AI agent operations

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database (Prisma)
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Zalo Bot
ZALO_BOT_TOKEN=your-bot-token
ZALO_WEBHOOK_SECRET=optional-webhook-secret
ZALO_MODE=webhook              # "webhook" or "polling"

# Redis (BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379

# AI Model
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

### Setup

```bash
# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev

# Seed initial data (optional)
npx prisma db seed

# Start development server (webhook mode)
npm run start:dev

# Start development server (polling mode — no ngrok needed)
ZALO_MODE=polling npm run start:dev
```

### Available Scripts

| Command | Description |
|---|---|
| `npm run build` | Build the project with SWC |
| `npm run start:dev` | Start in watch mode |
| `npm run start:prod` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |
| `npx prisma studio` | Open Prisma Studio |
| `npx prisma migrate dev` | Run database migrations |

## API Endpoints

Swagger UI available at: **http://localhost:3000/api/docs**

### Health
| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check + Supabase connectivity |

### Agents
| Method | Path | Description |
|---|---|---|
| GET | `/api/agents` | List all registered agents |
| POST | `/api/agents/:agentId/chat` | Send message to an agent |

### Users
| Method | Path | Description |
|---|---|---|
| GET | `/api/users` | List users (filter by role, classCode) |
| GET | `/api/users/search/:query` | Search by name/nickname/phone |
| GET | `/api/users/:code` | Get user by code (TCH001, STD001) |
| POST | `/api/users` | Create a new user |
| PUT | `/api/users/:code` | Update a user |
| DELETE | `/api/users/:code` | Soft delete a user |

### Classes
| Method | Path | Description |
|---|---|---|
| GET | `/api/classes` | List classes (filter by teacherCode, status) |
| GET | `/api/classes/:code` | Get class by code (CLS001) |
| POST | `/api/classes` | Create a new class |
| PUT | `/api/classes/:code` | Update a class |
| DELETE | `/api/classes/:code` | Soft delete a class |

### Invoices
| Method | Path | Description |
|---|---|---|
| GET | `/api/invoices` | List invoices (filter, paginate) |
| GET | `/api/invoices/overdue` | Get all overdue invoices |
| GET | `/api/invoices/:code` | Get invoice by code |
| POST | `/api/invoices` | Create a new invoice |
| POST | `/api/invoices/generate` | Bulk generate invoices for a class |
| PUT | `/api/invoices/:code` | Update invoice status |
| POST | `/api/invoices/:code/calculate-balance` | Recalculate invoice balance |

### Payments
| Method | Path | Description |
|---|---|---|
| GET | `/api/payments` | List payments (filter, paginate) |
| GET | `/api/payments/detect-duplicate` | Check for duplicate payments |
| GET | `/api/payments/invoice/:invoiceCode` | Get payments for an invoice |
| GET | `/api/payments/:code` | Get payment by code |
| POST | `/api/payments` | Create a payment draft |
| POST | `/api/payments/:code/confirm` | Confirm a draft payment |
| POST | `/api/payments/:code/reject` | Reject a draft payment |
| POST | `/api/payments/:code/allocate/:invoiceCode` | Allocate payment to invoice |

### Google Sheets
| Method | Path | Description |
|---|---|---|
| POST | `/api/sheets/sync` | Trigger manual sync |
| GET | `/api/sheets/status` | Get sync configuration status |

### Zalo Webhook
| Method | Path | Description |
|---|---|---|
| POST | `/webhook/zalo` | Receive Zalo Bot webhook events |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Zalo Bot API                    │
│            (Webhook / Long-Polling)               │
└───────────────────┬─────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────┐
│           Channel Adapter Layer                   │
│        (ZaloController → ZaloAdapter)             │
└───────────────────┬─────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────┐
│            AgentRouterService                      │
│    AI Intent Classification (OrchestratorAgent)    │
│    Approval Check (human-in-the-loop)              │
└───────┬──────────┬──────────┬───────────────────┘
        │          │          │
   ┌────▼───┐ ┌───▼────┐ ┌──▼──────────┐
   │record  │ │fee     │ │Orchestrator │
   │Payment │ │Question│ │Agent        │
   │Workflow│ │Answer  │ │(manage,etc) │
   └────┬───┘ └───┬────┘ └─────────────┘
        │         │
   ┌────▼───┐ ┌───▼────┐
   │Billing │ │Domain  │
   │Agent   │ │Services│
   └────┬───┘ └───┬────┘
        │         │
┌───────▼─────────▼───────────────────────────────┐
│              Supabase (PostgreSQL)                │
│     7 Tables: User, Class, Invoice, Payment,     │
│     ChannelEvent, MonthlyClosing, AuditLog        │
└─────────────────────────────────────────────────┘
```

## Webhook Mode vs Polling Mode

### Webhook Mode (default)
- Requires a publicly accessible URL (e.g., via ngrok)
- Set `ZALO_MODE=webhook` (or omit)
- Configure your webhook URL in the Zalo Developer Console

### Polling Mode
- No public URL required — the bot polls Zalo's API directly
- Set `ZALO_MODE=polling`
- Ideal for local development without ngrok

## Database

The production data model uses 7 tables, all linked via `Code` fields (not foreign keys):

| Table | Code Prefix | Description |
|---|---|---|
| User | TCH/STD/PRT | Teachers, students, parents |
| Class | CLS | Teaching classes |
| Invoice | INV | Monthly billing invoices |
| Payment | PAY | Payment records (draft → confirmed) |
| ChannelEvent | CE | Inbound Zalo messages + routing |
| MonthlyClosing | MCL | Monthly financial summaries |
| AuditLog | AUD | Change audit trail |

## License

Private — All rights reserved.
