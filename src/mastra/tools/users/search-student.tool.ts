import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { UsersService } from '../../../domain/users/users.service';

export function createSearchStudentTool(usersService: UsersService) {
  return createTool({
    id: 'search-student',
    description: 'Tìm học sinh theo tên, nickname, hoặc số điện thoại',
    inputSchema: z.object({
      query: z.string().describe('Tên, nickname, hoặc SĐT cần tìm'),
      classCode: z.string().optional().describe('Lọc theo mã lớp'),
    }),
    outputSchema: z.object({
      students: z.array(
        z.object({
          code: z.string(),
          name: z.string(),
          nickname: z.string().nullable(),
          classCode: z.string().nullable(),
          phone: z.string().nullable(),
        }),
      ),
      total: z.number(),
    }),
    execute: async (input) => {
      const results = await usersService.search(input.query);
      const students = results.filter(
        (u: { Role: string; ClassCode: string | null }) =>
          u.Role === 'student' &&
          (!input.classCode || u.ClassCode === input.classCode),
      );
      return {
        students: students.map(
          (s: {
            Code: string;
            Name: string;
            Nickname: string | null;
            ClassCode: string | null;
            Phone: string | null;
          }) => ({
            code: s.Code,
            name: s.Name,
            nickname: s.Nickname,
            classCode: s.ClassCode,
            phone: s.Phone,
          }),
        ),
        total: students.length,
      };
    },
  });
}
