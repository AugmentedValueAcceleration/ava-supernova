import type { ModelDefinition } from '../../core/types.js';

export const ANTHROPIC_MODELS: ModelDefinition[] = [
  {
    id: 'claude-opus-4-7',
    name: 'Claude Opus 4.7',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 32768,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: true,
    desktopCapable: true, // Anthropic flagship — strongest tool-call reliability we ship.
    pricing: { inputPerMillion: 5, outputPerMillion: 25 },
  },
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 32768,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: true,
    desktopCapable: true,
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
    desktopCapable: true,
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
    desktopCapable: true, // Anthropic Haiku class clears the tool-call reliability bar despite the smaller bracket.
    pricing: { inputPerMillion: 1, outputPerMillion: 5 },
  },
];
