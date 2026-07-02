import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { UsersService } from '../../../domain/users/users.service';

export function createCreateStudentTool(usersService: UsersService) {
  return createTool({
    id: 'create-student',
    description: 'Tạo học sinh mới với thông tin tên, lớp, SĐT, nickname',
    inputSchema: z.object({
      name: z.string().describe('Họ tên học sinh'),
      classCode: z.string().describe('Mã lớp'),
      phone: z.string().optional().describe('Số điện thoại'),
      nickname: z.string().optional().describe('Nickname/tên gọi tắt'),
      parentId: z.number().optional().describe('ID phụ huynh liên kết'),
    }),
    outputSchema: z.object({
      code: z.string(),
      name: z.string(),
      classCode: z.string().nullable(),
      phone: z.string().nullable(),
      nickname: z.string().nullable(),
      createdAt: z.string(),
    }),
    execute: async (input) => {
      const result = await usersService.create({
        Role: 'student',
        Name: input.name,
        ClassCode: input.classCode,
        Phone: input.phone,
        Nickname: input.nickname,
        ParentId: input.parentId,
      });
      return {
        code: result.Code,
        name: result.Name,
        classCode: result.ClassCode,
        phone: result.Phone,
        nickname: result.Nickname,
        createdAt: result.CreatedAt,
      };
    },
  });
}
