import type { ModelDefinition } from '../../core/types.js';

export const ZHIPU_MODELS: ModelDefinition[] = [
  {
    // GLM-5.2 (z.ai, June 2026) — open-weights MIT, 1M context, top open-weight
    // coding model. Replaces GLM-5.1 / 5 / 4.7 (same $1.40/$4.40 as old 5.1,
    // 5x the context). API id is the bare `glm-5.2`; the 1M window is built in.
    id: 'glm-5.2',
    name: 'GLM-5.2',
    provider: 'zhipu',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 1.40, outputPerMillion: 4.40 },
  },
  {
    id: 'glm-4.5-air',
    name: 'GLM-4.5 Air',
    provider: 'zhipu',
    contextWindow: 128000,
    maxOutputTokens: 96000,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.20, outputPerMillion: 1.10 },
  },
];
