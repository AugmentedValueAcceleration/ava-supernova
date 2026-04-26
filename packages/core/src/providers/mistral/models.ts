import type { ModelDefinition } from '../../core/types.js';

export const MISTRAL_MODELS: ModelDefinition[] = [
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    provider: 'mistral',
    contextWindow: 262000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 2.00, outputPerMillion: 6.00 },
  },
  {
    id: 'codestral-latest',
    name: 'Codestral',
    provider: 'mistral',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    desktopCapable: true, // Coding-tuned, tool calls solid.
    pricing: { inputPerMillion: 0.30, outputPerMillion: 0.90 },
  },
  {
    id: 'devstral-latest',
    name: 'Devstral 2',
    provider: 'mistral',
    contextWindow: 262000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    desktopCapable: true, // Agentic coding model, tool-call reliable.
    pricing: { inputPerMillion: 0.40, outputPerMillion: 2.00 },
  },
];
