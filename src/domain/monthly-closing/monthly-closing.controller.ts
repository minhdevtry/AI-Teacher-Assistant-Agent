import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { MonthlyClosingService } from './monthly-closing.service';
import { CreateMonthlyClosingDto, QueryMonthlyClosingDto } from './dto';
import { BaseResponseDto } from '../common/base-response.dto';

@ApiTags('Monthly Closing')
@Controller('api/monthly-closing')
@UsePipes(new ValidationPipe({ transform: true }))
export class MonthlyClosingController {
  constructor(private readonly monthlyClosingService: MonthlyClosingService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách các bản chốt sổ tháng' })
  @ApiResponse({ status: 200, description: 'Success' })
  async findAll(@Query() query: QueryMonthlyClosingDto) {
    const result = await this.monthlyClosingService.findAll(query);
    return BaseResponseDto.paginated(
      result.data,
      result.total,
      result.page,
      result.limit,
    );
  }

  @Get(':code')
  @ApiOperation({ summary: 'Lấy chi tiết bản chốt sổ tháng theo Code' })
  @ApiParam({ name: 'code', description: 'Mã chốt sổ (VD: MCL001)' })
  async findByCode(@Param('code') code: string) {
    const data = await this.monthlyClosingService.findByCode(code);
    return BaseResponseDto.ok(data);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo hoặc cập nhật nháp bản chốt sổ tháng' })
  async createDraft(@Body() dto: CreateMonthlyClosingDto) {
    const data = await this.monthlyClosingService.createOrUpdateDraft(
      dto.classCode,
      dto.billingMonth,
    );
    return BaseResponseDto.ok(
      data,
      'Đã tạo/cập nhật bản chốt sổ nháp thành công',
    );
  }

  @Post(':code/finalize')
  @ApiOperation({ summary: 'Phê duyệt hoàn thành chốt sổ tháng' })
  @ApiParam({ name: 'code', description: 'Mã chốt sổ' })
  async finalize(@Param('code') code: string) {
    const data = await this.monthlyClosingService.finalize(code);
    return BaseResponseDto.ok(data, 'Đã hoàn thành chốt sổ tháng');
  }

  @Post(':code/reopen')
  @ApiOperation({ summary: 'Mở lại bản chốt sổ đã phê duyệt về nháp' })
  @ApiParam({ name: 'code', description: 'Mã chốt sổ' })
  async reopen(@Param('code') code: string) {
    const data = await this.monthlyClosingService.reopen(code);
    return BaseResponseDto.ok(data, 'Đã mở lại chốt sổ tháng');
  }
}
