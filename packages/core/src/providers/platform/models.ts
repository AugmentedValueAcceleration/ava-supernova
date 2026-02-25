import type { ModelDefinition } from '../../core/types.js';

export const PLATFORM_MODELS: ModelDefinition[] = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V3.2',
    provider: 'platform',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek R1',
    provider: 'platform',
    contextWindow: 128000,
    maxOutputTokens: 64000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
  },
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    provider: 'platform',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
  },
];
