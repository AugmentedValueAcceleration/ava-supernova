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
  // Qwen 3.7 Max was here until 2026-08-09, retired in favour of 3.8 Max.
  // Even on your own key there is no reason to send it: same provider, lower
  // price, higher output ceiling, more capable. The id rolls forward in
  // model-ids.ts so a saved selection keeps working.
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
  {
    // Qwen 3.7 Flash (Jul 2026) — 1M context, multimodal, function calling.
    // Verified against the live DashScope model list, not inferred from a
    // version number.
    //
    // OFFERED, BUT NOT USED AS THE INTENT GATE, and that is deliberate. It is
    // dramatically cheaper than 3.5 Flash on short prompts and dearer on long
    // ones, which is fine for a model somebody chooses. The gate is different:
    // it runs on EVERY request and its whole job is returning a reliable tool
    // call quickly. Reported figures are an ~8.9% tool-call error rate and a
    // P99 above 90 seconds, so it stays out of that seat until we have measured
    // it ourselves.
    //
    // IT REASONS BY DEFAULT, AND YOU PAY FOR IT. A live call asking for the
    // single word "ok" came back with 167 completion tokens, 162 of them
    // reasoning. That is roughly ten times the output a trivial answer needs,
    // billed at the output rate — so the real cost of a short exchange is far
    // above what the per-token price suggests, and it is a second reason the
    // intent gate stays where it is.
    //
    // PRICING IS TIERED BY PROMPT LENGTH and this field is flat, so it cannot
    // be told the whole truth: $0.03/$0.13 under 32K, $0.10/$0.40 to 256K,
    // $0.20/$0.80 to 1M. The middle tier is quoted here because an agentic turn
    // carries a system prompt and context and clears 32K almost immediately —
    // quoting the $0.03 headline would understate nearly every real call, and a
    // cost estimate that flatters us is worse than no estimate.
    id: 'qwen3.7-flash',
    name: 'Qwen 3.7 Flash',
    provider: 'qwen',
    contextWindow: 1000000,
    maxOutputTokens: 32768,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    pricing: { inputPerMillion: 0.10, outputPerMillion: 0.40 },
  },
];
