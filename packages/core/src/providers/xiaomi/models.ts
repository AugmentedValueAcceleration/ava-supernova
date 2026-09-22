import type { ModelDefinition } from '../../core/types.js';

// Xiaomi MiMo V2.6 family. Released 2026-09-21, MIT open weights.
// Pro is 1.02T parameters, Flash 309B; both are full-modality (text,
// image, video and audio in) with a 1M context and 128K output, and both
// are pitched at long-horizon agentic work. UltraSpeed is the same Pro
// served up to 20x faster, at ten times the price — for the cases where
// latency is the product.
//
// V2.5 (2026-04-22) is retired: it is no longer listed, and its rates
// stay in audit/cost.ts only so old receipts still cost out.
//
// BYOK only on Ava. OpenAI-compatible; base URL https://api.xiaomimimo.com/v1
// (api.mimo.xiaomi.com does NOT resolve — see index.ts).
export const XIAOMI_MODELS: ModelDefinition[] = [
  {
    id: 'mimo-v2.6-pro',
    name: 'MiMo V2.6-Pro',
    provider: 'xiaomi',
    contextWindow: 1_048_576,
    maxOutputTokens: 131_072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true, // Long-horizon agentic MoE, as V2.5 was.
    pricing: { inputPerMillion: 0.435, outputPerMillion: 0.87 },
  },
  {
    id: 'mimo-v2.6-flash',
    name: 'MiMo V2.6-Flash',
    provider: 'xiaomi',
    contextWindow: 1_048_576,
    maxOutputTokens: 131_072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  },
  {
    id: 'mimo-v2.6-pro-ultraspeed',
    name: 'MiMo V2.6-Pro UltraSpeed',
    provider: 'xiaomi',
    contextWindow: 1_048_576,
    maxOutputTokens: 131_072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 4.35, outputPerMillion: 8.70 },
  },
];
