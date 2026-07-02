import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ClassesService } from '../../../domain/classes/classes.service';

export function createListClassesTool(classesService: ClassesService) {
  return createTool({
    id: 'list-classes',
    description: 'Xem danh sách tất cả lớp học hoặc lọc theo trạng thái',
    inputSchema: z.object({
      status: z.string().optional().describe('Lọc theo trạng thái: active, paused, stopped'),
      teacherCode: z.string().optional().describe('Lọc theo mã giáo viên'),
    }),
    outputSchema: z.object({
      classes: z.array(z.object({
        code: z.string(),
        name: z.string(),
        subject: z.string().nullable(),
        schedule: z.string().nullable(),
        feeAmount: z.number().nullable(),
        feeType: z.string().nullable(),
        studentCount: z.number(),
        status: z.string(),
      })),
      total: z.number(),
    }),
    execute: async (input) => {
      const result = await classesService.findAll({
        status: input.status,
        teacherCode: input.teacherCode,
        page: 1,
        limit: 50,
      });
      const classes = await Promise.all(
        result.data.map(async (c: any) => ({
          code: c.Code,
          name: c.Name,
          subject: c.Subject || null,
          schedule: c.Schedule || null,
          feeAmount: c.FeeAmount || null,
          feeType: c.FeeType || null,
          studentCount: await classesService.getStudentCount(c.Code),
          status: c.Status || 'active',
        })),
      );
      return { classes, total: classes.length };
    },
  });
}
