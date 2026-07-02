# AI Agents

## Overview

ZaloAgent uses two Mastra AI agents to manage the tutoring business:

## OrchestratorAgent

The primary agent that handles all incoming requests, classifies intent, and delegates to specialized agents or workflows.

**Responsibilities:**
- AI-driven intent classification (no keyword matching)
- Route billing-related queries to BillingAgent or workflows
- Handle student/class management directly via tools
- Manage conversation context and thread-based memory
- Coordinate multi-step workflows

**Tools (8):**
| Tool | Description |
|---|---|
| `searchStudent` | Search students by name, nickname, phone |
| `createStudent` | Register a new student |
| `updateStudent` | Update student information |
| `createClass` | Create a new class |
| `updateClass` | Update class details |
| `moveStudent` | Transfer a student between classes |
| `getTeacherProfile` | Get teacher information and statistics |
| `sendChannelMessage` | Send a message through the channel adapter |

## BillingAgent

Specialized agent for financial operations — payment recording, invoicing, reminders, and reporting.

**Responsibilities:**
- Record payments (from text or bill images)
- Track payment status and detect duplicates
- Generate and manage invoices
- Send payment reminders
- Create monthly financial reports
- Sync billing data to Google Sheets

**Tools (12):**
| Tool | Description |
|---|---|
| `getStudentBalance` | Get outstanding balance for a student |
| `getClassDebtList` | List students with overdue payments in a class |
| `createPaymentDraft` | Create a draft payment pending approval |
| `confirmPayment` | Confirm a draft payment |
| `rejectPaymentDraft` | Reject a draft payment with reason |
| `detectDuplicatePayment` | Check for duplicate payment records |
| `allocatePayment` | Allocate a payment to a specific invoice |
| `extractBillFromImage` | OCR extract payment info from bill images |
| `generateReminderMessages` | Create personalized payment reminder messages |
| `collectMonthlyData` | Gather monthly billing data for a class |
| `createMonthlyReport` | Generate a monthly financial report |
| `queueGoogleSheetSync` | Enqueue a BullMQ job to sync data to Google Sheets |

## Workflows

Workflows are triggered from `WorkflowTriggerService` in NestJS (NOT from agent tools), due to a Mastra limitation where tool-initiated workflow runs lose context.

### 1. recordPaymentFromText
Processes payment records received as text messages.
- **Steps:** Parse text → Find student → Create payment draft → Suspend for approval
- **Approval:** Teacher responds "ok" to approve, "hủy" to reject

### 2. recordPaymentFromBill
Processes payment records from bill images (OCR).
- **Steps:** Extract bill data → Find student → Validate amount → Create payment draft → Suspend for approval

### 3. feeQuestionAnswer
Answers fee-related questions from teachers/parents.
- **Steps:** Parse question → Look up relevant data → Generate answer

### 4. generateReminder
Generates personalized payment reminders for a class.
- **Steps:** Collect overdue students → Generate messages per student → Return message list

## Agent Interaction Flow

```
User Message (Zalo)
        │
        ▼
  ZaloController (webhook/polling)
        │
        ▼
  AgentRouterService
        │
        ├── Approval Check → ResumeWorkflow
        │
        ├── Intent: record_payment
        │     ├── Has image → recordPaymentFromBill workflow
        │     └── Text only → recordPaymentFromText workflow
        │
        ├── Intent: fee_query → feeQuestionAnswer workflow
        │
        └── Intent: other → OrchestratorAgent (direct)
```

## Testing Agents

### Via REST API
```bash
# List agents
curl http://localhost:3000/api/agents

# Chat with orchestrator
curl -X POST http://localhost:3000/api/agents/orchestrator/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Tìm học sinh Nguyễn Văn A"}'

# Chat with billing agent
curl -X POST http://localhost:3000/api/agents/billing/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Kiểm tra công nợ lớp CLS001 tháng 2026-07"}'
```

### Via Zalo
Send messages directly to the Zalo Bot. The AgentRouterService will classify intent and route to the appropriate agent/workflow.

## Key Design Decisions

1. **Workflows trigger from NestJS services, NOT from agent tools** — Mastra workflows with suspend/resume cannot be called as tools from agents (known limitation).
2. **Thread-based memory** — Each Zalo conversation has its own memory thread persisted in PostgreSQL via Mastra's PostgresStore.
3. **Channel-agnostic** — Agents don't know about Zalo specifics; the channel adapter layer handles message formatting.
4. **Human-in-the-loop** — Payment drafts require teacher approval before confirmation (ApprovalService + ApprovalTimeoutScheduler).
5. **AI intent classification** — The OrchestratorAgent classifies user intent dynamically without hardcoded keyword matching.
