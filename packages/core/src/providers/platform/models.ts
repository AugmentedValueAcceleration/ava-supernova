import type { ModelDefinition } from '../../core/types.js';

/**
 * Platform models — available on managed plans + free accounts.
 * Powered by Qwen (enterprise partnership).
 * Free accounts: 3M tokens, default to Qwen Flash.
 * Paid plans: default to Qwen 3.5 Plus.
 */
export const PLATFORM_MODELS: ModelDefinition[] = [
  // Qwen 3.5 Plus — premium model for paid plans (default for paid)
  {
    id: 'qwen3.5-plus',
    name: 'Qwen 3.5 Plus',
    provider: 'platform',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    pricing: { inputPerMillion: 0.20, outputPerMillion: 1.20 },
  },
  // Qwen Flash — fast, cheap, default for free accounts
  {
    id: 'qwen-flash',
    name: 'Qwen Flash',
    provider: 'platform',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.05, outputPerMillion: 0.40 },
  },
];
