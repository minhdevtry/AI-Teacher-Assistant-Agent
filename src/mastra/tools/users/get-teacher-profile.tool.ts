import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { UsersService } from '../../../domain/users/users.service';

export function createGetTeacherProfileTool(usersService: UsersService) {
  return createTool({
    id: 'get-teacher-profile',
    description: 'Lấy thông tin giáo viên theo mã hoặc số điện thoại',
    inputSchema: z.object({
      code: z.string().optional().describe('Mã giáo viên (VD: TCH001)'),
      phone: z.string().optional().describe('Số điện thoại giáo viên'),
    }),
    outputSchema: z.object({
      code: z.string(),
      name: z.string(),
      phone: z.string().nullable(),
      nickname: z.string().nullable(),
      title: z.string().nullable(),
      zaloUserId: z.string().nullable(),
    }),
    execute: async (input) => {
      let teacher: {
        Code: string;
        Name: string;
        Phone: string | null;
        Nickname: string | null;
        Title: string | null;
        ZaloUserId: string | null;
      };

      if (input.code) {
        teacher = await usersService.findByCode(input.code);
      } else if (input.phone) {
        const results = await usersService.search(input.phone);
        const found = results.find(
          (u: { Role: string }) => u.Role === 'teacher',
        );
        if (!found) {
          throw new Error('Không tìm thấy giáo viên');
        }
        teacher = found;
      } else {
        throw new Error('Phải cung cấp mã hoặc số điện thoại giáo viên');
      }

      return {
        code: teacher.Code,
        name: teacher.Name,
        phone: teacher.Phone,
        nickname: teacher.Nickname,
        title: teacher.Title,
        zaloUserId: teacher.ZaloUserId,
      };
    },
  });
}
