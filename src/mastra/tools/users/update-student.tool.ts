import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { UsersService } from '../../../domain/users/users.service';

export function createUpdateStudentTool(usersService: UsersService) {
  return createTool({
    id: 'update-student',
    description: 'Cập nhật thông tin học sinh theo mã (Code)',
    inputSchema: z.object({
      code: z.string().describe('Mã học sinh (VD: STD001)'),
      name: z.string().optional().describe('Họ tên mới'),
      phone: z.string().optional().describe('SĐT mới'),
      nickname: z.string().optional().describe('Nickname mới'),
      classCode: z.string().optional().describe('Mã lớp mới'),
    }),
    outputSchema: z.object({
      code: z.string(),
      name: z.string(),
      phone: z.string().nullable(),
      nickname: z.string().nullable(),
      classCode: z.string().nullable(),
      modifiedAt: z.string(),
    }),
    execute: async (input) => {
      const updateDto: Record<string, unknown> = {};
      if (input.name !== undefined) updateDto['Name'] = input.name;
      if (input.phone !== undefined) updateDto['Phone'] = input.phone;
      if (input.nickname !== undefined) updateDto['Nickname'] = input.nickname;
      if (input.classCode !== undefined) updateDto['ClassCode'] = input.classCode;

      const result = await usersService.update(input.code, updateDto);
      return {
        code: result.Code,
        name: result.Name,
        phone: result.Phone,
        nickname: result.Nickname,
        classCode: result.ClassCode,
        modifiedAt: result.ModifiedAt,
      };
    },
  });
}
