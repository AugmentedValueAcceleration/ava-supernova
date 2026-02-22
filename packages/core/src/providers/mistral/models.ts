import type { ModelDefinition } from '../../core/types.js';

export const MISTRAL_MODELS: ModelDefinition[] = [
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large 3',
    provider: 'mistral',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.50, outputPerMillion: 1.50 },
  },
  {
    id: 'codestral-latest',
    name: 'Codestral 25.08',
    provider: 'mistral',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.30, outputPerMillion: 0.90 },
  },
  {
    id: 'devstral-2-25-12',
    name: 'Devstral 2',
    provider: 'mistral',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.40, outputPerMillion: 2.00 },
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small 3.2',
    provider: 'mistral',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.10, outputPerMillion: 0.30 },
  },
];
