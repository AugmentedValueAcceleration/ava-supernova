import type { ModelDefinition } from '../../core/types.js';

export const KIMI_MODELS: ModelDefinition[] = [
  {
    // Launched 2026-07-16 — Moonshot's frontier model. 2.8T Stable LatentMoE
    // (16 of 896 experts active), 1M context, native vision (text+image+video).
    // Id and pricing verified against api.moonshot.ai 2026-07-17: listed in
    // GET /v1/models and returns 200 on a live completion.
    //
    // NOT a replacement for K2.7 Code — it's ~3x the price ($3.00/$15.00 vs
    // $0.95/$4.00), so it's the flagship seat and K2.7 Code stays the value
    // agentic coder. Both remain in the picker.
    //
    // On Moonshot's own launch table it beats Opus 4.8 on most agentic rows
    // (Terminal Bench 88.3 vs 84.6, BrowseComp 91.2 vs 84.3, SWE Marathon 42
    // vs 40) at 60% of Opus's price, but loses to Fable 5 on FrontierSWE, HLE
    // and GDPval — including on Moonshot's own Kimi Code Bench. Don't sell it
    // as beating Anthropic outright; it doesn't.
    id: 'kimi-k3',
    name: 'Kimi K3',
    provider: 'kimi',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true, // Frontier agentic model — strongest BYOK option we offer.
    pricing: { inputPerMillion: 3.00, outputPerMillion: 15.00 },
  },
  {
    // Launched 2026-06-12 — Moonshot's newest flagship, "Code"-branded for the
    // first time. 1T MoE / 32B active, 256K context. Pricing verified against
    // the Moonshot API ($0.95 in / $4.00 out, $0.19 cache).
    id: 'kimi-k2.7-code',
    name: 'Kimi K2.7 Code',
    provider: 'kimi',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true, // newest flagship — agentic coding leader
    pricing: { inputPerMillion: 0.95, outputPerMillion: 4.00 },
  },
  {
    id: 'kimi-k2.6',
    name: 'Kimi K2.6',
    provider: 'kimi',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true, // Top BYOK coordinator. SoTA agentic coding tool-calling.
    hiddenFromPicker: true, // superseded by Kimi K2.7 Code — kept for routing/fallback only
    pricing: { inputPerMillion: 0.95, outputPerMillion: 4.00 },
  },
];
