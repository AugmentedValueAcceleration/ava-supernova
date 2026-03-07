import type { ModelDefinition } from '../../core/types.js';

export const ANTHROPIC_MODELS: ModelDefinition[] = [
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 32768,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: true,
    pricing: { inputPerMillion: 5, outputPerMillion: 25 },
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 16384,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: true,
    pricing: { inputPerMillion: 3, outputPerMillion: 15 },
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: true,
    pricing: { inputPerMillion: 1, outputPerMillion: 5 },
  },
];
