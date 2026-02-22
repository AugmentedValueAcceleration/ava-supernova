import type { ModelDefinition } from '../../core/types.js';

export const DEEPSEEK_MODELS: ModelDefinition[] = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V3.2',
    provider: 'deepseek',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.28, outputPerMillion: 0.42 },
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek V3.2 Reasoner',
    provider: 'deepseek',
    contextWindow: 128000,
    maxOutputTokens: 64000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    pricing: { inputPerMillion: 0.28, outputPerMillion: 0.42 },
  },
];
