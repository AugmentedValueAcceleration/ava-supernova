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
    // against api.deepseek.com docs. Server reroutes to qwen3.7-plus
    // when an image is attached. The UI reads this flag to disable the
    // attach button and to strike through the paperclip in the model picker.
    supportsVision: false,
    desktopCapable: true, // V4 Pro = Supernova's coordinator. Frontier tool-call reliability.
    // Artificial Analysis Intelligence Index 52 (median 31).
    //
    // Repriced by DeepSeek on 2026-08-16 16:00 UTC, which also split the
    // tariff by time of day: peak is 01:00-04:00 and 06:00-10:00 UTC, and
    // costs exactly 2× off-peak on every line (in, out and cache).
    //
    //   off-peak  $0.66 in / $1.98 out   (cache hit $0.022)
    //   peak      $1.32 in / $3.96 out   (cache hit $0.044)
    //
    // We record OFF-PEAK because it applies for 17 hours of every 24, and
    // because 97.8% of our measured token spend lands outside the peak
    // window — our users work European daytime, which is DeepSeek's quiet
    // time. A BYOK user in another timezone can pay up to double, so the
    // models page carries the peak rate alongside this one.
    pricing: { inputPerMillion: 0.66, outputPerMillion: 1.98 },
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
    // Off-peak, on the same 2026-08-16 tariff as V4 Pro. Peak doubles it to
    // $0.44/$1.32 between 01:00-04:00 and 06:00-10:00 UTC.
    pricing: { inputPerMillion: 0.22, outputPerMillion: 0.66 },
  },
];
