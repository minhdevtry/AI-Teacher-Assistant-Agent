import { Module } from '@nestjs/common';
import { MonthlyClosingService } from './monthly-closing.service';
import { SupabaseModule } from '../../integrations/supabase/supabase.module';
import { AuditService } from '../common/audit.service';
import { ClassesModule } from '../classes/classes.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { MonthlyClosingController } from './monthly-closing.controller';

@Module({
  imports: [SupabaseModule, ClassesModule, InvoicesModule],
  controllers: [MonthlyClosingController],
  providers: [MonthlyClosingService, AuditService],
  exports: [MonthlyClosingService],
})
export class MonthlyClosingModule {}
