import type { ModelDefinition } from '../../core/types.js';

export const TENCENT_MODELS: ModelDefinition[] = [
  {
    // Hunyuan Hy4 (2026-11-04) — Tencent's flagship: 774B MoE / 49B active,
    // 1M context (960K in / 64K out), vision, reasoning, tool calls. Id and
    // list price verified on Tencent Cloud's TokenHub model list and pricing
    // pages (updated 2026-11-16/19): $0.834 in / $2.501 out ($0.042 cache).
    // Half price until 31 Dec 2026; we record the list price, as the
    // discount ends. Same `thinking` / `reasoning_effort` controls as Hy3.
    id: 'hy4',
    name: 'Hunyuan Hy4',
    provider: 'tencent',
    contextWindow: 1048576,
    maxOutputTokens: 64000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.834, outputPerMillion: 2.501 },
  },
  {
    // Hunyuan Hy4 Flash (2026-11-16) — 220B MoE / 12B active, same 1M context
    // and vision, at $0.07 in / $0.281 out ($0.003 cache) list — about half
    // what Hy3 cost. Half price until 30 Nov 2026; list price recorded.
    id: 'hy4-flash',
    name: 'Hunyuan Hy4 Flash',
    provider: 'tencent',
    contextWindow: 1048576,
    maxOutputTokens: 64000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.07, outputPerMillion: 0.281 },
  },
  {
    // Hy3 is still served, but Hy4 replaces it here (his call, 20 Nov 2026):
    // rolled forward to Hy4 — the like-for-like flagship step — in
    // model-ids.ts, so a saved choice keeps working. Kept hidden so the id
    // still resolves, with Hy4's details since that is what it now runs on.
    //
    // History — Hunyuan Hy3 (Tencent) (Tencent) — open-weight MoE, 295B total / 21B active, hybrid
    // fast/slow ("thinking") reasoning, built for agentic workflows. 256K
    // context, OpenAI-compatible via TokenHub's international endpoint.
    //
    // GA since 2026-07-06 under a genuine Apache 2.0 licence with no
    // territorial restriction, replacing the April preview we shipped until
    // now — Tencent cite better stability and cost efficiency over it.
    //
    // The id is the TokenHub one. Tencent's own docs also publish
    // `hunyuan-hy3`, which is the NATIVE Hunyuan API id and wrong for this
    // gateway; the two are easy to confuse and only one of them answers here.
    //
    // Pricing is Tencent's published GA rate (RMB 1 / RMB 4 per M), not the
    // preview's, which was roughly a third of it.
    id: 'hy3',
    name: 'Hunyuan Hy3 (now Hy4)',
    provider: 'tencent',
    contextWindow: 1048576,
    maxOutputTokens: 64000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    hiddenFromPicker: true,
    pricing: { inputPerMillion: 0.834, outputPerMillion: 2.501 },
  },
];
