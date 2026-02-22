import type { ModelDefinition } from '../../core/types.js';

export const KIMI_MODELS: ModelDefinition[] = [
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    provider: 'kimi',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    pricing: { inputPerMillion: 1.00, outputPerMillion: 4.00 },
  },
  {
    id: 'moonshot-v1-128k',
    name: 'Moonshot V1 128K',
    provider: 'kimi',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.82, outputPerMillion: 0.82 },
  },
];
