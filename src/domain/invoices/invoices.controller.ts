import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceStatusDto,
  GenerateInvoicesDto,
  QueryInvoicesDto,
} from './dto';
import { BaseResponseDto } from '../common';

@ApiTags('Invoices')
@Controller('api/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'List invoices with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Invoices listed successfully' })
  async findAll(@Query() query: QueryInvoicesDto) {
    const result = await this.invoicesService.findAll({
      studentCode: query.studentCode,
      classCode: query.classCode,
      billingMonth: query.billingMonth,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
    return BaseResponseDto.paginated(
      result.data,
      result.total,
      result.page,
      result.limit,
    );
  }

  @Get('overdue')
  @ApiOperation({ summary: 'Get all overdue invoices' })
  @ApiResponse({ status: 200, description: 'Overdue invoices' })
  async getOverdueInvoices() {
    const data = await this.invoicesService.getOverdueInvoices();
    return BaseResponseDto.ok(data);
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get invoice by code' })
  @ApiParam({ name: 'code', description: 'Invoice code (e.g. INV001)' })
  @ApiResponse({ status: 200, description: 'Invoice found' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async findByCode(@Param('code') code: string) {
    const data = await this.invoicesService.findByCode(code);
    return BaseResponseDto.ok(data);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new invoice' })
  @ApiBody({ type: CreateInvoiceDto })
  @ApiResponse({ status: 201, description: 'Invoice created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(@Body() dto: CreateInvoiceDto) {
    const data = await this.invoicesService.create(dto);
    return BaseResponseDto.ok(data, 'Invoice created successfully');
  }

  @Post('generate')
  @ApiOperation({ summary: 'Bulk generate invoices for all students in a class' })
  @ApiBody({ type: GenerateInvoicesDto })
  @ApiResponse({ status: 201, description: 'Invoices generated successfully' })
  @ApiResponse({ status: 404, description: 'Class or students not found' })
  async generateForClass(@Body() dto: GenerateInvoicesDto) {
    const data = await this.invoicesService.generateForClass(
      dto.classCode,
      dto.billingMonth,
    );
    return BaseResponseDto.ok(data, 'Invoices generated successfully');
  }

  @Put(':code')
  @ApiOperation({ summary: 'Update invoice status' })
  @ApiParam({ name: 'code', description: 'Invoice code' })
  @ApiBody({ type: UpdateInvoiceStatusDto })
  @ApiResponse({ status: 200, description: 'Invoice updated successfully' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async updateStatus(
    @Param('code') code: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    const data = await this.invoicesService.updateStatus(code, dto.status);
    return BaseResponseDto.ok(data, 'Invoice updated successfully');
  }

  @Post(':code/calculate-balance')
  @ApiOperation({ summary: 'Recalculate invoice balance from payments' })
  @ApiParam({ name: 'code', description: 'Invoice code' })
  @ApiResponse({ status: 200, description: 'Balance recalculated' })
  async calculateBalance(@Param('code') code: string) {
    const data = await this.invoicesService.calculateBalance(code);
    return BaseResponseDto.ok(data, 'Balance recalculated');
  }
}
