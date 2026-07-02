import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsInt,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'student', enum: ['teacher', 'student', 'parent'] })
  @IsNotEmpty()
  @IsString()
  @IsIn(['teacher', 'student', 'parent'])
  Role: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  @IsNotEmpty()
  @IsString()
  Name: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  Phone?: string;

  @ApiPropertyOptional({ example: 'zalo_user_123' })
  @IsOptional()
  @IsString()
  ZaloUserId?: string;

  @ApiPropertyOptional({ example: 'CLS001' })
  @IsOptional()
  @IsString()
  ClassCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  ParentId?: number;

  @ApiPropertyOptional({ example: 'An' })
  @IsOptional()
  @IsString()
  Nickname?: string;

  @ApiPropertyOptional({ example: 'Mr' })
  @IsOptional()
  @IsString()
  Title?: string;

  @ApiPropertyOptional({ example: 'formal' })
  @IsOptional()
  @IsString()
  Tone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  Description?: string;
}
