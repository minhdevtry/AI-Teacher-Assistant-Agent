import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const pingTool = createTool({
  id: 'ping',
  description: 'Health check tool - responds with pong',
  inputSchema: z.object({ message: z.string().optional() }),
  outputSchema: z.object({ response: z.string() }),
  execute: async (input) => {
    return { response: `Pong! ${input.message || 'OK'}` };
  },
});
