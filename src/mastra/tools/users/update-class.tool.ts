import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ClassesService } from '../../../domain/classes/classes.service';

export function createUpdateClassTool(classesService: ClassesService) {
  return createTool({
    id: 'update-class',
    description: 'Cập nhật thông tin lớp học theo mã (Code)',
    inputSchema: z.object({
      code: z.string().describe('Mã lớp (VD: CLS001)'),
      name: z.string().optional().describe('Tên lớp mới'),
      subject: z.string().optional().describe('Môn học mới'),
      feeAmount: z.number().optional().describe('Học phí mới'),
      feeType: z.string().optional().describe('Loại phí mới'),
      schedule: z.string().optional().describe('Lịch học mới'),
    }),
    outputSchema: z.object({
      code: z.string(),
      name: z.string(),
      subject: z.string(),
      feeAmount: z.number(),
      feeType: z.string(),
      schedule: z.string().nullable(),
      modifiedAt: z.string(),
    }),
    execute: async (input) => {
      const updateDto: Record<string, unknown> = {};
      if (input.name !== undefined) updateDto['Name'] = input.name;
      if (input.subject !== undefined) updateDto['Subject'] = input.subject;
      if (input.feeAmount !== undefined) updateDto['FeeAmount'] = input.feeAmount;
      if (input.feeType !== undefined) updateDto['FeeType'] = input.feeType;
      if (input.schedule !== undefined) updateDto['Schedule'] = input.schedule;

      const result = await classesService.update(input.code, updateDto);
      return {
        code: result.Code,
        name: result.Name,
        subject: result.Subject,
        feeAmount: result.FeeAmount,
        feeType: result.FeeType,
        schedule: result.Schedule,
        modifiedAt: result.ModifiedAt,
      };
    },
  });
}
