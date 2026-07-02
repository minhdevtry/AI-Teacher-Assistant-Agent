import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../../integrations/supabase/supabase.service';
import { ClassesService } from '../classes/classes.service';
import { InvoicesService } from '../invoices/invoices.service';
import { MonthlyClosingService } from '../monthly-closing/monthly-closing.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly classesService: ClassesService,
    private readonly invoicesService: InvoicesService,
    private readonly monthlyClosingService: MonthlyClosingService,
  ) {}

  private getCurrentMonth(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private getPreviousMonth(monthStr: string): string {
    const [year, month] = monthStr.split('-').map(Number);
    const d = new Date(year, month - 2, 1);
    const prevYear = d.getFullYear();
    const prevMonth = String(d.getMonth() + 1).padStart(2, '0');
    return `${prevYear}-${prevMonth}`;
  }

  async getDashboardSummary(month?: string) {
    const activeMonth = month || this.getCurrentMonth();
    const client = this.supabaseService.getClient();

    // 1. Get active classes and total students count
    const classesResult = await this.classesService.findAll({ status: 'active', limit: 1000 });
    const activeClasses = classesResult.data;
    const totalClasses = classesResult.total;

    const { count: totalStudents, error: studentErr } = await client
      .from('User')
      .select('*', { count: 'exact', head: true })
      .eq('Role', 'student')
      .eq('IsActive', 1);

    if (studentErr) {
      this.logger.error(`Failed to count students: ${studentErr.message}`);
      throw new InternalServerErrorException('Failed to count students');
    }

    // 2. Compute financial summary for target month
    let expectedRevenue = 0;
    let collectedRevenue = 0;
    let outstandingDebt = 0;

    const current = this.getCurrentMonth();
    if (activeMonth === current) {
      // Calculate on-the-fly for current month
      const { data: invoices, error: invError } = await client
        .from('Invoice')
        .select('TotalAmount, PaidAmount, RemainingAmount')
        .eq('BillingMonth', activeMonth)
        .eq('IsActive', 1);

      if (invError) {
        this.logger.error(`Failed to calculate current month invoices: ${invError.message}`);
        throw new InternalServerErrorException('Failed to calculate current month invoices');
      }

      (invoices || []).forEach(inv => {
        expectedRevenue += inv.TotalAmount;
        collectedRevenue += inv.PaidAmount;
        outstandingDebt += inv.RemainingAmount;
      });
    } else {
      // Read historical snapshot from MonthlyClosing table
      const { data: closings, error: closeError } = await client
        .from('MonthlyClosing')
        .select('ClassCode, ExpectedRevenue, CollectedRevenue, OutstandingDebt')
        .eq('BillingMonth', activeMonth)
        .eq('Status', 'finalized')
        .eq('IsActive', 1);

      if (closeError) {
        this.logger.error(`Failed to query historical monthly closing: ${closeError.message}`);
        throw new InternalServerErrorException('Failed to query historical monthly closing');
      }

      const finalizedMap = new Map<string, any>();
      (closings || []).forEach(close => {
        finalizedMap.set(close.ClassCode, close);
      });

      for (const cls of activeClasses) {
        const close = finalizedMap.get(cls.Code);
        if (close) {
          expectedRevenue += close.ExpectedRevenue || 0;
          collectedRevenue += close.CollectedRevenue || 0;
          outstandingDebt += close.OutstandingDebt || 0;
        } else {
          const { data: invoices, error: invError } = await client
            .from('Invoice')
            .select('TotalAmount, PaidAmount, RemainingAmount')
            .eq('ClassCode', cls.Code)
            .eq('BillingMonth', activeMonth)
            .eq('IsActive', 1);

          if (invError) {
            this.logger.error(`Failed to calculate invoices for class ${cls.Code} in month ${activeMonth}: ${invError.message}`);
            throw new InternalServerErrorException(`Failed to calculate invoices for class ${cls.Code}`);
          }

          (invoices || []).forEach(inv => {
            expectedRevenue += inv.TotalAmount || 0;
            collectedRevenue += inv.PaidAmount || 0;
            outstandingDebt += inv.RemainingAmount || 0;
          });
        }
      }
    }

    const collectionRate = expectedRevenue > 0
      ? Math.round((collectedRevenue / expectedRevenue) * 1000) / 10
      : 0;

    // 3. Compute growth comparison with previous month
    const prevMonth = this.getPreviousMonth(activeMonth);
    let prevExpected = 0;
    let prevCollected = 0;
    let prevDebt = 0;

    const { data: prevClosings, error: prevCloseErr } = await client
      .from('MonthlyClosing')
      .select('ClassCode, ExpectedRevenue, CollectedRevenue, OutstandingDebt')
      .eq('BillingMonth', prevMonth)
      .eq('Status', 'finalized')
      .eq('IsActive', 1);

    if (prevCloseErr) {
      this.logger.error(`Failed to query previous month closings: ${prevCloseErr.message}`);
      throw new InternalServerErrorException('Failed to query previous month closings');
    }

    const prevFinalizedMap = new Map<string, any>();
    (prevClosings || []).forEach(close => {
      prevFinalizedMap.set(close.ClassCode, close);
    });

    for (const cls of activeClasses) {
      const close = prevFinalizedMap.get(cls.Code);
      if (close) {
        prevExpected += close.ExpectedRevenue || 0;
        prevCollected += close.CollectedRevenue || 0;
        prevDebt += close.OutstandingDebt || 0;
      } else {
        const { data: invoices, error: invError } = await client
          .from('Invoice')
          .select('TotalAmount, PaidAmount, RemainingAmount')
          .eq('ClassCode', cls.Code)
          .eq('BillingMonth', prevMonth)
          .eq('IsActive', 1);

        if (invError) {
          this.logger.error(`Failed to calculate invoices for class ${cls.Code} in month ${prevMonth}: ${invError.message}`);
          throw new InternalServerErrorException(`Failed to calculate invoices for class ${cls.Code}`);
        }

        (invoices || []).forEach(inv => {
          prevExpected += inv.TotalAmount || 0;
          prevCollected += inv.PaidAmount || 0;
          prevDebt += inv.RemainingAmount || 0;
        });
      }
    }

    const calcGrowth = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };

    return {
      billingMonth: activeMonth,
      totalClasses,
      totalStudents: totalStudents ?? 0,
      expectedRevenue,
      collectedRevenue,
      outstandingDebt,
      collectionRate,
      comparison: {
        expectedChangeRate: calcGrowth(expectedRevenue, prevExpected),
        collectedChangeRate: calcGrowth(collectedRevenue, prevCollected),
        debtChangeRate: calcGrowth(outstandingDebt, prevDebt),
      },
    };
  }

  async getClassFinancials(month?: string) {
    const targetMonth = month || this.getCurrentMonth();
    const client = this.supabaseService.getClient();

    // Get all active classes
    const { data: classes, error: classError } = await client
      .from('Class')
      .select('*')
      .eq('IsActive', 1);

    if (classError) {
      this.logger.error(`Failed to fetch classes: ${classError.message}`);
      throw new InternalServerErrorException('Failed to fetch classes');
    }

    // Batch fetch active students to count them in-memory
    const { data: students, error: studentError } = await client
      .from('User')
      .select('ClassCode')
      .eq('Role', 'student')
      .eq('IsActive', 1);

    if (studentError) {
      this.logger.error(`Failed to fetch students for class financials: ${studentError.message}`);
      throw new InternalServerErrorException('Failed to fetch students for class financials');
    }

    const studentCountMap = new Map<string, number>();
    for (const student of students || []) {
      if (student.ClassCode) {
        studentCountMap.set(student.ClassCode, (studentCountMap.get(student.ClassCode) || 0) + 1);
      }
    }

    // Batch fetch monthly closings for target month
    const { data: closings, error: closingError } = await client
      .from('MonthlyClosing')
      .select('*')
      .eq('BillingMonth', targetMonth)
      .eq('IsActive', 1);

    if (closingError) {
      this.logger.error(`Failed to fetch monthly closings: ${closingError.message}`);
      throw new InternalServerErrorException('Failed to fetch monthly closings');
    }

    const closingsMap = new Map<string, any>();
    for (const closing of closings || []) {
      closingsMap.set(closing.ClassCode, closing);
    }

    // Batch fetch invoices for target month
    const { data: invoices, error: invoiceError } = await client
      .from('Invoice')
      .select('ClassCode, TotalAmount, PaidAmount, RemainingAmount')
      .eq('BillingMonth', targetMonth)
      .eq('IsActive', 1);

    if (invoiceError) {
      this.logger.error(`Failed to fetch invoices for class financials: ${invoiceError.message}`);
      throw new InternalServerErrorException('Failed to fetch invoices for class financials');
    }

    const invoicesMap = new Map<string, any[]>();
    for (const inv of invoices || []) {
      if (!invoicesMap.has(inv.ClassCode)) {
        invoicesMap.set(inv.ClassCode, []);
      }
      invoicesMap.get(inv.ClassCode)!.push(inv);
    }

    const financials = [];

    for (const cls of classes) {
      const studentCount = studentCountMap.get(cls.Code) || 0;
      const closing = closingsMap.get(cls.Code);

      if (closing && closing.Status === 'finalized') {
        financials.push({
          classCode: cls.Code,
          className: cls.Name,
          subject: cls.Subject,
          totalStudents: closing.TotalStudents,
          expectedRevenue: closing.ExpectedRevenue,
          collectedRevenue: closing.CollectedRevenue,
          outstandingDebt: closing.OutstandingDebt,
          collectionRate: closing.ExpectedRevenue > 0
            ? Math.round((closing.CollectedRevenue / closing.ExpectedRevenue) * 1000) / 10
            : 0,
          status: 'closed',
        });
      } else {
        const clsInvoices = invoicesMap.get(cls.Code) || [];
        let expected = studentCount * cls.FeeAmount;
        let collected = 0;
        let debt = 0;

        clsInvoices.forEach(inv => {
          collected += inv.PaidAmount;
          debt += inv.RemainingAmount;
        });

        financials.push({
          classCode: cls.Code,
          className: cls.Name,
          subject: cls.Subject,
          totalStudents: studentCount,
          expectedRevenue: expected,
          collectedRevenue: collected,
          outstandingDebt: debt,
          collectionRate: expected > 0 ? Math.round((collected / expected) * 1000) / 10 : 0,
          status: closing ? 'draft' : 'unclosed',
        });
      }
    }

    return financials;
  }

  async getRevenueTrends(limit = 6) {
    const client = this.supabaseService.getClient();
    const current = this.getCurrentMonth();
    const trends = [];

    // Generate list of billing months
    const months: string[] = [];
    const [currYear, currMonth] = current.split('-').map(Number);

    for (let i = limit - 1; i >= 0; i--) {
      const d = new Date(currYear, currMonth - 1 - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${y}-${m}`);
    }

    // Query all finalized monthly closings for the requested months in a single query
    const { data: closings, error: closingError } = await client
      .from('MonthlyClosing')
      .select('BillingMonth, ExpectedRevenue, CollectedRevenue')
      .in('BillingMonth', months)
      .eq('Status', 'finalized')
      .eq('IsActive', 1);

    if (closingError) {
      this.logger.error(`Failed to fetch monthly closings for revenue trends: ${closingError.message}`);
      throw new InternalServerErrorException('Failed to fetch monthly closings for revenue trends');
    }

    // Query all active invoices for the requested months in a single query
    const { data: invoices, error: invoiceError } = await client
      .from('Invoice')
      .select('BillingMonth, TotalAmount, PaidAmount')
      .in('BillingMonth', months)
      .eq('IsActive', 1);

    if (invoiceError) {
      this.logger.error(`Failed to fetch invoices for revenue trends: ${invoiceError.message}`);
      throw new InternalServerErrorException('Failed to fetch invoices for revenue trends');
    }

    // Aggregate in memory
    const closingMap = new Map<string, { expected: number; collected: number }[]>();
    (closings || []).forEach(c => {
      if (!closingMap.has(c.BillingMonth)) {
        closingMap.set(c.BillingMonth, []);
      }
      closingMap.get(c.BillingMonth)!.push({ expected: c.ExpectedRevenue, collected: c.CollectedRevenue });
    });

    const invoiceMap = new Map<string, { expected: number; collected: number }[]>();
    (invoices || []).forEach(inv => {
      if (!invoiceMap.has(inv.BillingMonth)) {
        invoiceMap.set(inv.BillingMonth, []);
      }
      invoiceMap.get(inv.BillingMonth)!.push({ expected: inv.TotalAmount, collected: inv.PaidAmount });
    });

    for (const m of months) {
      let expected = 0;
      let collected = 0;

      const monthClosings = closingMap.get(m);
      if (monthClosings && monthClosings.length > 0) {
        monthClosings.forEach(c => {
          expected += c.expected;
          collected += c.collected;
        });
      } else {
        const monthInvoices = invoiceMap.get(m);
        (monthInvoices || []).forEach(inv => {
          expected += inv.expected;
          collected += inv.collected;
        });
      }

      trends.push({
        billingMonth: m,
        expectedRevenue: expected,
        collectedRevenue: collected,
        collectionRate: expected > 0 ? Math.round((collected / expected) * 1000) / 10 : 0,
      });
    }

    return trends;
  }

  async getDebtors() {
    const client = this.supabaseService.getClient();

    // Query unpaid/partial invoices
    const { data: invoices, error } = await client
      .from('Invoice')
      .select('*')
      .eq('IsActive', 1)
      .in('Status', ['unpaid', 'partial'])
      .order('RemainingAmount', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch overdue invoices: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch overdue invoices');
    }

    const studentCodes = Array.from(new Set(invoices.map(inv => inv.StudentCode).filter(Boolean)));
    const classCodes = Array.from(new Set(invoices.map(inv => inv.ClassCode).filter(Boolean)));

    let students: any[] = [];
    if (studentCodes.length > 0) {
      const { data, error: err } = await client
        .from('User')
        .select('Code, Name, Nickname, Phone')
        .in('Code', studentCodes)
        .eq('IsActive', 1);
      if (err) {
        this.logger.error(`Failed to fetch students for debtors: ${err.message}`);
        throw new InternalServerErrorException('Failed to fetch students for debtors');
      }
      students = data || [];
    }

    let classes: any[] = [];
    if (classCodes.length > 0) {
      const { data, error: err } = await client
        .from('Class')
        .select('Code, Name')
        .in('Code', classCodes)
        .eq('IsActive', 1);
      if (err) {
        this.logger.error(`Failed to fetch classes for debtors: ${err.message}`);
        throw new InternalServerErrorException('Failed to fetch classes for debtors');
      }
      classes = data || [];
    }

    const studentsMap = new Map<string, any>();
    for (const s of students) {
      studentsMap.set(s.Code, s);
    }

    const classesMap = new Map<string, any>();
    for (const c of classes) {
      classesMap.set(c.Code, c);
    }

    const debtors = invoices.map(inv => {
      const student = studentsMap.get(inv.StudentCode);
      const classData = classesMap.get(inv.ClassCode);
      return {
        studentCode: inv.StudentCode,
        studentName: student?.Name || 'Không rõ',
        nickname: student?.Nickname || '',
        phone: student?.Phone || '',
        classCode: inv.ClassCode,
        className: classData?.Name || 'Không rõ',
        invoiceCode: inv.Code,
        billingMonth: inv.BillingMonth,
        totalAmount: inv.TotalAmount,
        remainingAmount: inv.RemainingAmount,
        dueDate: inv.DueDate,
      };
    });

    return debtors;
  }

  async getClassDetailReport(classCode: string, month: string) {
    const client = this.supabaseService.getClient();

    const classData = await this.classesService.findByCode(classCode);
    const studentCount = await this.classesService.getStudentCount(classCode);

    // Check if closing history exists
    const { data: closing, error: closingErr } = await client
      .from('MonthlyClosing')
      .select('ReportJson, Status')
      .eq('ClassCode', classCode)
      .eq('BillingMonth', month)
      .eq('IsActive', 1)
      .maybeSingle();

    if (closingErr) {
      this.logger.error(`Failed to fetch monthly closing for class report: ${closingErr.message}`);
      throw new InternalServerErrorException('Failed to fetch monthly closing for class report');
    }

    if (closing && closing.Status === 'finalized' && closing.ReportJson) {
      const report = JSON.parse(closing.ReportJson);
      return {
        ...report,
        status: 'closed',
      };
    }

    // Dynamic calculation
    const invoicesResult = await this.invoicesService.findAll({
      classCode,
      billingMonth: month,
      limit: 1000,
    });

    const invoices = invoicesResult.data;
    const expectedRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.TotalAmount || 0), 0);
    const collectedRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.PaidAmount || 0), 0);
    const outstandingDebt = invoices.reduce((sum: number, inv: any) => sum + (inv.RemainingAmount || 0), 0);

    const studentCodes = Array.from(new Set(invoices.map((inv: any) => inv.StudentCode).filter(Boolean)));
    let students: any[] = [];
    if (studentCodes.length > 0) {
      const { data, error: err } = await client
        .from('User')
        .select('Code, Name, Nickname')
        .in('Code', studentCodes)
        .eq('IsActive', 1);
      if (err) {
        this.logger.error(`Failed to fetch students for class report: ${err.message}`);
        throw new InternalServerErrorException('Failed to fetch students for class report');
      }
      students = data || [];
    }

    const studentsMap = new Map<string, any>();
    for (const s of students) {
      studentsMap.set(s.Code, s);
    }

    const studentsBreakdown = invoices.map((inv: any) => {
      const student = studentsMap.get(inv.StudentCode);
      return {
        studentCode: inv.StudentCode,
        studentName: student?.Name || 'Không rõ',
        nickname: student?.Nickname || '',
        invoiceCode: inv.Code,
        totalAmount: inv.TotalAmount,
        paidAmount: inv.PaidAmount,
        remainingAmount: inv.RemainingAmount,
        status: inv.Status,
      };
    });

    return {
      classCode,
      className: classData.Name,
      billingMonth: month,
      totalStudents: studentCount,
      expectedRevenue,
      collectedRevenue,
      outstandingDebt,
      students: studentsBreakdown,
      status: closing ? 'draft' : 'unclosed',
    };
  }
}
