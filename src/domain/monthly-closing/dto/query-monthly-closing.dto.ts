import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto';

export class QueryMonthlyClosingDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'CLS001' })
  @IsString()
  @IsOptional()
  classCode?: string;

  @ApiPropertyOptional({ example: '2026-07' })
  @IsString()
  @IsOptional()
  billingMonth?: string;

  @ApiPropertyOptional({ example: 'draft' })
  @IsString()
  @IsOptional()
  status?: string;
}
