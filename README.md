<div align="center">

# 🤖 ZaloAgent
*AI-Powered Tutor Management via Zalo — Vietnamese private tutors*

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white" alt="NestJS"/>
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Mastra-AI%20Agents-6366F1?logo=openai&logoColor=white" alt="Mastra AI"/>
  <img src="https://img.shields.io/badge/PostgreSQL-Prisma-336791?logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Redis-BullMQ-DC382D?logo=redis&logoColor=white" alt="BullMQ"/>
  <img src="https://img.shields.io/badge/Google%20Sheets-API-34A853?logo=google-sheets&logoColor=white" alt="Google Sheets"/>
</p>

</div>

---

## ✨ Tổng Quan
ZaloAgent là hệ thống backend AI-first cho giáo viên tư thục Việt Nam. Giáo viên nhắn tin tiếng Việt tự nhiên qua Zalo Bot — 2 AI agents tự phân loại ý định, thực thi nghiệp vụ và trả kết quả mà không cần dùng phần mềm phức tạp.

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | NestJS 11 + TypeScript 5.7 |
| **AI Agents** | Mastra AI (Orchestrator + Billing agents) |
| **Database** | PostgreSQL + Prisma ORM |
| **Queue** | BullMQ + Redis |
| **Memory** | Mastra PostgresStore (thread-based) |
| **External** | Google Sheets API, Zalo Bot API, OpenAI Vision OCR |

## 🎯 Tính Năng Chính

| | |
|---|---|
| 🎙️ | Nhắn tin tự nhiên bằng tiếng Việt qua Zalo |
| 🧾 | Ghi nhận học phí từ text hoặc ảnh chuyển khoản (Vision OCR) |
| ✅ | Human-in-the-loop: mọi giao dịch cần giáo viên duyệt trước khi ghi sổ |
| 📊 | Báo cáo tài chính: doanh thu, nợ tồn, xu hướng theo tháng |
| 🔔 | Tạo tin nhắn nhắc nợ cá nhân hóa cho từng phụ huynh |
| 📋 | Đồng bộ Google Sheets qua BullMQ job queue |

## 🤖 AI Agents

- **OrchestratorAgent** — AI phân loại ý định (intent classification), quản lý học sinh/lớp, gửi tin nhắn. 8 tools.
- **BillingAgent** — Chuyên gia tài chính: ghi nhận thanh toán, phát hiện trùng lặp, tạo hóa đơn, tạo báo cáo. 12 tools.

## ⚙️ Kiến Trúc

```
Zalo → ChannelAdapter → AgentRouterService → Mastra Agents
                                              ├── Workflow (suspend/resume)
                                              │   ├── recordPaymentText
                                              │   ├── recordPaymentBill
                                              │   ├── feeQuestionAnswer
                                              │   └── generateReminder
                                              └── BullMQ → Google Sheets
```

**Design Patterns:** Channel Adapter · Human-in-the-loop Approval · Thread-based Memory · BullMQ Job Queue · Soft Delete + Audit Trail

## 📊 Database Schema (7 tables)

User · Class · Invoice · Payment · ChannelEvent · MonthlyClosing · AuditLog

## 📁 Cấu Trúc Source

```
src/
├── channels/zalo/         Zalo webhook + channel adapter
├── domain/                CRUD: users, classes, invoices, payments, reports
├── integrations/          Google Sheets, Supabase
├── jobs/                  BullMQ schedulers + processors
├── mastra/
│   ├── agents/           Orchestrator + Billing agents
│   ├── tools/             23 agent tools
│   ├── workflows/        4 suspend/resume workflows
│   └── agent-router.service.ts
└── core/                  Config, health, filters
```

## 🧪 Testing

```bash
npm run test          # Unit tests (Jest)
npm run test:e2e      # End-to-end (Supertest)
npm run test:cov      # Coverage report
```

## 🚀 Getting Started

```bash
npm install
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

---

<div align="center">

*NestJS · Mastra AI · PostgreSQL · BullMQ · Google Sheets · Zalo Bot*

</div>
