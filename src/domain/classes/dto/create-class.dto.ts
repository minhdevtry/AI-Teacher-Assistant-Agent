import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt } from 'class-validator';

export class CreateClassDto {
  @ApiProperty({ example: 'Lop Toan 12' })
  @IsNotEmpty()
  @IsString()
  Name: string;

  @ApiProperty({ example: 'TCH001' })
  @IsNotEmpty()
  @IsString()
  TeacherCode: string;

  @ApiPropertyOptional({ example: 'Math' })
  @IsOptional()
  @IsString()
  Subject?: string;

  @ApiPropertyOptional({ example: 500000 })
  @IsOptional()
  @IsInt()
  FeeAmount?: number;

  @ApiPropertyOptional({ example: 'monthly', enum: ['monthly', 'per-session', 'per-course'] })
  @IsOptional()
  @IsString()
  FeeType?: string;

  @ApiPropertyOptional({ example: 'Mon,Wed,Fri 18:00-20:00' })
  @IsOptional()
  @IsString()
  Schedule?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  Description?: string;
}
