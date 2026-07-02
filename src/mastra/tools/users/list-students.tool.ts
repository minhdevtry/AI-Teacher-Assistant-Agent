import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { UsersService } from '../../../domain/users/users.service';

export function createListStudentsTool(usersService: UsersService) {
  return createTool({
    id: 'list-students',
    description: 'Xem danh sách học sinh, có thể lọc theo lớp',
    inputSchema: z.object({
      classCode: z.string().optional().describe('Lọc theo mã lớp'),
    }),
    outputSchema: z.object({
      students: z.array(z.object({
        code: z.string(),
        name: z.string(),
        nickname: z.string().nullable(),
        classCode: z.string().nullable(),
        phone: z.string().nullable(),
        parentName: z.string().nullable(),
      })),
      total: z.number(),
    }),
    execute: async (input) => {
      let students;
      if (input.classCode) {
        students = await usersService.getStudentsByClass(input.classCode);
      } else {
        const result = await usersService.findAll({ role: 'student', page: 1, limit: 50 });
        students = result.data;
      }
      return {
        students: students.map((s: any) => ({
          code: s.Code,
          name: s.Name,
          nickname: s.Nickname || null,
          classCode: s.ClassCode || null,
          phone: s.Phone || null,
          parentName: null,
        })),
        total: students.length,
      };
    },
  });
}
