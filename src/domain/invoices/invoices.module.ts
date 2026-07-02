import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { AuditService } from '../common/audit.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, AuditService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
