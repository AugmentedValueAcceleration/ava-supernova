import type { ModelDefinition } from '../../core/types.js';

// Default models for common local inference servers
export const DEFAULT_GENERIC_MODELS: ModelDefinition[] = [
  {
    id: 'custom',
    name: 'Custom Model',
    provider: 'generic',
    contextWindow: 32000,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsStreaming: true,
  },
];
