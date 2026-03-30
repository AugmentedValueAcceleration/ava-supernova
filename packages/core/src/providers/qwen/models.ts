import type { ModelDefinition } from '../../core/types.js';

export const QWEN_MODELS: ModelDefinition[] = [
  {
    id: 'qwen3.5-omni-plus',
    name: 'Qwen 3.5 Omni Plus',
    provider: 'qwen',
    contextWindow: 256000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    pricing: { inputPerMillion: 0.26, outputPerMillion: 1.56 },
  },
  {
    id: 'qwen3-omni-flash',
    name: 'Qwen Omni Flash',
    provider: 'qwen',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: false,
    supportsVision: true,
    pricing: { inputPerMillion: 0.065, outputPerMillion: 0.26 },
  },
];
