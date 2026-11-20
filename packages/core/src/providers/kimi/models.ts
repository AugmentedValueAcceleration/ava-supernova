import type { ModelDefinition } from '../../core/types.js';

export const KIMI_MODELS: ModelDefinition[] = [
  {
    // Kimi K3.1 Pro (2026-10-23) — a post-trained K3, and Moonshot's flagship
    // since. Id and prices verified on platform.kimi.ai 2026-11-20: $2.00 in /
    // $10.00 out ($0.20 cache) against K3's $3/$15, so better AND cheaper.
    // 1M context, native vision; max_completion_tokens defaults to 131072.
    // Independent rankings put it first among open-weight models (Arena,
    // Agent Arena) and 55 on the Artificial Analysis index, 11 over K3.
    id: 'kimi-k3.1-pro',
    name: 'Kimi K3.1 Pro',
    provider: 'kimi',
    contextWindow: 1000000,
    maxOutputTokens: 131072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 2.00, outputPerMillion: 10.00 },
  },
  {
    // The same model served about 2-3x faster, at double the price ($4/$20,
    // $0.20 cache) — verified on platform.kimi.ai 2026-11-20.
    id: 'kimi-k3.1-pro-highspeed',
    name: 'Kimi K3.1 Pro Highspeed',
    provider: 'kimi',
    contextWindow: 1000000,
    maxOutputTokens: 131072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 4.00, outputPerMillion: 20.00 },
  },
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
    // K2.7 Code and K2.6: closed to new Moonshot accounts since 2026-11-01 and
    // retiring at the end of December 2026 (Moonshot's model list). Rolled
    // forward to K3.1 Pro in model-ids.ts (his call, 20 Nov 2026), so a saved
    // choice keeps working; the entries stay, hidden, so it still resolves,
    // and carry K3.1 Pro's details because that is what they now run on.
    id: 'kimi-k2.7-code',
    name: 'Kimi K2.7 Code (now Kimi K3.1 Pro)',
    provider: 'kimi',
    contextWindow: 1000000,
    maxOutputTokens: 131072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    hiddenFromPicker: true,
    pricing: { inputPerMillion: 2.00, outputPerMillion: 10.00 },
  },
  {
    id: 'kimi-k2.6',
    name: 'Kimi K2.6 (now Kimi K3.1 Pro)',
    provider: 'kimi',
    contextWindow: 1000000,
    maxOutputTokens: 131072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    hiddenFromPicker: true,
    pricing: { inputPerMillion: 2.00, outputPerMillion: 10.00 },
  },
];
