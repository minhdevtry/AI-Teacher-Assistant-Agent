import { Injectable, OnModuleInit, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mastra } from '@mastra/core';
import type { Agent } from '@mastra/core/agent';
import type { AnyWorkflow } from '@mastra/core/workflows';
import { createOpenAI } from '@ai-sdk/openai';
import { buildMastra } from './mastra.instance';
import { UsersService } from '../domain/users/users.service';
import { ClassesService } from '../domain/classes/classes.service';
import { InvoicesService } from '../domain/invoices/invoices.service';
import { PaymentsService } from '../domain/payments/payments.service';
import { AuditService } from '../domain/common/audit.service';
import { ApprovalService } from './approval.service';
import { SupabaseService } from '../integrations/supabase/supabase.service';
import { SheetsSyncQueueService } from '../jobs/sheets-sync-queue.service';
import {
  createRecordPaymentFromTextWorkflow,
  createRecordPaymentFromBillWorkflow,
  createFeeQuestionAnswerWorkflow,
  createGenerateReminderWorkflow,
} from './workflows';
import {
  createSearchStudentTool,
  createCreateStudentTool,
  createUpdateStudentTool,
  createListStudentsTool,
  createCreateClassTool,
  createUpdateClassTool,
  createListClassesTool,
  createGetClassDetailTool,
  createMoveStudentTool,
  createGetTeacherProfileTool,
  createSendChannelMessageTool,
  createGetStudentBalanceTool,
  createGetClassDebtListTool,
  createCreatePaymentDraftTool,
  createConfirmPaymentTool,
  createRejectPaymentDraftTool,
  createDetectDuplicatePaymentTool,
  createAllocatePaymentTool,
  createExtractBillFromImageTool,
  createGenerateReminderMessagesTool,
  createCollectMonthlyDataTool,
  createCreateMonthlyReportTool,
  createQueueGoogleSheetSyncTool,
} from './tools';

/**
 * Injectable wrapper around the Mastra instance.
 * Provides typed access to agents, workflows, and the raw Mastra object.
 */
@Injectable()
export class MastraService implements OnModuleInit {
  private readonly logger = new Logger(MastraService.name);
  private mastra!: Mastra;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly classesService: ClassesService,
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService,
    private readonly auditService: AuditService,
    private readonly approvalService: ApprovalService,
    private readonly supabaseService: SupabaseService,
    @Optional() private readonly sheetsSyncQueueService?: SheetsSyncQueueService,
  ) {}

  onModuleInit(): void {
    const directUrl = this.configService.get<string>('DIRECT_URL');

    if (!directUrl) {
      this.logger.warn(
        'DIRECT_URL not set — Mastra storage will not be configured',
      );
    }

    // Build OpenAI-compatible model instances via Vercel AI SDK
    const openai = createOpenAI({
      baseURL: this.configService.get<string>('AI_BASE_URL', 'https://api.openai.com/v1'),
      apiKey: this.configService.get<string>('AI_API_KEY', ''),
    });
    const textModel = openai.chat(
      this.configService.get<string>('AI_MODEL', 'gpt-4o-mini'),
    );
    const visionModel = openai.chat(
      this.configService.get<string>('AI_VISION_MODEL', 'gpt-4o'),
    );

    // Build tool instances with injected domain services
    const orchestratorTools = {
      searchStudent: createSearchStudentTool(this.usersService),
      createStudent: createCreateStudentTool(this.usersService),
      updateStudent: createUpdateStudentTool(this.usersService),
      listStudents: createListStudentsTool(this.usersService),
      createClass: createCreateClassTool(this.classesService),
      updateClass: createUpdateClassTool(this.classesService),
      listClasses: createListClassesTool(this.classesService),
      getClassDetail: createGetClassDetailTool(this.classesService, this.usersService),
      moveStudent: createMoveStudentTool(this.usersService),
      getTeacherProfile: createGetTeacherProfileTool(this.usersService),
      sendChannelMessage: createSendChannelMessageTool(),
    };

    const billingTools = {
      getStudentBalance: createGetStudentBalanceTool(this.invoicesService),
      getClassDebtList: createGetClassDebtListTool(
        this.invoicesService,
        this.usersService,
      ),
      createPaymentDraft: createCreatePaymentDraftTool(this.paymentsService),
      confirmPayment: createConfirmPaymentTool(this.paymentsService),
      rejectPaymentDraft: createRejectPaymentDraftTool(this.paymentsService),
      detectDuplicatePayment: createDetectDuplicatePaymentTool(
        this.paymentsService,
      ),
      allocatePayment: createAllocatePaymentTool(this.paymentsService),
      extractBillFromImage: createExtractBillFromImageTool(),
      generateReminderMessages: createGenerateReminderMessagesTool(
        this.invoicesService,
        this.usersService,
      ),
      collectMonthlyData: createCollectMonthlyDataTool(
        this.invoicesService,
        this.classesService,
      ),
      createMonthlyReport: createCreateMonthlyReportTool(
        this.classesService,
        this.invoicesService,
      ),
      queueGoogleSheetSync: createQueueGoogleSheetSyncTool(this.sheetsSyncQueueService!),
    };

    this.mastra = buildMastra(
      {
        directUrl: directUrl || '',
        textModel,
        visionModel,
      },
      { orchestratorTools, billingTools },
      {
        recordPaymentFromText: createRecordPaymentFromTextWorkflow(
          this.usersService,
          this.invoicesService,
          this.paymentsService,
          this.auditService,
          this.approvalService,
        ),
        recordPaymentFromBill: createRecordPaymentFromBillWorkflow(
          this.usersService,
          this.invoicesService,
          this.paymentsService,
          this.auditService,
          this.approvalService,
          this.supabaseService,
        ),
        feeQuestionAnswer: createFeeQuestionAnswerWorkflow(
          this.usersService,
          this.invoicesService,
          this.paymentsService,
          this.classesService,
        ),
        generateReminder: createGenerateReminderWorkflow(
          this.usersService,
          this.invoicesService,
          this.classesService,
        ),
      },
    );

    this.logger.log('Mastra instance initialised with %d tools and 4 workflows', 20);
  }

  /** Return the underlying Mastra instance. */
  getMastra(): Mastra {
    return this.mastra;
  }

  /** Get a registered agent by name. */
  getAgent(name: string): Agent {
    return this.mastra.getAgent(name);
  }

  /** Get a registered workflow by name. */
  getWorkflow(name: string): AnyWorkflow {
    return this.mastra.getWorkflow(name);
  }

}
