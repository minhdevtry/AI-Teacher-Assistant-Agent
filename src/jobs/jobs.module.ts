import { Module, DynamicModule, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { config } from 'dotenv';
import { GoogleSheetsModule } from '../integrations/google-sheets/google-sheets.module';
import { SupabaseModule } from '../integrations/supabase/supabase.module';
import { SheetsSyncProcessor } from './processors/sheets-sync.processor';
import { SheetsSyncQueueService } from './sheets-sync-queue.service';
import { ApprovalTimeoutScheduler } from './schedulers/approval-timeout.scheduler';

// Load .env early so REDIS_ENABLED is available at module-registration time
// (before NestJS ConfigModule initializes)
config();

const logger = new Logger('JobsModule');

@Module({})
export class JobsModule {
  static forRoot(): DynamicModule {
    const redisEnabled = process.env.REDIS_ENABLED === 'true';

    const imports: DynamicModule['imports'] = [ScheduleModule.forRoot()];
    const providers: DynamicModule['providers'] = [
      SheetsSyncQueueService,
      ApprovalTimeoutScheduler,
    ];
    const exports: DynamicModule['exports'] = [SheetsSyncQueueService];

    if (redisEnabled) {
      imports.push(
        BullModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            connection: {
              host: configService.get<string>('REDIS_HOST', 'localhost'),
              port: configService.get<number>('REDIS_PORT', 6379),
            },
          }),
        }),
        BullModule.registerQueue({ name: 'sheets-sync' }),
        GoogleSheetsModule,
        SupabaseModule,
      );
      providers.push(SheetsSyncProcessor);
      exports.push(BullModule);
      logger.log('Redis enabled — BullMQ and sheets-sync job registered');
    } else {
      imports.push(GoogleSheetsModule, SupabaseModule);
      logger.warn(
        'REDIS_ENABLED is not "true" — BullMQ disabled. Background jobs (sheets sync) will not run.',
      );
    }

    return {
      module: JobsModule,
      imports,
      providers,
      exports,
    };
  }
}
