import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { UsersService } from '../../../domain/users/users.service';

export function createMoveStudentTool(usersService: UsersService) {
  return createTool({
    id: 'move-student',
    description: 'Chuyển học sinh sang lớp khác',
    inputSchema: z.object({
      studentCode: z.string().describe('Mã học sinh'),
      newClassCode: z.string().describe('Mã lớp mới'),
    }),
    outputSchema: z.object({
      studentCode: z.string(),
      oldClassCode: z.string().nullable(),
      newClassCode: z.string(),
      success: z.boolean(),
    }),
    execute: async (input) => {
      const student = await usersService.findByCode(input.studentCode);
      const oldClassCode = student.ClassCode;

      await usersService.update(input.studentCode, {
        ClassCode: input.newClassCode,
      });

      return {
        studentCode: input.studentCode,
        oldClassCode,
        newClassCode: input.newClassCode,
        success: true,
      };
    },
  });
}
