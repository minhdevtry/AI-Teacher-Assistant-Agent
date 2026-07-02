import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { BaseResponseDto } from '../common/base-response.dto';

describe('ReportsController', () => {
  let controller: ReportsController;
  let service: jest.Mocked<ReportsService>;

  beforeEach(async () => {
    const mockService = {
      getDashboardSummary: jest.fn(),
      getClassFinancials: jest.fn(),
      getRevenueTrends: jest.fn(),
      getDebtors: jest.fn(),
      getClassDetailReport: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
    service = module.get(ReportsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDashboardSummary', () => {
    it('should return a success response with dashboard summary data', async () => {
      const mockResult = { totalStudents: 10, totalClasses: 2 };
      service.getDashboardSummary.mockResolvedValue(mockResult as any);

      const response = await controller.getDashboardSummary('2026-07');

      expect(service.getDashboardSummary).toHaveBeenCalledWith('2026-07');
      expect(response).toEqual(BaseResponseDto.ok(mockResult));
    });

    it('should handle undefined month parameter', async () => {
      const mockResult = { totalStudents: 10, totalClasses: 2 };
      service.getDashboardSummary.mockResolvedValue(mockResult as any);

      const response = await controller.getDashboardSummary(undefined);

      expect(service.getDashboardSummary).toHaveBeenCalledWith(undefined);
      expect(response).toEqual(BaseResponseDto.ok(mockResult));
    });
  });

  describe('getClassFinancials', () => {
    it('should return class financial reports', async () => {
      const mockResult = [{ classCode: 'CLS001', revenue: 1000 }];
      service.getClassFinancials.mockResolvedValue(mockResult as any);

      const response = await controller.getClassFinancials('2026-07');

      expect(service.getClassFinancials).toHaveBeenCalledWith('2026-07');
      expect(response).toEqual(BaseResponseDto.ok(mockResult));
    });
  });

  describe('getRevenueTrends', () => {
    it('should parse limit and return trends', async () => {
      const mockResult = [{ month: '2026-07', amount: 5000 }];
      service.getRevenueTrends.mockResolvedValue(mockResult as any);

      const response = await controller.getRevenueTrends('5');

      expect(service.getRevenueTrends).toHaveBeenCalledWith(5);
      expect(response).toEqual(BaseResponseDto.ok(mockResult));
    });

    it('should default limit to 6 if not provided', async () => {
      const mockResult = [{ month: '2026-07', amount: 5000 }];
      service.getRevenueTrends.mockResolvedValue(mockResult as any);

      const response = await controller.getRevenueTrends(undefined);

      expect(service.getRevenueTrends).toHaveBeenCalledWith(6);
      expect(response).toEqual(BaseResponseDto.ok(mockResult));
    });
  });

  describe('getDebtors', () => {
    it('should return debtor list', async () => {
      const mockResult = [{ studentName: 'Nguyen Van A', debt: 500 }];
      service.getDebtors.mockResolvedValue(mockResult as any);

      const response = await controller.getDebtors();

      expect(service.getDebtors).toHaveBeenCalled();
      expect(response).toEqual(BaseResponseDto.ok(mockResult));
    });
  });

  describe('getClassDetailReport', () => {
    it('should return detail report for a class and month', async () => {
      const mockResult = { classCode: 'CLS001', month: '2026-07', details: [] };
      service.getClassDetailReport.mockResolvedValue(mockResult as any);

      const response = await controller.getClassDetailReport('CLS001', '2026-07');

      expect(service.getClassDetailReport).toHaveBeenCalledWith('CLS001', '2026-07');
      expect(response).toEqual(BaseResponseDto.ok(mockResult));
    });
  });
});
