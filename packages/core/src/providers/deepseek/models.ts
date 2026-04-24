import type { ModelDefinition } from '../../core/types.js';

// DeepSeek V4 preview launched 2026-04-24 as two open-weight MIT-licensed
// MoE variants. Both support 1M context, dual thinking/non-thinking modes,
// native OpenAI + Anthropic API compat. The legacy `deepseek-chat` and
// `deepseek-reasoner` aliases below now route to V4 Flash under the hood
// (for backward compat; retire 2026-07-24). The explicit `deepseek-v4-pro`
// and `deepseek-v4-flash` IDs are the canonical way to pin either variant
// going forward.
export const DEEPSEEK_MODELS: ModelDefinition[] = [
  // ── Explicit V4 IDs (pin these going forward) ─────────────────────
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    contextWindow: 1_000_000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
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
    pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  },
  // ── Legacy aliases — currently backed by V4 Flash, retire 2026-07-24 ─
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V4 Flash (legacy id)',
    provider: 'deepseek',
    contextWindow: 1_000_000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek V4 Flash Thinking (legacy id)',
    provider: 'deepseek',
    contextWindow: 1_000_000,
    maxOutputTokens: 64000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  },
];
