import type { ModelDefinition } from '../../core/types.js';

// As of 2026-04-24, DeepSeek silently remapped the legacy `deepseek-chat`
// and `deepseek-reasoner` endpoint IDs to serve DeepSeek V4 Flash (non-thinking
// and thinking modes respectively) for backward compatibility. Both retire
// on 2026-07-24. Entries below reflect what's actually being served today —
// V4 Flash specs, V4 Flash pricing, V4 Flash context window — not the
// historic V3.2 numbers. Explicit `deepseek-v4-pro` and `deepseek-v4-flash`
// IDs will be added in a follow-up so users can pin the new names directly.
export const DEEPSEEK_MODELS: ModelDefinition[] = [
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
