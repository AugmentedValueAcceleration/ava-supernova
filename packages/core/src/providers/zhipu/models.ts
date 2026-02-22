import type { ModelDefinition } from '../../core/types.js';

export const ZHIPU_MODELS: ModelDefinition[] = [
  {
    id: 'glm-5',
    name: 'GLM-5',
    provider: 'zhipu',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.70, outputPerMillion: 0.70 },
  },
  {
    id: 'glm-4.7',
    name: 'GLM-4.7',
    provider: 'zhipu',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.70, outputPerMillion: 0.70 },
  },
  {
    id: 'glm-4-flash',
    name: 'GLM-4 Flash',
    provider: 'zhipu',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.00, outputPerMillion: 0.00 },
  },
];
