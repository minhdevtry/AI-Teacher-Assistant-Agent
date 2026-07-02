import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { SupabaseService } from '../../integrations/supabase/supabase.service';
import { ClassesService } from '../classes/classes.service';
import { InvoicesService } from '../invoices/invoices.service';
import { MonthlyClosingService } from '../monthly-closing/monthly-closing.service';
import { InternalServerErrorException, NotFoundException } from '@nestjs/common';

describe('ReportsService', () => {
  let service: ReportsService;
  let supabaseService: jest.Mocked<SupabaseService>;
  let classesService: jest.Mocked<ClassesService>;
  let invoicesService: jest.Mocked<InvoicesService>;
  let monthlyClosingService: jest.Mocked<MonthlyClosingService>;
  let mockClient: { from: jest.Mock };

  class MockBuilder {
    constructor(
      private readonly data: any = null,
      private readonly error: any = null,
      private readonly count: number = 0,
    ) {}

    from = jest.fn().mockReturnThis();
    select = jest.fn().mockReturnThis();
    eq = jest.fn().mockReturnThis();
    in = jest.fn().mockReturnThis();
    order = jest.fn().mockReturnThis();
    maybeSingle = jest.fn().mockImplementation(() => Promise.resolve({ data: this.data, error: this.error }));

    then(onfulfilled: any) {
      return Promise.resolve({ data: this.data, count: this.count, error: this.error }).then(onfulfilled);
    }
  }

  beforeEach(async () => {
    mockClient = {
      from: jest.fn(),
    };

    const mockSupabaseService = {
      getClient: jest.fn().mockReturnValue(mockClient),
    };

    const mockClassesService = {
      findAll: jest.fn(),
      findByCode: jest.fn(),
      getStudentCount: jest.fn(),
    };

    const mockInvoicesService = {
      findAll: jest.fn(),
    };

    const mockMonthlyClosingService = {
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: ClassesService, useValue: mockClassesService },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: MonthlyClosingService, useValue: mockMonthlyClosingService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    supabaseService = module.get(SupabaseService);
    classesService = module.get(ClassesService);
    invoicesService = module.get(InvoicesService);
    monthlyClosingService = module.get(MonthlyClosingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboardSummary', () => {
    it('should calculate live current month values correctly', async () => {
      // Mock getCurrentMonth
      jest.spyOn(service as any, 'getCurrentMonth').mockReturnValue('2026-07');
      jest.spyOn(service as any, 'getPreviousMonth').mockReturnValue('2026-06');

      classesService.findAll.mockResolvedValue({ data: [], total: 5 } as any);

      // We have two calls to mockClient.from
      // First call: count total students
      const studentBuilder = new MockBuilder(null, null, 15);
      // Second call: get current month invoices
      const invoiceBuilder = new MockBuilder([
        { TotalAmount: 1000, PaidAmount: 700, RemainingAmount: 300 },
        { TotalAmount: 2000, PaidAmount: 1500, RemainingAmount: 500 },
      ]);
      // Third call: get previous month closings (to compare)
      const prevClosingBuilder = new MockBuilder([
        { ExpectedRevenue: 2500, CollectedRevenue: 2000, OutstandingDebt: 500 },
      ]);

      mockClient.from.mockImplementation((table: string) => {
        if (table === 'User') return studentBuilder;
        if (table === 'Invoice') return invoiceBuilder;
        if (table === 'MonthlyClosing') return prevClosingBuilder;
        return new MockBuilder();
      });

      const summary = await service.getDashboardSummary('2026-07');

      expect(summary).toEqual({
        billingMonth: '2026-07',
        totalClasses: 5,
        totalStudents: 15,
        expectedRevenue: 3000,
        collectedRevenue: 2200,
        outstandingDebt: 800,
        collectionRate: 73.3,
        comparison: {
          expectedChangeRate: 20,
          collectedChangeRate: 10,
          debtChangeRate: 60,
        },
      });
    });

    it('should read historical monthly closing if target month is historical and has final closing', async () => {
      jest.spyOn(service as any, 'getCurrentMonth').mockReturnValue('2026-07');
      jest.spyOn(service as any, 'getPreviousMonth').mockReturnValue('2026-05');

      classesService.findAll.mockResolvedValue({ data: [], total: 3 } as any);

      const studentBuilder = new MockBuilder(null, null, 10);
      const targetClosingBuilder = new MockBuilder([
        { ExpectedRevenue: 4000, CollectedRevenue: 3500, OutstandingDebt: 500 },
      ]);
      const prevClosingBuilder = new MockBuilder([]);
      const prevInvoiceBuilder = new MockBuilder([
        { TotalAmount: 3000, PaidAmount: 3000, RemainingAmount: 0 },
      ]);

      mockClient.from.mockImplementation((table: string) => {
        if (table === 'User') return studentBuilder;
        if (table === 'MonthlyClosing') {
          // If we verify the queries by parameter or call order:
          // The first calls on MonthlyClosing query the targetMonth '2026-06'
          // The second calls query the prevMonth '2026-05'
          return targetClosingBuilder;
        }
        if (table === 'Invoice') {
          return prevInvoiceBuilder;
        }
        return new MockBuilder();
      });

      const summary = await service.getDashboardSummary('2026-06');
      expect(summary.expectedRevenue).toBe(4000);
      expect(summary.collectedRevenue).toBe(3500);
      expect(summary.outstandingDebt).toBe(500);
    });

    it('should throw InternalServerErrorException on user counting failure', async () => {
      classesService.findAll.mockResolvedValue({ data: [], total: 5 } as any);
      mockClient.from.mockReturnValue(new MockBuilder(null, { message: 'DB Error' }));

      await expect(service.getDashboardSummary()).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('getClassFinancials', () => {
    it('should calculate class financials matching finalized closing or falling back to live calculation', async () => {
      jest.spyOn(service as any, 'getCurrentMonth').mockReturnValue('2026-07');

      const mockClasses = [
        { Code: 'CLS001', Name: 'Math Class', Subject: 'Math', FeeAmount: 500000, IsActive: 1 },
        { Code: 'CLS002', Name: 'English Class', Subject: 'English', FeeAmount: 400000, IsActive: 1 },
      ];

      const classBuilder = new MockBuilder(mockClasses);
      const studentBuilder = new MockBuilder([
        { ClassCode: 'CLS002' },
        { ClassCode: 'CLS002' },
      ]);
      const closingBuilder = new MockBuilder([
        {
          ClassCode: 'CLS001',
          Status: 'finalized',
          TotalStudents: 10,
          ExpectedRevenue: 5000000,
          CollectedRevenue: 4500000,
          OutstandingDebt: 500000,
        }
      ]);
      const invoiceBuilder = new MockBuilder([
        { ClassCode: 'CLS002', TotalAmount: 400000, PaidAmount: 200000, RemainingAmount: 200000 },
      ]);

      mockClient.from.mockImplementation((table: string) => {
        if (table === 'Class') return classBuilder;
        if (table === 'User') return studentBuilder;
        if (table === 'MonthlyClosing') return closingBuilder;
        if (table === 'Invoice') return invoiceBuilder;
        return new MockBuilder();
      });

      const financials = await service.getClassFinancials('2026-07');
      expect(financials).toHaveLength(2);
      expect(financials[0]).toEqual({
        classCode: 'CLS001',
        className: 'Math Class',
        subject: 'Math',
        totalStudents: 10,
        expectedRevenue: 5000000,
        collectedRevenue: 4500000,
        outstandingDebt: 500000,
        collectionRate: 90,
        status: 'closed',
      });
      expect(financials[1]).toEqual({
        classCode: 'CLS002',
        className: 'English Class',
        subject: 'English',
        totalStudents: 2,
        expectedRevenue: 800000,
        collectedRevenue: 200000,
        outstandingDebt: 200000,
        collectionRate: 25,
        status: 'unclosed',
      });
    });
  });

  describe('getRevenueTrends', () => {
    it('should return recent revenue trends', async () => {
      jest.spyOn(service as any, 'getCurrentMonth').mockReturnValue('2026-07');

      mockClient.from.mockImplementation((table: string) => {
        if (table === 'MonthlyClosing') {
          return new MockBuilder([
            { BillingMonth: '2026-06', ExpectedRevenue: 1000, CollectedRevenue: 800 }
          ]);
        }
        if (table === 'Invoice') {
          return new MockBuilder([
            { BillingMonth: '2026-07', TotalAmount: 500, PaidAmount: 300 }
          ]);
        }
        return new MockBuilder();
      });

      const trends = await service.getRevenueTrends(3);
      expect(trends).toHaveLength(3);
      expect(trends[0].billingMonth).toBe('2026-05');
      expect(trends[1].billingMonth).toBe('2026-06');
      expect(trends[1].expectedRevenue).toBe(1000);
      expect(trends[1].collectedRevenue).toBe(800);
      expect(trends[2].billingMonth).toBe('2026-07');
      expect(trends[2].expectedRevenue).toBe(500);
      expect(trends[2].collectedRevenue).toBe(300);
    });
  });

  describe('getDebtors', () => {
    it('should list all debtors with overdue/partial invoices', async () => {
      const invoices = [
        { Code: 'INV001', StudentCode: 'STD001', ClassCode: 'CLS001', BillingMonth: '2026-07', TotalAmount: 500, RemainingAmount: 300, DueDate: '2026-07-15' },
      ];

      const invoiceBuilder = new MockBuilder(invoices);
      const studentBuilder = new MockBuilder([{ Code: 'STD001', Name: 'Student A', Nickname: 'A', Phone: '123' }]);
      const classBuilder = new MockBuilder([{ Code: 'CLS001', Name: 'Class A' }]);

      mockClient.from.mockImplementation((table: string) => {
        if (table === 'Invoice') return invoiceBuilder;
        if (table === 'User') return studentBuilder;
        if (table === 'Class') return classBuilder;
        return new MockBuilder();
      });

      const debtors = await service.getDebtors();
      expect(debtors).toHaveLength(1);
      expect(debtors[0]).toEqual({
        studentCode: 'STD001',
        studentName: 'Student A',
        nickname: 'A',
        phone: '123',
        classCode: 'CLS001',
        className: 'Class A',
        invoiceCode: 'INV001',
        billingMonth: '2026-07',
        totalAmount: 500,
        remainingAmount: 300,
        dueDate: '2026-07-15',
      });
    });
  });

  describe('getClassDetailReport', () => {
    it('should return closed report if monthly closing is finalized', async () => {
      classesService.findByCode.mockResolvedValue({ Name: 'Math Class', FeeAmount: 500 } as any);
      classesService.getStudentCount.mockResolvedValue(5);

      const closingData = {
        Status: 'finalized',
        ReportJson: JSON.stringify({
          classCode: 'CLS001',
          className: 'Math Class',
          billingMonth: '2026-06',
          totalStudents: 5,
          expectedRevenue: 2500,
          collectedRevenue: 2000,
          outstandingDebt: 500,
          students: [],
        }),
      };

      const closingBuilder = new MockBuilder(closingData);
      mockClient.from.mockReturnValue(closingBuilder);

      const report = await service.getClassDetailReport('CLS001', '2026-06');
      expect(report.status).toBe('closed');
      expect(report.expectedRevenue).toBe(2500);
    });

    it('should dynamically calculate report if not finalized', async () => {
      classesService.findByCode.mockResolvedValue({ Name: 'Math Class', FeeAmount: 500 } as any);
      classesService.getStudentCount.mockResolvedValue(2);

      const closingBuilder = new MockBuilder(null);
      mockClient.from.mockImplementation((table: string) => {
        if (table === 'MonthlyClosing') return closingBuilder;
        if (table === 'User') return new MockBuilder([{ Code: 'STD001', Name: 'Student X', Nickname: 'X' }, { Code: 'STD002', Name: 'Student X', Nickname: 'X' }]);
        return new MockBuilder();
      });

      invoicesService.findAll.mockResolvedValue({
        data: [
          { Code: 'INV001', StudentCode: 'STD001', TotalAmount: 500, PaidAmount: 400, RemainingAmount: 100, Status: 'partial' },
          { Code: 'INV002', StudentCode: 'STD002', TotalAmount: 500, PaidAmount: 500, RemainingAmount: 0, Status: 'paid' },
        ],
      } as any);

      const report = await service.getClassDetailReport('CLS001', '2026-06');
      expect(report.status).toBe('unclosed');
      expect(report.expectedRevenue).toBe(1000);
      expect(report.collectedRevenue).toBe(900);
      expect(report.outstandingDebt).toBe(100);
      expect(report.students).toHaveLength(2);
    });
  });
});
