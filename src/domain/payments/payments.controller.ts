import {
  Controller,
  Get,
  Post,
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
  ApiQuery,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import {
  CreatePaymentDto,
  RejectPaymentDto,
  QueryPaymentsDto,
} from './dto';
import { BaseResponseDto } from '../common';

@ApiTags('Payments')
@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'List payments with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Payments listed successfully' })
  async findAll(@Query() query: QueryPaymentsDto) {
    const result = await this.paymentsService.findAll({
      studentCode: query.studentCode,
      invoiceCode: query.invoiceCode,
      status: query.status,
      method: query.method,
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

  @Get('detect-duplicate')
  @ApiOperation({ summary: 'Check for duplicate payments' })
  @ApiQuery({ name: 'amount', required: true, type: Number })
  @ApiQuery({ name: 'studentCode', required: true, type: String })
  @ApiQuery({ name: 'paidAt', required: true, type: String })
  @ApiQuery({ name: 'toleranceMinutes', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Duplicate check result' })
  async detectDuplicate(
    @Query('amount') amount: number,
    @Query('studentCode') studentCode: string,
    @Query('paidAt') paidAt: string,
    @Query('toleranceMinutes') toleranceMinutes?: number,
  ) {
    const result = await this.paymentsService.detectDuplicate(
      amount,
      studentCode,
      new Date(paidAt),
      toleranceMinutes,
    );
    return BaseResponseDto.ok(result);
  }

  @Get('invoice/:invoiceCode')
  @ApiOperation({ summary: 'Get all payments for an invoice' })
  @ApiParam({ name: 'invoiceCode', description: 'Invoice code' })
  @ApiResponse({ status: 200, description: 'Payments for invoice' })
  async getByInvoice(@Param('invoiceCode') invoiceCode: string) {
    const data = await this.paymentsService.getByInvoice(invoiceCode);
    return BaseResponseDto.ok(data);
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get payment by code' })
  @ApiParam({ name: 'code', description: 'Payment code (e.g. PAY001)' })
  @ApiResponse({ status: 200, description: 'Payment found' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async findByCode(@Param('code') code: string) {
    const data = await this.paymentsService.findByCode(code);
    return BaseResponseDto.ok(data);
  }

  @Post()
  @ApiOperation({ summary: 'Create a payment draft' })
  @ApiBody({ type: CreatePaymentDto })
  @ApiResponse({ status: 201, description: 'Payment draft created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async createDraft(@Body() dto: CreatePaymentDto) {
    const data = await this.paymentsService.createDraft(dto);
    return BaseResponseDto.ok(data, 'Payment draft created');
  }

  @Post(':code/confirm')
  @ApiOperation({ summary: 'Confirm a draft payment' })
  @ApiParam({ name: 'code', description: 'Payment code' })
  @ApiResponse({ status: 200, description: 'Payment confirmed' })
  @ApiResponse({ status: 400, description: 'Payment not in draft status' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async confirm(@Param('code') code: string) {
    const data = await this.paymentsService.confirm(code);
    return BaseResponseDto.ok(data, 'Payment confirmed');
  }

  @Post(':code/reject')
  @ApiOperation({ summary: 'Reject a draft payment' })
  @ApiParam({ name: 'code', description: 'Payment code' })
  @ApiBody({ type: RejectPaymentDto })
  @ApiResponse({ status: 200, description: 'Payment rejected' })
  @ApiResponse({ status: 400, description: 'Payment not in draft status' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async reject(@Param('code') code: string, @Body() dto: RejectPaymentDto) {
    const data = await this.paymentsService.reject(code, dto.reason);
    return BaseResponseDto.ok(data, 'Payment rejected');
  }

  @Post(':code/allocate/:invoiceCode')
  @ApiOperation({ summary: 'Allocate payment to an invoice' })
  @ApiParam({ name: 'code', description: 'Payment code' })
  @ApiParam({ name: 'invoiceCode', description: 'Invoice code' })
  @ApiResponse({ status: 200, description: 'Payment allocated' })
  @ApiResponse({ status: 404, description: 'Payment or invoice not found' })
  async allocateToInvoice(
    @Param('code') code: string,
    @Param('invoiceCode') invoiceCode: string,
  ) {
    const data = await this.paymentsService.allocateToInvoice(code, invoiceCode);
    return BaseResponseDto.ok(data, 'Payment allocated to invoice');
  }
}
