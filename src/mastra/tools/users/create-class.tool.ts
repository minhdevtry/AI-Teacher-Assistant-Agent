import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ClassesService } from '../../../domain/classes/classes.service';

export function createCreateClassTool(classesService: ClassesService) {
  return createTool({
    id: 'create-class',
    description: 'Tạo lớp học mới với thông tin tên, môn học, học phí, lịch học',
    inputSchema: z.object({
      name: z.string().describe('Tên lớp học'),
      subject: z.string().describe('Môn học'),
      feeAmount: z.number().describe('Học phí'),
      feeType: z.string().describe('Loại phí: monthly, per_session, per_course'),
      schedule: z.string().optional().describe('Lịch học (VD: T2-T4-T6 18:00-20:00)'),
      teacherCode: z.string().describe('Mã giáo viên phụ trách'),
    }),
    outputSchema: z.object({
      code: z.string(),
      name: z.string(),
      subject: z.string(),
      feeAmount: z.number(),
      feeType: z.string(),
      schedule: z.string().nullable(),
      teacherCode: z.string(),
    }),
    execute: async (input) => {
      const result = await classesService.create({
        Name: input.name,
        Subject: input.subject,
        FeeAmount: input.feeAmount,
        FeeType: input.feeType,
        Schedule: input.schedule,
        TeacherCode: input.teacherCode,
      });
      return {
        code: result.Code,
        name: result.Name,
        subject: result.Subject,
        feeAmount: result.FeeAmount,
        feeType: result.FeeType,
        schedule: result.Schedule,
        teacherCode: result.TeacherCode,
      };
    },
  });
}
