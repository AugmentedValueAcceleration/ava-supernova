import type { ModelDefinition } from '../../core/types.js';

export const AVA_FREE_MODELS: ModelDefinition[] = [
  {
    id: 'glm-4.5-flash',
    name: 'GLM-4.5 Flash (Free)',
    provider: 'ava-free',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
  },
];
