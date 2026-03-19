import type { ModelDefinition } from '../../core/types.js';

export const AVA_FREE_MODELS: ModelDefinition[] = [
  {
    id: 'qwen-flash',
    name: 'Qwen Flash (Free)',
    provider: 'ava-free',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 }, // Free for users
  },
  {
    id: 'qwen3.5-plus',
    name: 'Qwen 3.5 Plus (Free)',
    provider: 'ava-free',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 }, // Free for users (uses 3M token balance)
  },
];
