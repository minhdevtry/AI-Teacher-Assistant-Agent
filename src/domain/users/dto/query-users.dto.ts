import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { PaginationDto } from '../../common';

export class QueryUsersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['teacher', 'student', 'parent'] })
  @IsOptional()
  @IsString()
  @IsIn(['teacher', 'student', 'parent'])
  role?: string;

  @ApiPropertyOptional({ example: 'CLS001' })
  @IsOptional()
  @IsString()
  classCode?: string;

  @ApiPropertyOptional({ description: 'Search by name/nickname/phone' })
  @IsOptional()
  @IsString()
  search?: string;
}
