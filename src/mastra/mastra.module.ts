import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MastraService } from './mastra.service';
import { MastraController } from './mastra.controller';
import { AgentRouterService } from './agent-router.service';
import { ApprovalService } from './approval.service';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { UsersModule } from '../domain/users/users.module';
import { ClassesModule } from '../domain/classes/classes.module';
import { InvoicesModule } from '../domain/invoices/invoices.module';
import { PaymentsModule } from '../domain/payments/payments.module';
import { SupabaseModule } from '../integrations/supabase/supabase.module';
import { JobsModule } from '../jobs/jobs.module';
import { AuditService } from '../domain/common/audit.service';
import { MonthlyClosingModule } from '../domain/monthly-closing/monthly-closing.module';

/**
 * Mastra integration module.
 *
 * Creates the Mastra instance with PostgresStore and exposes it via
 * MastraService. Also provides AgentRouterService, ApprovalService,
 * and WorkflowTriggerService for the webhook-to-agent pipeline.
 * Exported globally so any module can inject its services.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    SupabaseModule,
    UsersModule,
    ClassesModule,
    InvoicesModule,
    PaymentsModule,
    JobsModule,
    MonthlyClosingModule,
  ],
  controllers: [MastraController],
  providers: [
    MastraService,
    AgentRouterService,
    ApprovalService,
    WorkflowTriggerService,
    AuditService,
  ],
  exports: [
    MastraService,
    AgentRouterService,
    ApprovalService,
    WorkflowTriggerService,
  ],
})
export class MastraModule {}
