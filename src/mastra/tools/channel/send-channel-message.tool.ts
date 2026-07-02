import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export function createSendChannelMessageTool() {
  return createTool({
    id: 'send-channel-message',
    description: 'Gửi tin nhắn đến người dùng qua kênh (Zalo, v.v.). Hiện tại chỉ log.',
    inputSchema: z.object({
      recipientCode: z.string().describe('Mã người nhận (VD: STD001, TCH001)'),
      message: z.string().describe('Nội dung tin nhắn'),
      channel: z.string().optional().default('zalo').describe('Kênh gửi: zalo, sms'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      recipientCode: z.string(),
      channel: z.string(),
      messagePreview: z.string(),
    }),
    execute: async (input) => {
      // Placeholder: will be wired to ChannelRegistry in Task 7
      // For now, log the intent
      console.log(
        `[sendChannelMessage] → ${input.recipientCode} via ${input.channel}: ${input.message}`,
      );

      return {
        success: true,
        recipientCode: input.recipientCode,
        channel: input.channel ?? 'zalo',
        messagePreview: input.message.substring(0, 100),
      };
    },
  });
}
