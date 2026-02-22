import type { ModelDefinition } from '../../core/types.js';

export const DEEPSEEK_MODELS: ModelDefinition[] = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V3',
    provider: 'deepseek',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.27, outputPerMillion: 1.10 },
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsToolCalls: false,
    supportsStreaming: true,
    supportsThinking: true,
    pricing: { inputPerMillion: 0.55, outputPerMillion: 2.19 },
  },
];
