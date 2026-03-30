import type { ModelDefinition } from '../../core/types.js';

export const AVA_FREE_MODELS: ModelDefinition[] = [
  {
    id: 'qwen3-omni-flash',
    name: 'Qwen Omni Flash (Free)',
    provider: 'ava-free',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: true,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
  },
  {
    id: 'qwen3.5-omni-plus',
    name: 'Qwen 3.5 Omni Plus (Free)',
    provider: 'ava-free',
    contextWindow: 256000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
  },
];
