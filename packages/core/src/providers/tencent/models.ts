import type { ModelDefinition } from '../../core/types.js';

export const TENCENT_MODELS: ModelDefinition[] = [
  {
    // Hunyuan Hy3 (Tencent) — open-weight MoE, 295B total / 21B active, hybrid
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
    name: 'Hunyuan Hy3',
    provider: 'tencent',
    contextWindow: 262144,
    maxOutputTokens: 32768,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.59 },
  },
];
