import type { ModelDefinition } from '../../core/types.js';

// DeepSeek V4 preview launched 2026-04-24 as two open-weight MIT-licensed
// MoE variants. Both support 1M context, dual thinking/non-thinking modes,
// native OpenAI + Anthropic API compat.
//
// Legacy aliases `deepseek-chat` and `deepseek-reasoner` (V3.2 / R1) are
// deliberately NOT exposed: DeepSeek retires them on 2026-07-24, and
// today they silently route to V4 Flash anyway. Users pick V4 Pro or V4
// Flash directly so they're not on a deprecating ID surface.
export const DEEPSEEK_MODELS: ModelDefinition[] = [
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    contextWindow: 1_000_000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    // Text-only at the API level despite multimodal training — verified
    // against api.deepseek.com docs. Server reroutes to qwen3.5-omni-plus
    // when an image is attached; the UI uses this flag to gate the attach
    // button + show a "text only" badge in the picker.
    supportsVision: false,
    desktopCapable: true, // V4 Pro = Supernova's coordinator. Frontier tool-call reliability.
    pricing: { inputPerMillion: 1.74, outputPerMillion: 3.48 },
  },
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    contextWindow: 1_000_000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false,
    pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  },
];
