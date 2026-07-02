import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ClassesService } from '../../../domain/classes/classes.service';
import { UsersService } from '../../../domain/users/users.service';

export function createGetClassDetailTool(
  classesService: ClassesService,
  usersService: UsersService,
) {
  return createTool({
    id: 'get-class-detail',
    description: 'Xem chi tiết một lớp học bao gồm danh sách học sinh',
    inputSchema: z.object({
      classCode: z.string().describe('Mã lớp cần xem'),
    }),
    outputSchema: z.object({
      code: z.string(),
      name: z.string(),
      subject: z.string().nullable(),
      schedule: z.string().nullable(),
      feeAmount: z.number().nullable(),
      feeType: z.string().nullable(),
      students: z.array(z.object({
        code: z.string(),
        name: z.string(),
        nickname: z.string().nullable(),
      })),
      totalStudents: z.number(),
    }),
    execute: async (input) => {
      const cls = await classesService.findByCode(input.classCode);
      if (!cls) throw new Error(`Không tìm thấy lớp ${input.classCode}`);
      const students = await usersService.getStudentsByClass(input.classCode);
      return {
        code: cls.Code,
        name: cls.Name,
        subject: cls.Subject || null,
        schedule: cls.Schedule || null,
        feeAmount: cls.FeeAmount || null,
        feeType: cls.FeeType || null,
        students: students.map((s: any) => ({
          code: s.Code,
          name: s.Name,
          nickname: s.Nickname || null,
        })),
        totalStudents: students.length,
      };
    },
  });
}
