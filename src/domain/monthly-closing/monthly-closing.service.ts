import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../integrations/supabase/supabase.service';
import { AuditService } from '../common/audit.service';
import { ClassesService } from '../classes/classes.service';
import { InvoicesService } from '../invoices/invoices.service';
import { CodeGenerator } from '../common/code-generator';
import { QueryMonthlyClosingDto } from './dto';

@Injectable()
export class MonthlyClosingService {
  private readonly logger = new Logger(MonthlyClosingService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
    private readonly classesService: ClassesService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async findAll(query: QueryMonthlyClosingDto) {
    const client = this.supabaseService.getClient();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let builder = client
      .from('MonthlyClosing')
      .select('*', { count: 'exact' })
      .eq('IsActive', 1)
      .range(from, to)
      .order('Id', { ascending: false });

    if (query.classCode) builder = builder.eq('ClassCode', query.classCode);
    if (query.billingMonth) builder = builder.eq('BillingMonth', query.billingMonth);
    if (query.status) builder = builder.eq('Status', query.status);

    const { data, count, error } = await builder;
    if (error) {
      this.logger.error(`findAll monthly closings failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch monthly closings');
    }

    return { data: data ?? [], total: count ?? 0, page, limit };
  }

  async findByCode(code: string) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('MonthlyClosing')
      .select('*')
      .eq('Code', code)
      .eq('IsActive', 1)
      .maybeSingle();

    if (error) {
      this.logger.error(`findByCode(${code}) failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch monthly closing');
    }
    if (!data) throw new NotFoundException(`Monthly closing with Code ${code} not found`);
    return data;
  }

  async createOrUpdateDraft(classCode: string, billingMonth: string) {
    const client = this.supabaseService.getClient();

    // Get class and teacher profile
    const classData = await this.classesService.findByCode(classCode);
    const studentCount = await this.classesService.getStudentCount(classCode);

    // Get invoices for the class/month
    const invoicesResult = await this.invoicesService.findAll({
      classCode,
      billingMonth,
      limit: 1000,
    });
    const invoices = invoicesResult.data;

    const expectedRevenue = studentCount * classData.FeeAmount;
    const collectedRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.PaidAmount || 0), 0);
    const outstandingDebt = invoices.reduce((sum: number, inv: any) => sum + (inv.RemainingAmount || 0), 0);

    const studentsReport = invoices.map((inv: any) => ({
      studentCode: inv.StudentCode,
      invoiceCode: inv.Code,
      totalAmount: inv.TotalAmount,
      paidAmount: inv.PaidAmount,
      remainingAmount: inv.RemainingAmount,
      status: inv.Status,
    }));

    const reportJson = JSON.stringify({
      classCode,
      className: classData.Name,
      billingMonth,
      totalStudents: studentCount,
      expectedRevenue,
      collectedRevenue,
      outstandingDebt,
      students: studentsReport,
      generatedAt: new Date().toISOString(),
    });

    // Check if closing record already exists
    const { data: existing, error: findError } = await client
      .from('MonthlyClosing')
      .select('*')
      .eq('ClassCode', classCode)
      .eq('BillingMonth', billingMonth)
      .eq('IsActive', 1)
      .maybeSingle();

    if (findError) {
      this.logger.error(`Find existing monthly closing error: ${findError.message}`);
      throw new InternalServerErrorException('Failed to verify existing monthly closing');
    }

    if (existing) {
      if (existing.Status === 'finalized') {
        throw new BadRequestException('Cannot modify a finalized monthly closing');
      }

      const { data, error } = await client
        .from('MonthlyClosing')
        .update({
          Name: `Chốt tháng ${billingMonth} - ${classData.Name}`,
          TotalStudents: studentCount,
          ExpectedRevenue: expectedRevenue,
          CollectedRevenue: collectedRevenue,
          OutstandingDebt: outstandingDebt,
          ReportJson: reportJson,
          ModifiedAt: new Date().toISOString(),
        })
        .eq('Id', existing.Id)
        .select()
        .single();

      if (error) {
        this.logger.error(`Update monthly closing failed: ${error.message}`);
        throw new InternalServerErrorException('Failed to update monthly closing');
      }

      await this.auditService.log({
        TeacherCode: classData.TeacherCode,
        EntityType: 'MonthlyClosing',
        EntityCode: existing.Code,
        Action: 'UPDATE_DRAFT',
        NewValue: JSON.stringify(data),
        ActorType: 'system',
      });

      return data;
    }

    // Create new monthly closing
    const { data: maxRow } = await client
      .from('MonthlyClosing')
      .select('Code')
      .like('Code', 'MCL%')
      .order('Id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const code = CodeGenerator.generate('MCL', maxRow?.Code ?? null);

    const { data, error } = await client
      .from('MonthlyClosing')
      .insert({
        Name: `Chốt tháng ${billingMonth} - ${classData.Name}`,
        Code: code,
        Description: `Báo cáo chốt sổ lớp ${classData.Name} tháng ${billingMonth}`,
        ClassCode: classCode,
        TeacherCode: classData.TeacherCode,
        BillingMonth: billingMonth,
        TotalStudents: studentCount,
        ExpectedRevenue: expectedRevenue,
        CollectedRevenue: collectedRevenue,
        OutstandingDebt: outstandingDebt,
        Status: 'draft',
        ReportJson: reportJson,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Insert monthly closing failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to create monthly closing draft');
    }

    await this.auditService.log({
      TeacherCode: classData.TeacherCode,
      EntityType: 'MonthlyClosing',
      EntityCode: code,
      Action: 'CREATE_DRAFT',
      NewValue: JSON.stringify(data),
      ActorType: 'system',
    });

    return data;
  }

  async finalize(code: string) {
    const existing = await this.findByCode(code);
    if (existing.Status === 'finalized') {
      return existing;
    }

    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('MonthlyClosing')
      .update({
        Status: 'finalized',
        ModifiedAt: new Date().toISOString(),
      })
      .eq('Code', code)
      .select()
      .single();

    if (error) {
      this.logger.error(`Finalize monthly closing ${code} failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to finalize monthly closing');
    }

    await this.auditService.log({
      TeacherCode: existing.TeacherCode,
      EntityType: 'MonthlyClosing',
      EntityCode: code,
      Action: 'FINALIZE',
      OldValue: JSON.stringify({ Status: existing.Status }),
      NewValue: JSON.stringify({ Status: 'finalized' }),
      ActorType: 'system',
    });

    return data;
  }

  async reopen(code: string) {
    const existing = await this.findByCode(code);
    if (existing.Status === 'draft') {
      return existing;
    }

    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('MonthlyClosing')
      .update({
        Status: 'draft',
        ModifiedAt: new Date().toISOString(),
      })
      .eq('Code', code)
      .select()
      .single();

    if (error) {
      this.logger.error(`Reopen monthly closing ${code} failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to reopen monthly closing');
    }

    await this.auditService.log({
      TeacherCode: existing.TeacherCode,
      EntityType: 'MonthlyClosing',
      EntityCode: code,
      Action: 'REOPEN',
      OldValue: JSON.stringify({ Status: existing.Status }),
      NewValue: JSON.stringify({ Status: 'draft' }),
      ActorType: 'system',
    });

    return data;
  }
}
