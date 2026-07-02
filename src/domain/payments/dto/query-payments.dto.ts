import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common';

export class QueryPaymentsDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'STD001' })
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiPropertyOptional({ example: 'INV001' })
  @IsOptional()
  @IsString()
  invoiceCode?: string;

  @ApiPropertyOptional({ example: 'confirmed', enum: ['draft', 'confirmed', 'rejected', 'cancelled'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'cash', enum: ['cash', 'bank_transfer', 'momo', 'zalo_pay'] })
  @IsOptional()
  @IsString()
  method?: string;
}
