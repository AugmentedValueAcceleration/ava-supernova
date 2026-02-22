import type { ModelDefinition } from '../../core/types.js';

export const ZHIPU_MODELS: ModelDefinition[] = [
  {
    id: 'glm-5',
    name: 'GLM-5',
    provider: 'zhipu',
    contextWindow: 200000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    pricing: { inputPerMillion: 1.00, outputPerMillion: 3.20 },
  },
  {
    id: 'glm-4.7',
    name: 'GLM-4.7',
    provider: 'zhipu',
    contextWindow: 200000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    pricing: { inputPerMillion: 0.60, outputPerMillion: 2.20 },
  },
  {
    id: 'glm-4-flash',
    name: 'GLM-4 Flash (Free)',
    provider: 'zhipu',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.00, outputPerMillion: 0.00 },
  },
];
