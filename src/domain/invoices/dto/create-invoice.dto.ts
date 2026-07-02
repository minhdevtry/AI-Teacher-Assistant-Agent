import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt } from 'class-validator';

export class CreateInvoiceDto {
  @ApiProperty({ example: 'STD001' })
  @IsNotEmpty()
  @IsString()
  StudentCode: string;

  @ApiProperty({ example: 'CLS001' })
  @IsNotEmpty()
  @IsString()
  ClassCode: string;

  @ApiProperty({ example: '2026-07' })
  @IsNotEmpty()
  @IsString()
  BillingMonth: string;

  @ApiProperty({ example: 500000 })
  @IsNotEmpty()
  @IsInt()
  TotalAmount: number;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @IsString()
  DueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  Note?: string;
}

export class UpdateInvoiceStatusDto {
  @ApiProperty({ example: 'paid', enum: ['unpaid', 'partial', 'paid', 'overdue', 'cancelled'] })
  @IsNotEmpty()
  @IsString()
  status: string;
}

export class GenerateInvoicesDto {
  @ApiProperty({ example: 'CLS001' })
  @IsNotEmpty()
  @IsString()
  classCode: string;

  @ApiProperty({ example: '2026-07' })
  @IsNotEmpty()
  @IsString()
  billingMonth: string;
}
