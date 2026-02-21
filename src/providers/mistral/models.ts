import type { ModelDefinition } from '../../core/types.js';

export const MISTRAL_MODELS: ModelDefinition[] = [
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    provider: 'mistral',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
  },
  {
    id: 'codestral-latest',
    name: 'Codestral',
    provider: 'mistral',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small',
    provider: 'mistral',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
  },
];
