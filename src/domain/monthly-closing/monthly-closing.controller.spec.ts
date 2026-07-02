import { Test, TestingModule } from '@nestjs/testing';
import { MonthlyClosingController } from './monthly-closing.controller';
import { MonthlyClosingService } from './monthly-closing.service';
import { QueryMonthlyClosingDto, CreateMonthlyClosingDto } from './dto';
import { BaseResponseDto } from '../common/base-response.dto';

describe('MonthlyClosingController', () => {
  let controller: MonthlyClosingController;
  let service: jest.Mocked<MonthlyClosingService>;

  beforeEach(async () => {
    const mockService = {
      findAll: jest.fn(),
      findByCode: jest.fn(),
      createOrUpdateDraft: jest.fn(),
      finalize: jest.fn(),
      reopen: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonthlyClosingController],
      providers: [
        {
          provide: MonthlyClosingService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<MonthlyClosingController>(MonthlyClosingController);
    service = module.get(MonthlyClosingService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return a paginated base response', async () => {
      const query: QueryMonthlyClosingDto = { page: 1, limit: 10 };
      const mockResult = {
        data: [{ Code: 'MCL001', Status: 'draft' }],
        total: 1,
        page: 1,
        limit: 10,
      };
      service.findAll.mockResolvedValue(mockResult as any);

      const response = await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(response).toEqual(
        BaseResponseDto.paginated(
          mockResult.data,
          mockResult.total,
          mockResult.page,
          mockResult.limit,
        ),
      );
    });
  });

  describe('findByCode', () => {
    it('should return a success response with closing details', async () => {
      const mockClosing = { Code: 'MCL001', Status: 'draft' };
      service.findByCode.mockResolvedValue(mockClosing as any);

      const response = await controller.findByCode('MCL001');

      expect(service.findByCode).toHaveBeenCalledWith('MCL001');
      expect(response).toEqual(BaseResponseDto.ok(mockClosing));
    });
  });

  describe('createDraft', () => {
    it('should create or update a draft and return success', async () => {
      const dto: CreateMonthlyClosingDto = {
        classCode: 'CLS001',
        billingMonth: '2026-07',
      };
      const mockClosing = {
        Code: 'MCL001',
        Status: 'draft',
        ClassCode: 'CLS001',
        BillingMonth: '2026-07',
      };
      service.createOrUpdateDraft.mockResolvedValue(mockClosing as any);

      const response = await controller.createDraft(dto);

      expect(service.createOrUpdateDraft).toHaveBeenCalledWith(
        'CLS001',
        '2026-07',
      );
      expect(response).toEqual(
        BaseResponseDto.ok(
          mockClosing,
          'Đã tạo/cập nhật bản chốt sổ nháp thành công',
        ),
      );
    });
  });

  describe('finalize', () => {
    it('should finalize a monthly closing and return success', async () => {
      const mockClosing = { Code: 'MCL001', Status: 'finalized' };
      service.finalize.mockResolvedValue(mockClosing as any);

      const response = await controller.finalize('MCL001');

      expect(service.finalize).toHaveBeenCalledWith('MCL001');
      expect(response).toEqual(
        BaseResponseDto.ok(mockClosing, 'Đã hoàn thành chốt sổ tháng'),
      );
    });
  });

  describe('reopen', () => {
    it('should reopen a monthly closing and return success', async () => {
      const mockClosing = { Code: 'MCL001', Status: 'draft' };
      service.reopen.mockResolvedValue(mockClosing as any);

      const response = await controller.reopen('MCL001');

      expect(service.reopen).toHaveBeenCalledWith('MCL001');
      expect(response).toEqual(
        BaseResponseDto.ok(mockClosing, 'Đã mở lại chốt sổ tháng'),
      );
    });
  });
});
