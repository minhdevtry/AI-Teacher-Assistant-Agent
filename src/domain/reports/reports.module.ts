import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { SupabaseModule } from '../../integrations/supabase/supabase.module';
import { ClassesModule } from '../classes/classes.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { MonthlyClosingModule } from '../monthly-closing/monthly-closing.module';

@Module({
  imports: [SupabaseModule, ClassesModule, InvoicesModule, MonthlyClosingModule],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
