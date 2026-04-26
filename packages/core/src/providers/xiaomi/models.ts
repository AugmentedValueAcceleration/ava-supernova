import type { ModelDefinition } from '../../core/types.js';

// Xiaomi MiMo V2.5 family. Released 2026-04-22. Frontier-class open
// MoE (1T total / 42B active) matching Claude Sonnet 4.6 on agentic
// multimodal benchmarks and Gemini 3 Pro on Video-MME (87.7 vs 88.4).
// 1M context, sustains 1,000+ sequential tool calls — the use case
// pitch is long-running agents.
//
// BYOK only on Ava. DashScope-style pricing; endpoint base URL is
// https://api.mimo.xiaomi.com/v1 (OpenAI-compatible).
export const XIAOMI_MODELS: ModelDefinition[] = [
  {
    id: 'mimo-v2.5-pro',
    name: 'MiMo V2.5-Pro',
    provider: 'xiaomi',
    contextWindow: 1_048_576,
    maxOutputTokens: 131_072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true, // Long-running-agent MoE — Xiaomi specifically pitched 1,000+ sequential tool calls.
    pricing: { inputPerMillion: 1.00, outputPerMillion: 3.00 },
  },
  {
    id: 'mimo-v2.5',
    name: 'MiMo V2.5',
    provider: 'xiaomi',
    contextWindow: 1_048_576,
    maxOutputTokens: 131_072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: false,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.40, outputPerMillion: 2.00 },
  },
];
