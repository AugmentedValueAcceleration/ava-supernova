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
  },
];
