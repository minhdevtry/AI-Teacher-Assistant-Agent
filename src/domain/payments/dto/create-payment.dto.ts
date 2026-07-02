import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  IsDateString,
} from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ example: 'STD001' })
  @IsNotEmpty()
  @IsString()
  StudentCode: string;

  @ApiProperty({ example: 500000 })
  @IsNotEmpty()
  @IsInt()
  Amount: number;

  @ApiProperty({ example: 'cash', enum: ['cash', 'bank_transfer', 'momo', 'zalo_pay'] })
  @IsNotEmpty()
  @IsString()
  Method: string;

  @ApiPropertyOptional({ example: 'INV001' })
  @IsOptional()
  @IsString()
  InvoiceCode?: string;

  @ApiPropertyOptional({ example: 'TCH001' })
  @IsOptional()
  @IsString()
  TeacherCode?: string;

  @ApiPropertyOptional({ example: '2026-07-01T10:00:00Z' })
  @IsOptional()
  @IsDateString()
  PaidAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  FileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  FileType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  ExtractedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ExtractedNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ExtractedBank?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  ExtractedTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  ConfidenceScore?: number;

  @ApiPropertyOptional({ example: 'manual', enum: ['manual', 'ai_extraction', 'webhook'] })
  @IsOptional()
  @IsString()
  CreatedFrom?: string;
}

export class RejectPaymentDto {
  @ApiProperty({ example: 'Payment rejected due to invalid amount' })
  @IsNotEmpty()
  @IsString()
  reason: string;
}
