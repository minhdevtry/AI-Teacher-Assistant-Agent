import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { BaseResponseDto } from '../common/base-response.dto';

@ApiTags('Reports')
@Controller('api/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard-summary')
  @ApiOperation({ summary: 'Lấy báo cáo tổng hợp kết quả (KPI)' })
  @ApiQuery({ name: 'month', required: false, description: 'Tháng báo cáo (Format: YYYY-MM)' })
  async getDashboardSummary(@Query('month') month?: string) {
    const data = await this.reportsService.getDashboardSummary(month);
    return BaseResponseDto.ok(data);
  }

  @Get('classes')
  @ApiOperation({ summary: 'Lấy báo cáo doanh thu theo từng lớp' })
  @ApiQuery({ name: 'month', required: false, description: 'Tháng báo cáo (Format: YYYY-MM)' })
  async getClassFinancials(@Query('month') month?: string) {
    const data = await this.reportsService.getClassFinancials(month);
    return BaseResponseDto.ok(data);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Lấy biểu đồ xu hướng doanh thu lịch sử' })
  @ApiQuery({ name: 'limit', required: false, description: 'Số tháng xem lịch sử' })
  async getRevenueTrends(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 6;
    const data = await this.reportsService.getRevenueTrends(parsedLimit);
    return BaseResponseDto.ok(data);
  }

  @Get('debtors')
  @ApiOperation({ summary: 'Lấy danh sách học sinh nợ học phí' })
  async getDebtors() {
    const data = await this.reportsService.getDebtors();
    return BaseResponseDto.ok(data);
  }

  @Get('class/:classCode/month/:month')
  @ApiOperation({ summary: 'Báo cáo chi tiết thu phí của một lớp cụ thể theo tháng' })
  @ApiParam({ name: 'classCode', description: 'Mã lớp' })
  @ApiParam({ name: 'month', description: 'Tháng (Format: YYYY-MM)' })
  async getClassDetailReport(
    @Param('classCode') classCode: string,
    @Param('month') month: string,
  ) {
    const data = await this.reportsService.getClassDetailReport(classCode, month);
    return BaseResponseDto.ok(data);
  }
}
