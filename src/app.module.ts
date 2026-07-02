import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FiltersModule } from './core/filters/filters.module';
import { InterceptorsModule } from './core/interceptors/interceptors.module';
import { MastraModule } from './mastra/mastra.module';
import { ChannelsModule } from './channels/channels.module';
import { UsersModule } from './domain/users/users.module';
import { ClassesModule } from './domain/classes/classes.module';
import { InvoicesModule } from './domain/invoices/invoices.module';
import { PaymentsModule } from './domain/payments/payments.module';
import { MonthlyClosingModule } from './domain/monthly-closing/monthly-closing.module';
import { ReportsModule } from './domain/reports/reports.module';
import { SupabaseModule } from './integrations/supabase/supabase.module';
import { GoogleSheetsModule } from './integrations/google-sheets/google-sheets.module';
import { AiModule } from './integrations/ai/ai.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthController } from './core/health/health.controller';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    FiltersModule,
    InterceptorsModule,
    MastraModule,
    ChannelsModule,
    UsersModule,
    ClassesModule,
    InvoicesModule,
    PaymentsModule,
    MonthlyClosingModule,
    ReportsModule,
    SupabaseModule,
    GoogleSheetsModule,
    AiModule,
    JobsModule.forRoot(),
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
