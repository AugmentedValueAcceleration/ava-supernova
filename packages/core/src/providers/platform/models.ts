import type { ModelDefinition } from '../../core/types.js';

/**
 * Platform models — available on managed plans + free accounts.
 * Powered by Qwen (enterprise partnership).
 * Free accounts: 3M tokens, default to Qwen Flash.
 * Paid plans: default to Qwen 3.5 Plus.
 */
export const PLATFORM_MODELS: ModelDefinition[] = [
  // Qwen 3.5 Omni Plus — multimodal, paid plans default
  {
    id: 'qwen3.5-omni-plus',
    name: 'Qwen 3.5 Omni Plus',
    provider: 'platform',
    contextWindow: 256000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    pricing: { inputPerMillion: 0.26, outputPerMillion: 1.56 },
  },
  // Qwen Omni Flash — multimodal, free accounts default
  {
    id: 'qwen3-omni-flash',
    name: 'Qwen Omni Flash',
    provider: 'platform',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: true,
    pricing: { inputPerMillion: 0.065, outputPerMillion: 0.26 },
  },
];
