import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { MastraService } from './mastra.service';

class ChatDto {
  @ApiProperty({ description: 'Message to send to the agent', example: 'Xin chào' })
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiPropertyOptional({ description: 'Thread ID for conversation continuity' })
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiPropertyOptional({ description: 'Resource ID (e.g. teacher code) for memory scoping' })
  @IsOptional()
  @IsString()
  resourceId?: string;
}

@ApiTags('Agents')
@Controller('api/agents')
export class MastraController {
  private readonly logger = new Logger(MastraController.name);

  constructor(private readonly mastraService: MastraService) {}

  @Get()
  @ApiOperation({ summary: 'List all registered agents' })
  @ApiResponse({
    status: 200,
    description: 'List of available agents',
    schema: {
      type: 'object',
      properties: {
        agents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
      },
    },
  })
  listAgents() {
    const mastra = this.mastraService.getMastra();
    const agentsMap = mastra.listAgents();
    return {
      agents: Object.values(agentsMap).map((a) => ({
        id: a.id,
        name: a.name ?? a.id,
      })),
    };
  }

  @Post(':agentId/chat')
  @ApiOperation({ summary: 'Send a message to an agent and get a response' })
  @ApiParam({ name: 'agentId', description: 'Agent identifier', example: 'orchestrator' })
  @ApiBody({
    type: ChatDto,
    examples: {
      hello: {
        summary: 'Simple greeting',
        value: { message: 'Xin chào' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Agent response' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiResponse({ status: 500, description: 'Agent execution error' })
  async chat(
    @Param('agentId') agentId: string,
    @Body() body: ChatDto,
  ) {
    if (!body.message) {
      throw new HttpException(
        'message is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const agent = this.mastraService.getAgent(agentId);
      const generateOptions: Record<string, unknown> = { maxSteps: 5 };
      if (body.threadId) generateOptions.threadId = body.threadId;
      if (body.resourceId) generateOptions.resourceId = body.resourceId;

      const result = await agent.generate(
        body.message,
        generateOptions as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      );

      // Robust text extraction from Mastra FullOutput
      // When tools are called, text may be in different locations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      let text = '';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extractFromMessages = (messages: any[]): string | null => {
        if (!Array.isArray(messages)) return null;
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (msg?.role !== 'assistant') continue;
          const content = msg?.content;
          if (typeof content === 'string' && content.length > 0) return content;
          if (Array.isArray(content)) {
            const textParts = content
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((p: any) => p?.type === 'text' && p?.text)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((p: any) => p.text);
            if (textParts.length > 0) return textParts.join('\n');
          }
        }
        return null;
      };

      // 1. Direct text
      if (typeof r?.text === 'string' && r.text.length > 0) {
        text = r.text;
      }
      // 2. response.messages
      if (!text) {
        const fromMsgs = extractFromMessages(r?.response?.messages);
        if (fromMsgs) text = fromMsgs;
      }
      // 3. steps array (tool calls)
      if (!text && Array.isArray(r?.steps)) {
        for (let i = r.steps.length - 1; i >= 0; i--) {
          const step = r.steps[i];
          if (typeof step?.text === 'string' && step.text.length > 0) {
            text = step.text;
            break;
          }
          const fromStepMsgs = extractFromMessages(step?.response?.messages);
          if (fromStepMsgs) { text = fromStepMsgs; break; }
        }
      }
      // 4. Fallback - deep debug
      if (!text) {
        const debugInfo: Record<string, unknown> = {
          text: r?.text,
          finishReason: r?.finishReason,
          toolCalls: r?.toolCalls,
          toolResults: r?.toolResults,
          stepsLength: Array.isArray(r?.steps) ? r.steps.length : 'no steps',
          error: r?.error,
          usage: r?.usage,
        };
        // Check steps for detail
        if (Array.isArray(r?.steps)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          debugInfo.stepsDetail = r.steps.map((s: any, idx: number) => ({
            idx,
            text: s?.text,
            finishReason: s?.finishReason,
            toolCalls: s?.toolCalls,
            toolResults: s?.toolResults,
            error: s?.error,
            responseText: s?.response?.messages?.length,
          }));
        }
        this.logger.warn(`Agent ${agentId}: could not extract text. Debug: ${JSON.stringify(debugInfo, null, 0)}`);
        text = 'Xin lỗi, tôi không thể xử lý yêu cầu này. Vui lòng thử lại.';
      }

      // 5. Strip <think> blocks from thinking models (Qwen, etc.)
      text = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/g, '').trim();

      this.logger.log(`Agent ${agentId} response length=${text.length}`);

      return {
        agentId,
        text,
        threadId: body.threadId,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Agent ${agentId} error: ${message}`);

      if (message.includes('not found') || message.includes('not registered')) {
        throw new HttpException(
          `Agent "${agentId}" not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      throw new HttpException(
        { error: message, agentId },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
