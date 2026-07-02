import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BaseResponseDto<T = unknown> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiPropertyOptional()
  data?: T;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional()
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };

  static ok<T>(data: T, message?: string): BaseResponseDto<T> {
    const res = new BaseResponseDto<T>();
    res.success = true;
    res.data = data;
    res.message = message;
    return res;
  }

  static paginated<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): BaseResponseDto<T[]> {
    const res = new BaseResponseDto<T[]>();
    res.success = true;
    res.data = data;
    res.meta = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
    return res;
  }

  static fail(message: string): BaseResponseDto<null> {
    const res = new BaseResponseDto<null>();
    res.success = false;
    res.message = message;
    return res;
  }
}
