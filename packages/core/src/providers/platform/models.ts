import type { ModelDefinition } from '../../core/types.js';

/**
 * Platform models — available on managed plans.
 * Powered by Qwen (enterprise partnership) + free GLM models.
 * All other models available via BYOK on any plan.
 */
export const PLATFORM_MODELS: ModelDefinition[] = [
  // Qwen — official partner
  {
    id: 'qwen3.5-plus',
    name: 'Qwen 3.5 Plus',
    provider: 'platform',
    contextWindow: 256000,
    maxOutputTokens: 16384,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    pricing: { inputPerMillion: 0.20, outputPerMillion: 1.20 },
  },
  // Free models — always available
  {
    id: 'glm-4.7-flash',
    name: 'GLM-4.7 Flash (Free)',
    provider: 'platform',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
  },
  {
    id: 'glm-4.5-flash',
    name: 'GLM-4.5 Flash (Free)',
    provider: 'platform',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
  },
];
