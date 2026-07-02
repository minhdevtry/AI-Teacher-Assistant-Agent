import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateMonthlyClosingDto {
  @ApiProperty({ example: 'CLS001' })
  @IsString()
  @IsNotEmpty()
  classCode!: string;

  @ApiProperty({ example: '2026-07' })
  @IsString()
  @IsNotEmpty()
  billingMonth!: string;
}
