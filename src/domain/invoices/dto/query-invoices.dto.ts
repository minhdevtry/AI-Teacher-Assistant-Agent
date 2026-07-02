import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common';

export class QueryInvoicesDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'STD001' })
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiPropertyOptional({ example: 'CLS001' })
  @IsOptional()
  @IsString()
  classCode?: string;

  @ApiPropertyOptional({ example: '2026-07' })
  @IsOptional()
  @IsString()
  billingMonth?: string;

  @ApiPropertyOptional({ example: 'unpaid', enum: ['unpaid', 'partial', 'paid', 'overdue', 'cancelled'] })
  @IsOptional()
  @IsString()
  status?: string;
}
