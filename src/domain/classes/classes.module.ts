import { Module } from '@nestjs/common';
import { ClassesService } from './classes.service';
import { ClassesController } from './classes.controller';
import { AuditService } from '../common/audit.service';

@Module({
  controllers: [ClassesController],
  providers: [ClassesService, AuditService],
  exports: [ClassesService],
})
export class ClassesModule {}
