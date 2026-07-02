import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../integrations/supabase/supabase.service';
import { AuditService } from '../common/audit.service';
import { CodeGenerator } from '../common/code-generator';
import { CreateInvoiceDto } from './dto';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: {
    studentCode?: string;
    classCode?: string;
    billingMonth?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const client = this.supabaseService.getClient();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let builder = client
      .from('Invoice')
      .select('*', { count: 'exact' })
      .eq('IsActive', 1)
      .range(from, to)
      .order('Id', { ascending: false });

    if (query.studentCode) builder = builder.eq('StudentCode', query.studentCode);
    if (query.classCode) builder = builder.eq('ClassCode', query.classCode);
    if (query.billingMonth) builder = builder.eq('BillingMonth', query.billingMonth);
    if (query.status) builder = builder.eq('Status', query.status);

    const { data, count, error } = await builder;
    if (error) {
      this.logger.error(`findAll invoices failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch invoices');
    }

    return { data: data ?? [], total: count ?? 0, page, limit };
  }

  async findByCode(code: string) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('Invoice')
      .select('*')
      .eq('Code', code)
      .eq('IsActive', 1)
      .maybeSingle();

    if (error) {
      this.logger.error(`findByCode(${code}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch invoice');
    }
    if (!data) throw new NotFoundException(`Invoice with Code ${code} not found`);
    return data;
  }

  async create(dto: CreateInvoiceDto) {
    const client = this.supabaseService.getClient();

    const { data: maxRow } = await client
      .from('Invoice')
      .select('Code')
      .like('Code', 'INV%')
      .order('Id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const code = CodeGenerator.generate('INV', maxRow?.Code ?? null);

    const { data, error } = await client
      .from('Invoice')
      .insert({
        Name: `Invoice ${dto.StudentCode} - ${dto.BillingMonth}`,
        Code: code,
        StudentCode: dto.StudentCode,
        ClassCode: dto.ClassCode,
        BillingMonth: dto.BillingMonth,
        TotalAmount: dto.TotalAmount,
        PaidAmount: 0,
        RemainingAmount: dto.TotalAmount,
        DueDate: dto.DueDate ?? null,
        Note: dto.Note ?? null,
        Description: `Invoice for student ${dto.StudentCode}, class ${dto.ClassCode}, month ${dto.BillingMonth}`,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`create invoice failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to create invoice');
    }

    await this.auditService.log({
      EntityType: 'Invoice',
      EntityCode: code,
      Action: 'CREATE',
      NewValue: JSON.stringify(data),
      ActorType: 'system',
    });

    this.logger.log(`Invoice created: ${code} for student ${dto.StudentCode}`);
    return data;
  }

  async updateStatus(code: string, status: string) {
    const existing = await this.findByCode(code);

    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('Invoice')
      .update({ Status: status, ModifiedAt: new Date().toISOString() })
      .eq('Code', code)
      .select()
      .single();

    if (error) {
      this.logger.error(`updateStatus(${code}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to update invoice status');
    }

    await this.auditService.log({
      EntityType: 'Invoice',
      EntityCode: code,
      Action: 'UPDATE_STATUS',
      OldValue: JSON.stringify({ Status: existing.Status }),
      NewValue: JSON.stringify({ Status: status }),
      ActorType: 'system',
    });

    this.logger.log(`Invoice ${code} status → ${status}`);
    return data;
  }

  async calculateBalance(code: string) {
    const invoice = await this.findByCode(code);
    const client = this.supabaseService.getClient();

    // Sum confirmed payments for this invoice
    const { data: payments, error: payError } = await client
      .from('Payment')
      .select('Amount')
      .eq('InvoiceCode', code)
      .eq('Status', 'confirmed')
      .eq('IsActive', 1);

    if (payError) {
      this.logger.error(`calculateBalance payments query failed: ${payError.message}`);
      throw new InternalServerErrorException('Failed to fetch payments for balance calculation');
    }

    const paidAmount = (payments ?? []).reduce((sum, p) => sum + p.Amount, 0);
    const remainingAmount = invoice.TotalAmount - paidAmount;

    let status = 'unpaid';
    if (paidAmount <= 0) status = 'unpaid';
    else if (paidAmount >= invoice.TotalAmount) status = 'paid';
    else status = 'partial';

    const { data, error } = await client
      .from('Invoice')
      .update({
        PaidAmount: paidAmount,
        RemainingAmount: remainingAmount,
        Status: status,
        ModifiedAt: new Date().toISOString(),
      })
      .eq('Code', code)
      .select()
      .single();

    if (error) {
      this.logger.error(`calculateBalance update failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to update invoice balance');
    }
    return data;
  }

  async generateForClass(classCode: string, billingMonth: string) {
    const client = this.supabaseService.getClient();

    // Get all active students in the class
    const { data: students, error: studentError } = await client
      .from('User')
      .select('*')
      .eq('ClassCode', classCode)
      .eq('Role', 'student')
      .eq('IsActive', 1);

    if (studentError) {
      this.logger.error(`generateForClass students query failed: ${studentError.message}`);
      throw new InternalServerErrorException('Failed to fetch students for invoice generation');
    }
    if (!students || students.length === 0) {
      throw new NotFoundException(`No active students found for class ${classCode}`);
    }

    // Get class fee info
    const { data: classData, error: classError } = await client
      .from('Class')
      .select('FeeAmount')
      .eq('Code', classCode)
      .eq('IsActive', 1)
      .maybeSingle();

    if (classError) {
      this.logger.error(`generateForClass class query failed: ${classError.message}`);
      throw new InternalServerErrorException('Failed to fetch class fee info');
    }
    if (!classData) throw new NotFoundException(`Class ${classCode} not found`);

    const feeAmount = classData.FeeAmount;
    const invoices: unknown[] = [];

    for (const student of students) {
      // Check if invoice already exists for this student/month
      const { data: existing } = await client
        .from('Invoice')
        .select('Code')
        .eq('StudentCode', student.Code)
        .eq('ClassCode', classCode)
        .eq('BillingMonth', billingMonth)
        .eq('IsActive', 1)
        .maybeSingle();

      if (existing) continue; // Skip existing invoices

      const { data: maxRow } = await client
        .from('Invoice')
        .select('Code')
        .like('Code', 'INV%')
        .order('Id', { ascending: false })
        .limit(1)
        .maybeSingle();

      const code = CodeGenerator.generate('INV', maxRow?.Code ?? null);

      const { data: invoice, error } = await client
        .from('Invoice')
        .insert({
          Name: `Invoice ${student.Code} - ${billingMonth}`,
          Code: code,
          StudentCode: student.Code,
          ClassCode: classCode,
          BillingMonth: billingMonth,
          TotalAmount: feeAmount,
          PaidAmount: 0,
          RemainingAmount: feeAmount,
          Description: `Invoice for student ${student.Code}, class ${classCode}, month ${billingMonth}`,
        })
        .select()
        .single();

      if (!error && invoice) {
        invoices.push(invoice);
      }
    }

    await this.auditService.log({
      TeacherCode: classCode,
      EntityType: 'Invoice',
      EntityCode: classCode,
      Action: 'BULK_GENERATE',
      NewValue: JSON.stringify({
        classCode,
        billingMonth,
        count: invoices.length,
      }),
      ActorType: 'system',
    });

    return invoices;
  }

  async getOverdueInvoices() {
    const client = this.supabaseService.getClient();
    const now = new Date().toISOString();

    const { data, error } = await client
      .from('Invoice')
      .select('*')
      .eq('IsActive', 1)
      .in('Status', ['unpaid', 'partial'])
      .lt('DueDate', now)
      .order('DueDate', { ascending: true });

    if (error) {
      this.logger.error(`getOverdueInvoices failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch overdue invoices');
    }
    return data ?? [];
  }
}
