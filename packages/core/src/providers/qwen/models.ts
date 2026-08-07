import type { ModelDefinition } from '../../core/types.js';

export const QWEN_MODELS: ModelDefinition[] = [
  // Qwen 3.8 Max (3 August 2026) — Alibaba's flagship, and a straight upgrade
  // on 3.7 Max rather than a trade-off: cheaper ($2/$6 vs $2.50/$7.50), double
  // the output ceiling (131,072 vs 65,536), 2.4T MoE / ~95B active, and video
  // in as well as images. Id verified live against DashScope intl — the docs
  // page had not caught up yet, the API had.
  //
  // Still BYOK-first for single-pick, same reasoning as 3.7 Max: $2/$6 does not
  // fit the credit-plan margin as a default. Qwen 3.7 Plus stays the Maestro
  // conductor.
  {
    id: 'qwen3.8-max',
    name: 'Qwen 3.8 Max',
    provider: 'qwen',
    contextWindow: 1000000,
    maxOutputTokens: 131072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 2.00, outputPerMillion: 6.00 },
  },
  // Qwen 3.7 Max (June 2026) — Alibaba's heavy flagship. BYOK-only: exposed
  // for users with their own DashScope key, NOT wired into the Maestro
  // coordinator slot ($2.50/$7.50 would break the credit-plan margin).
  // Qwen 3.7 Plus is the Maestro conductor.
  {
    id: 'qwen3.7-max',
    name: 'Qwen 3.7 Max',
    provider: 'qwen',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 2.50, outputPerMillion: 7.50 },
  },
  // Qwen 3.7 Plus (June 2026) — the Maestro conductor. 1M context, vision +
  // video, reasoning, native function calling. Supersedes Qwen 3.6 Plus and the
  // 3.5 Omni tier: better agentic coding, multimodal, and cheaper ($0.40/$1.60).
  {
    id: 'qwen3.7-plus',
    name: 'Qwen 3.7 Plus',
    provider: 'qwen',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.40, outputPerMillion: 1.60 },
  },
  {
    id: 'qwen3.5-plus',
    name: 'Qwen 3.5 Plus',
    provider: 'qwen',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    hiddenFromPicker: true, // superseded by Qwen 3.7 Plus — kept for routing/fallback only
    pricing: { inputPerMillion: 0.20, outputPerMillion: 1.20 },
  },
  {
    id: 'qwen3.5-flash',
    name: 'Qwen 3.5 Flash',
    provider: 'qwen',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: false,
    supportsVision: false,
    pricing: { inputPerMillion: 0.05, outputPerMillion: 0.40 },
  },
];
