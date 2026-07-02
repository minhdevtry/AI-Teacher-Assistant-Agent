import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';
import { createOrchestratorAgent } from './agents/orchestrator.agent';
import { createBillingAgent } from './agents/billing.agent';
import type { OrchestratorAgentTools } from './agents/orchestrator.agent';
import type { BillingAgentTools } from './agents/billing.agent';

/** Model type from Vercel AI SDK (LanguageModelV4 from @ai-sdk/openai). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AIModel = any;

export interface MastraConfig {
  directUrl: string;
  textModel: AIModel;
  visionModel: AIModel;
}

export interface MastraTools {
  orchestratorTools: OrchestratorAgentTools;
  billingTools: BillingAgentTools;
}

/** Pre-built workflow instances to register with the Mastra instance. */
export interface MastraWorkflows {
  recordPaymentFromText: ReturnType<typeof import('@mastra/core/workflows').createWorkflow>;
  recordPaymentFromBill: ReturnType<typeof import('@mastra/core/workflows').createWorkflow>;
  feeQuestionAnswer: ReturnType<typeof import('@mastra/core/workflows').createWorkflow>;
  generateReminder: ReturnType<typeof import('@mastra/core/workflows').createWorkflow>;
}

/**
 * Build the Mastra instance with PostgresStore and registered agents.
 *
 * Uses DIRECT_URL (port 5432, no pgBouncer) for storage — pooler connections
 * on port 6543 are unsuitable for long-lived storage operations.
 */
export function buildMastra(
  config: MastraConfig,
  tools: MastraTools,
  workflows?: MastraWorkflows,
): Mastra {
  const storage = new PostgresStore({
    id: 'zalo-agent-store',
    connectionString: config.directUrl,
  });

  const billing = createBillingAgent(config.textModel, tools.billingTools);

  const orchestrator = createOrchestratorAgent(
    config.textModel,
    tools.orchestratorTools,
    billing,
  );

  const mastraWorkflows: Record<string, unknown> = {};
  if (workflows) {
    mastraWorkflows['record-payment-from-text'] = workflows.recordPaymentFromText;
    mastraWorkflows['record-payment-from-bill'] = workflows.recordPaymentFromBill;
    mastraWorkflows['fee-question-answer'] = workflows.feeQuestionAnswer;
    mastraWorkflows['generate-reminder'] = workflows.generateReminder;
  }

  return new Mastra({
    storage,
    agents: {
      orchestrator,
      billing,
    },
    workflows: mastraWorkflows as Record<string, ReturnType<typeof import('@mastra/core/workflows').createWorkflow>>,
  });
}
