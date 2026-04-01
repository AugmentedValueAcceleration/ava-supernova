import type { ModelDefinition } from '../../core/types.js';

export const MINIMAX_MODELS: ModelDefinition[] = [
  {
    id: 'MiniMax-M2.5',
    name: 'MiniMax M2.5',
    provider: 'minimax',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false, // Vision not supported via Anthropic/OpenAI endpoints — only native API
    pricing: { inputPerMillion: 0.15, outputPerMillion: 1.20 },
  },
  {
    id: 'MiniMax-M2',
    name: 'MiniMax M2',
    provider: 'minimax',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false,
    pricing: { inputPerMillion: 0.255, outputPerMillion: 1.00 },
  },
];
