import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export function createExtractBillFromImageTool() {
  return createTool({
    id: 'extract-bill-from-image',
    description: 'Trích xuất thông tin hóa đơn từ hình ảnh (OCR). Placeholder — sẽ tích hợp vision model.',
    inputSchema: z.object({
      imageUrl: z.string().describe('URL hình ảnh hóa đơn'),
    }),
    outputSchema: z.object({
      extractedAmount: z.number().nullable(),
      extractedBank: z.string().nullable(),
      extractedTime: z.string().nullable(),
      extractedNote: z.string().nullable(),
      confidenceScore: z.number(),
      rawResult: z.string().nullable(),
    }),
    execute: async (input) => {
      // Placeholder: will use vision model in future task
      console.log(`[extractBillFromImage] Processing image: ${input.imageUrl}`);

      return {
        extractedAmount: null,
        extractedBank: null,
        extractedTime: null,
        extractedNote: 'OCR chưa được tích hợp — placeholder tool',
        confidenceScore: 0,
        rawResult: null,
      };
    },
  });
}
