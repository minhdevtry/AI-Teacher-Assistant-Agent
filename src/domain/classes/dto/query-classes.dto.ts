import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common';

export class QueryClassesDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'TCH001' })
  @IsOptional()
  @IsString()
  teacherCode?: string;

  @ApiPropertyOptional({ example: 'active', enum: ['active', 'inactive', 'archived'] })
  @IsOptional()
  @IsString()
  status?: string;
}
