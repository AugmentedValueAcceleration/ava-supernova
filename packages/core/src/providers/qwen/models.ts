import type { ModelDefinition } from '../../core/types.js';

export const QWEN_MODELS: ModelDefinition[] = [
  // Qwen 4 Max (`qwen4-max`, Model Studio "latest model", pages updated 16–18
  // Nov 2026) — Alibaba's flagship, and cheaper than the 3.8 Max it replaces:
  // $1.50/$4.50 against $2/$6 (Singapore / international, thinking and
  // non-thinking alike, one tier to 1M). 1M context; 131,072 output, 262,144
  // when thinking. Text, image and video in; function calling, thinking,
  // structured output, explicit + implicit cache ($0.075 per 1M cache hit).
  // Read from alibabacloud.com/help/en/model-studio/qwen4-max and
  // /model-pricing, 19 Nov 2026. Alibaba published no benchmarks for it.
  //
  // In Maestro (his call, 19 Nov): the deep-work fallback, and the lead seat
  // for planning and security — low-volume, think-hard work. Coding stays on
  // 3.7 Plus until 4 Max is measured on our own traffic (3–4x the price on the
  // highest-volume seat needs proof first).
  {
    id: 'qwen4-max',
    name: 'Qwen 4 Max',
    provider: 'qwen',
    contextWindow: 1000000,
    maxOutputTokens: 131072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 1.50, outputPerMillion: 4.50 },
  },
  // Qwen 3.8 Max — RETIRED 19 Nov 2026 in favour of Qwen 4 Max (his call):
  // newer, cheaper ($1.50/$4.50 against $2/$6), same context and output.
  // Rolled forward, not removed (the qwen3.7-max precedent): model-ids sends
  // it as qwen4-max, so a saved choice keeps working. Hidden from the picker;
  // priced and described as what is actually called.
  {
    id: 'qwen3.8-max',
    name: 'Qwen 3.8 Max (now Qwen 4 Max)',
    provider: 'qwen',
    contextWindow: 1000000,
    maxOutputTokens: 131072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    hiddenFromPicker: true,
    pricing: { inputPerMillion: 1.50, outputPerMillion: 4.50 },
  },
  // Qwen 3.7 Max was here until 2026-08-09, retired in favour of 3.8 Max.
  // Even on your own key there is no reason to send it: same provider, lower
  // price, higher output ceiling, more capable. The id rolls forward in
  // model-ids.ts so a saved selection keeps working.
  // Qwen 3.7 Plus (June 2026) — the Maestro conductor. 1M context, vision +
  // video, reasoning, native function calling. Supersedes Qwen 3.6 Plus and the
  // 3.5 Omni tier: better agentic coding, multimodal, and cheaper ($0.40/$1.60).
  // Qwen 3.8 Flash (production build of Flash-Next, August 2026) - 1M context,
  // 131K max output, multimodal INCLUDING VIDEO, native tool calling.
  //
  // It is not a cheaper 3.7 Plus. Flash-Next is Qwen's early preview of the
  // Qwen4 architecture, so this is a newer generation arriving in the flash
  // line first: 180B total with 6B active. It beats 3.7 Plus on SWE-bench Pro
  // (62.5 vs 55.8) and on CoWorkBench and LiveCodeBench v6, and sits level on
  // GPQA, MMLU and MATH - better where it matters for agentic work, no worse
  // anywhere found.
  //
  // NOTE those figures are published for Flash-Next, the open-weight preview.
  // Alibaba have not published a separate table for this production id. Close
  // enough to route vision on; not close enough to move the Builder seat
  // without measuring our own traffic first.
  {
    id: 'qwen3.8-flash',
    name: 'Qwen 3.8 Flash',
    provider: 'qwen',
    contextWindow: 1000000,
    maxOutputTokens: 131072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.47 },
  },
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
  // Qwen 3.5 Plus and 3.5 Flash — RETIRED 19 Nov 2026 (his call): Alibaba's
  // current model list no longer carries either, and Maestro still leaned on
  // them as fallbacks, which would fail exactly when needed if Alibaba
  // switched them off. Rolled forward like 3.8 Max: model-ids sends 3.5 Plus
  // as 3.7 Plus and 3.5 Flash as 3.8 Flash, so a saved choice keeps working.
  // Hidden; priced and described as what is actually called. No route,
  // ladder or gate names them any more.
  {
    id: 'qwen3.5-plus',
    name: 'Qwen 3.5 Plus (now Qwen 3.7 Plus)',
    provider: 'qwen',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    hiddenFromPicker: true,
    pricing: { inputPerMillion: 0.40, outputPerMillion: 1.60 },
  },
  {
    id: 'qwen3.5-flash',
    name: 'Qwen 3.5 Flash (now Qwen 3.8 Flash)',
    provider: 'qwen',
    contextWindow: 1000000,
    maxOutputTokens: 131072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    hiddenFromPicker: true,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.47 },
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
  {
    // Qwen3 Coder Next — the coder tier we did not have. Ava is an agentic
    // coding tool that shipped exactly ONE coder-specialised model, while these
    // sat on an endpoint we already call with a key we already hold.
    //
    // 80B total, 3B active, so it prices like a small model and scores like a
    // large one: 70.6% SWE-bench Verified at $0.12/$0.80 — against kimi-k2.7-code
    // at $0.95/$4.00 for the same class of work. Native 256K.
    //
    // Verified live before shipping: it answers, and it does NOT burn reasoning
    // tokens on trivial replies (2 completion tokens for "ok", where Qwen 3.7
    // Flash spent 167).
    //
    // RETIRED upstream (found 28 Nov 2026: Alibaba answers 404 "Model not
    // exist" and it is gone from the model list). Hidden from the pickers; a
    // saved choice rolls forward to Qwen 3.7 Plus, Maestro's own coding seat
    // (MODEL_API_NAMES, his call 28 Nov 2026).
    id: 'qwen3-coder-next',
    name: 'Qwen3 Coder Next (now Qwen 3.7 Plus)',
    provider: 'qwen',
    // Priced and described as what is actually called (the qwen3.8-max rule).
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    hiddenFromPicker: true,
    pricing: { inputPerMillion: 0.40, outputPerMillion: 1.60 },
  },
  {
    // Qwen3 Coder Flash — 1M context, tool-calling coder.
    //
    // The name is misleading and it is worth saying so here rather than letting
    // somebody assume: this is DEARER than Coder Next ($0.195/$0.975 against
    // $0.12/$0.80), not cheaper. What it buys is the 1M context window, which
    // Coder Next does not have. Pick it for context length, never for price.
    id: 'qwen3-coder-flash',
    name: 'Qwen3 Coder Flash',
    provider: 'qwen',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: false,
    supportsVision: false,
    pricing: { inputPerMillion: 0.195, outputPerMillion: 0.975 },
  },
];
