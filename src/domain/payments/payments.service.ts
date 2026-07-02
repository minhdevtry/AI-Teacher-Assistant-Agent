import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../integrations/supabase/supabase.service';
import { AuditService } from '../common/audit.service';
import { CodeGenerator } from '../common/code-generator';
import { CreatePaymentDto } from './dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: {
    studentCode?: string;
    invoiceCode?: string;
    status?: string;
    method?: string;
    page?: number;
    limit?: number;
  }) {
    const client = this.supabaseService.getClient();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let builder = client
      .from('Payment')
      .select('*', { count: 'exact' })
      .eq('IsActive', 1)
      .range(from, to)
      .order('Id', { ascending: false });

    if (query.studentCode) builder = builder.eq('StudentCode', query.studentCode);
    if (query.invoiceCode) builder = builder.eq('InvoiceCode', query.invoiceCode);
    if (query.status) builder = builder.eq('Status', query.status);
    if (query.method) builder = builder.eq('Method', query.method);

    const { data, count, error } = await builder;
    if (error) {
      this.logger.error(`findAll payments failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch payments');
    }

    return { data: data ?? [], total: count ?? 0, page, limit };
  }

  async findByCode(code: string) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('Payment')
      .select('*')
      .eq('Code', code)
      .eq('IsActive', 1)
      .maybeSingle();

    if (error) {
      this.logger.error(`findByCode(${code}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch payment');
    }
    if (!data) throw new NotFoundException(`Payment with Code ${code} not found`);
    return data;
  }

  async createDraft(dto: CreatePaymentDto) {
    const client = this.supabaseService.getClient();

    const { data: maxRow } = await client
      .from('Payment')
      .select('Code')
      .like('Code', 'PAY%')
      .order('Id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const code = CodeGenerator.generate('PAY', maxRow?.Code ?? null);

    const { data, error } = await client
      .from('Payment')
      .insert({
        Name: `Payment ${dto.StudentCode} - ${dto.Amount}`,
        Code: code,
        StudentCode: dto.StudentCode,
        InvoiceCode: dto.InvoiceCode ?? '',
        TeacherCode: dto.TeacherCode ?? '',
        Amount: dto.Amount,
        Method: dto.Method,
        PaidAt: dto.PaidAt ?? null,
        Status: 'draft',
        CreatedFrom: dto.CreatedFrom ?? 'manual',
        FileUrl: dto.FileUrl ?? null,
        FileType: dto.FileType ?? null,
        ExtractedAmount: dto.ExtractedAmount ?? null,
        ExtractedNote: dto.ExtractedNote ?? null,
        ExtractedBank: dto.ExtractedBank ?? null,
        ExtractedTime: dto.ExtractedTime ?? null,
        ConfidenceScore: dto.ConfidenceScore ?? null,
        Description: `Payment draft for student ${dto.StudentCode}`,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`createDraft failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to create payment draft');
    }

    await this.auditService.log({
      EntityType: 'Payment',
      EntityCode: code,
      Action: 'CREATE_DRAFT',
      NewValue: JSON.stringify(data),
      ActorType: 'system',
    });

    this.logger.log(`Payment draft created: ${code} for student ${dto.StudentCode}`);
    return data;
  }

  async confirm(code: string) {
    const payment = await this.findByCode(code);

    if (payment.Status !== 'draft') {
      throw new BadRequestException(
        `Payment ${code} is not in draft status (current: ${payment.Status})`,
      );
    }

    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('Payment')
      .update({
        Status: 'confirmed',
        ModifiedAt: new Date().toISOString(),
      })
      .eq('Code', code)
      .select()
      .single();

    if (error) {
      this.logger.error(`confirm(${code}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to confirm payment');
    }

    // Update invoice balance if linked to an invoice
    if (payment.InvoiceCode) {
      await this.updateInvoiceBalance(payment.InvoiceCode);
    }

    await this.auditService.log({
      EntityType: 'Payment',
      EntityCode: code,
      Action: 'CONFIRM',
      OldValue: JSON.stringify({ Status: 'draft' }),
      NewValue: JSON.stringify({ Status: 'confirmed' }),
      ActorType: 'system',
    });

    this.logger.log(`Payment confirmed: ${code}`);
    return data;
  }

  async reject(code: string, reason: string) {
    const payment = await this.findByCode(code);

    if (payment.Status !== 'draft') {
      throw new BadRequestException(
        `Payment ${code} is not in draft status (current: ${payment.Status})`,
      );
    }

    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('Payment')
      .update({
        Status: 'rejected',
        Description: reason,
        ModifiedAt: new Date().toISOString(),
      })
      .eq('Code', code)
      .select()
      .single();

    if (error) {
      this.logger.error(`reject(${code}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to reject payment');
    }

    await this.auditService.log({
      EntityType: 'Payment',
      EntityCode: code,
      Action: 'REJECT',
      OldValue: JSON.stringify({ Status: 'draft' }),
      NewValue: JSON.stringify({ Status: 'rejected', reason }),
      ActorType: 'system',
    });

    this.logger.log(`Payment rejected: ${code}`);
    return data;
  }

  async allocateToInvoice(paymentCode: string, invoiceCode: string) {
    const payment = await this.findByCode(paymentCode);

    const client = this.supabaseService.getClient();

    // Verify invoice exists
    const { data: invoice } = await client
      .from('Invoice')
      .select('Code')
      .eq('Code', invoiceCode)
      .eq('IsActive', 1)
      .maybeSingle();

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceCode} not found`);
    }

    const { data, error } = await client
      .from('Payment')
      .update({
        InvoiceCode: invoiceCode,
        ModifiedAt: new Date().toISOString(),
      })
      .eq('Code', paymentCode)
      .select()
      .single();

    if (error) {
      this.logger.error(`allocateToInvoice(${paymentCode}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to allocate payment to invoice');
    }

    // Recalculate invoice balance
    await this.updateInvoiceBalance(invoiceCode);

    await this.auditService.log({
      EntityType: 'Payment',
      EntityCode: paymentCode,
      Action: 'ALLOCATE',
      OldValue: JSON.stringify({ InvoiceCode: payment.InvoiceCode }),
      NewValue: JSON.stringify({ InvoiceCode: invoiceCode }),
      ActorType: 'system',
    });

    this.logger.log(`Payment ${paymentCode} allocated to invoice ${invoiceCode}`);
    return data;
  }

  async detectDuplicate(
    amount: number,
    studentCode: string,
    paidAt: Date,
    toleranceMinutes: number = 5,
  ) {
    const client = this.supabaseService.getClient();

    const startTime = new Date(paidAt.getTime() - toleranceMinutes * 60 * 1000);
    const endTime = new Date(paidAt.getTime() + toleranceMinutes * 60 * 1000);

    const { data, error } = await client
      .from('Payment')
      .select('*')
      .eq('StudentCode', studentCode)
      .eq('Amount', amount)
      .eq('IsActive', 1)
      .in('Status', ['draft', 'confirmed'])
      .gte('PaidAt', startTime.toISOString())
      .lte('PaidAt', endTime.toISOString());

    if (error) {
      this.logger.error(`detectDuplicate failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to check for duplicates');
    }

    return {
      isDuplicate: (data ?? []).length > 0,
      duplicates: data ?? [],
    };
  }

  async getByInvoice(invoiceCode: string) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('Payment')
      .select('*')
      .eq('InvoiceCode', invoiceCode)
      .eq('IsActive', 1)
      .order('PaidAt', { ascending: false });

    if (error) {
      this.logger.error(`getByInvoice(${invoiceCode}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch payments for invoice');
    }
    return data ?? [];
  }

  private async updateInvoiceBalance(invoiceCode: string) {
    const client = this.supabaseService.getClient();

    // Get invoice
    const { data: invoice, error: invoiceError } = await client
      .from('Invoice')
      .select('*')
      .eq('Code', invoiceCode)
      .eq('IsActive', 1)
      .maybeSingle();

    if (invoiceError || !invoice) return;

    // Sum confirmed payments
    const { data: payments, error: payError } = await client
      .from('Payment')
      .select('Amount')
      .eq('InvoiceCode', invoiceCode)
      .eq('Status', 'confirmed')
      .eq('IsActive', 1);

    if (payError) return;

    const paidAmount = (payments ?? []).reduce((sum, p) => sum + p.Amount, 0);
    const remainingAmount = invoice.TotalAmount - paidAmount;

    let status = 'unpaid';
    if (paidAmount <= 0) status = 'unpaid';
    else if (paidAmount >= invoice.TotalAmount) status = 'paid';
    else status = 'partial';

    await client
      .from('Invoice')
      .update({
        PaidAmount: paidAmount,
        RemainingAmount: remainingAmount,
        Status: status,
        ModifiedAt: new Date().toISOString(),
      })
      .eq('Code', invoiceCode);
  }
}
