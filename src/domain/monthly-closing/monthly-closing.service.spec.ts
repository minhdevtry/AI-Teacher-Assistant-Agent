import { Test, TestingModule } from '@nestjs/testing';
import { MonthlyClosingService } from './monthly-closing.service';
import { SupabaseService } from '../../integrations/supabase/supabase.service';
import { AuditService } from '../common/audit.service';
import { ClassesService } from '../classes/classes.service';
import { InvoicesService } from '../invoices/invoices.service';
import { NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';

describe('MonthlyClosingService', () => {
  let service: MonthlyClosingService;
  let supabaseService: jest.Mocked<SupabaseService>;
  let auditService: jest.Mocked<AuditService>;
  let classesService: jest.Mocked<ClassesService>;
  let invoicesService: jest.Mocked<InvoicesService>;
  let mockClient: { from: jest.Mock };

  // A helper class to mock Supabase client's chained methods
  class MockBuilder {
    constructor(
      private readonly data: any = null,
      private readonly error: any = null,
      private readonly count: number = 0,
    ) {}

    from = jest.fn().mockReturnThis();
    select = jest.fn().mockReturnThis();
    eq = jest.fn().mockReturnThis();
    range = jest.fn().mockReturnThis();
    order = jest.fn().mockReturnThis();
    like = jest.fn().mockReturnThis();
    limit = jest.fn().mockReturnThis();
    update = jest.fn().mockReturnThis();
    insert = jest.fn().mockReturnThis();
    single = jest.fn().mockImplementation(() => Promise.resolve({ data: this.data, error: this.error }));
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

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const mockClassesService = {
      findByCode: jest.fn(),
      getStudentCount: jest.fn(),
    };

    const mockInvoicesService = {
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonthlyClosingService,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: ClassesService, useValue: mockClassesService },
        { provide: InvoicesService, useValue: mockInvoicesService },
      ],
    }).compile();

    service = module.get<MonthlyClosingService>(MonthlyClosingService);
    supabaseService = module.get(SupabaseService);
    auditService = module.get(AuditService);
    classesService = module.get(ClassesService);
    invoicesService = module.get(InvoicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated monthly closings', async () => {
      const mockData = [{ Id: 1, Code: 'MCL001', ClassCode: 'CLS001', BillingMonth: '2026-07' }];
      const builder = new MockBuilder(mockData, null, 1);
      mockClient.from.mockReturnValue(builder);

      const result = await service.findAll({ classCode: 'CLS001', page: 1, limit: 10 });

      expect(result).toEqual({
        data: mockData,
        total: 1,
        page: 1,
        limit: 10,
      });
      expect(builder.from).not.toHaveBeenCalled(); // since we mocked from directly on client
      expect(mockClient.from).toHaveBeenCalledWith('MonthlyClosing');
      expect(builder.eq).toHaveBeenCalledWith('ClassCode', 'CLS001');
    });

    it('should throw InternalServerErrorException on Supabase error', async () => {
      const builder = new MockBuilder(null, { message: 'DB error' });
      mockClient.from.mockReturnValue(builder);

      await expect(service.findAll({})).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('findByCode', () => {
    it('should return a record if it exists', async () => {
      const mockData = { Code: 'MCL001', IsActive: 1 };
      const builder = new MockBuilder(mockData);
      mockClient.from.mockReturnValue(builder);

      const result = await service.findByCode('MCL001');
      expect(result).toEqual(mockData);
    });

    it('should throw NotFoundException if record does not exist', async () => {
      const builder = new MockBuilder(null);
      mockClient.from.mockReturnValue(builder);

      await expect(service.findByCode('MCL001')).rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException on DB error', async () => {
      const builder = new MockBuilder(null, { message: 'Error' });
      mockClient.from.mockReturnValue(builder);

      await expect(service.findByCode('MCL001')).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('createOrUpdateDraft', () => {
    const classCode = 'CLS001';
    const billingMonth = '2026-07';
    const mockClass = { Code: classCode, Name: 'Math Class', FeeAmount: 500000, TeacherCode: 'TCH001' };
    const mockInvoices = {
      data: [
        { Code: 'INV001', StudentCode: 'STD001', TotalAmount: 500000, PaidAmount: 500000, RemainingAmount: 0, Status: 'paid' },
        { Code: 'INV002', StudentCode: 'STD002', TotalAmount: 500000, PaidAmount: 200000, RemainingAmount: 300000, Status: 'partially_paid' },
      ],
    };

    beforeEach(() => {
      classesService.findByCode.mockResolvedValue(mockClass as any);
      classesService.getStudentCount.mockResolvedValue(2);
      invoicesService.findAll.mockResolvedValue(mockInvoices as any);
    });

    it('should create a new draft if none exists', async () => {
      // Find existing returns null
      const existingBuilder = new MockBuilder(null);
      // Max code returns MCL001
      const maxCodeBuilder = new MockBuilder({ Code: 'MCL001' });
      // Insert returns new row
      const insertRow = { Code: 'MCL002', Status: 'draft' };
      const insertBuilder = new MockBuilder(insertRow);

      mockClient.from
        .mockReturnValueOnce(existingBuilder)
        .mockReturnValueOnce(maxCodeBuilder)
        .mockReturnValueOnce(insertBuilder);

      const result = await service.createOrUpdateDraft(classCode, billingMonth);

      expect(result).toEqual(insertRow);
      expect(auditService.log).toHaveBeenCalledWith({
        TeacherCode: 'TCH001',
        EntityType: 'MonthlyClosing',
        EntityCode: 'MCL002',
        Action: 'CREATE_DRAFT',
        NewValue: JSON.stringify(insertRow),
        ActorType: 'system',
      });
    });

    it('should update draft if a draft exists and is not finalized', async () => {
      const existingDraft = { Id: 123, Code: 'MCL001', Status: 'draft' };
      const updatedDraft = { ...existingDraft, Status: 'draft', Name: 'Updated Name' };

      const existingBuilder = new MockBuilder(existingDraft);
      const updateBuilder = new MockBuilder(updatedDraft);

      mockClient.from
        .mockReturnValueOnce(existingBuilder)
        .mockReturnValueOnce(updateBuilder);

      const result = await service.createOrUpdateDraft(classCode, billingMonth);

      expect(result).toEqual(updatedDraft);
      expect(auditService.log).toHaveBeenCalledWith({
        TeacherCode: 'TCH001',
        EntityType: 'MonthlyClosing',
        EntityCode: 'MCL001',
        Action: 'UPDATE_DRAFT',
        NewValue: JSON.stringify(updatedDraft),
        ActorType: 'system',
      });
    });

    it('should throw BadRequestException if a finalized draft exists', async () => {
      const existingDraft = { Id: 123, Code: 'MCL001', Status: 'finalized' };
      const existingBuilder = new MockBuilder(existingDraft);
      mockClient.from.mockReturnValue(existingBuilder);

      await expect(service.createOrUpdateDraft(classCode, billingMonth)).rejects.toThrow(BadRequestException);
    });
  });

  describe('finalize', () => {
    it('should return current if already finalized', async () => {
      const mockData = { Code: 'MCL001', Status: 'finalized', IsActive: 1 };
      const findBuilder = new MockBuilder(mockData);
      mockClient.from.mockReturnValue(findBuilder);

      const result = await service.finalize('MCL001');
      expect(result).toEqual(mockData);
    });

    it('should finalize draft if currently draft', async () => {
      const mockData = { Code: 'MCL001', Status: 'draft', TeacherCode: 'TCH001', IsActive: 1 };
      const updatedData = { ...mockData, Status: 'finalized' };

      const findBuilder = new MockBuilder(mockData);
      const updateBuilder = new MockBuilder(updatedData);

      mockClient.from
        .mockReturnValueOnce(findBuilder) // for findByCode
        .mockReturnValueOnce(updateBuilder); // for update

      const result = await service.finalize('MCL001');
      expect(result.Status).toBe('finalized');
      expect(auditService.log).toHaveBeenCalledWith({
        TeacherCode: 'TCH001',
        EntityType: 'MonthlyClosing',
        EntityCode: 'MCL001',
        Action: 'FINALIZE',
        OldValue: JSON.stringify({ Status: 'draft' }),
        NewValue: JSON.stringify({ Status: 'finalized' }),
        ActorType: 'system',
      });
    });
  });

  describe('reopen', () => {
    it('should return current if already draft', async () => {
      const mockData = { Code: 'MCL001', Status: 'draft', IsActive: 1 };
      const findBuilder = new MockBuilder(mockData);
      mockClient.from.mockReturnValue(findBuilder);

      const result = await service.reopen('MCL001');
      expect(result).toEqual(mockData);
    });

    it('should reopen finalized report to draft', async () => {
      const mockData = { Code: 'MCL001', Status: 'finalized', TeacherCode: 'TCH001', IsActive: 1 };
      const updatedData = { ...mockData, Status: 'draft' };

      const findBuilder = new MockBuilder(mockData);
      const updateBuilder = new MockBuilder(updatedData);

      mockClient.from
        .mockReturnValueOnce(findBuilder)
        .mockReturnValueOnce(updateBuilder);

      const result = await service.reopen('MCL001');
      expect(result.Status).toBe('draft');
      expect(auditService.log).toHaveBeenCalledWith({
        TeacherCode: 'TCH001',
        EntityType: 'MonthlyClosing',
        EntityCode: 'MCL001',
        Action: 'REOPEN',
        OldValue: JSON.stringify({ Status: 'finalized' }),
        NewValue: JSON.stringify({ Status: 'draft' }),
        ActorType: 'system',
      });
    });
  });
});
