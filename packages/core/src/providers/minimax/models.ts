import type { ModelDefinition } from '../../core/types.js';

// BYOK only — users supply their own MiniMax API key. The managed/platform
// catalog carries no MiniMax models; on our stack MiniMax is bring-your-own-key.
export const MINIMAX_MODELS: ModelDefinition[] = [
  // MiniMax M3 — flagship (launched 2026-06-01). First open-weight model to
  // combine frontier coding, 1M context, and native multimodality (text/image/
  // video in). MiniMax Sparse Attention (MSA) for cheap long-context.
  //
  // Pricing verified against MiniMax's pay-as-you-go page 2026-07-17. M3 is
  // TIERED and this field is not: ≤512k is $0.30/$1.20, >512k is $0.60/$2.40.
  // We quote the ≤512k rate, matching how qwen3.7-plus stores its base tier —
  // so a turn over 512k costs 2x what's shown here.
  //
  // The old $0.60/$2.40 was MiniMax's struck-through LIST price, carried with a
  // comment saying the discount was a 7-day launch promo. MiniMax now labels it
  // "Permanent 50% off", so we were over-quoting M3 by 2x.
  {
    id: 'MiniMax-M3',
    name: 'MiniMax M3',
    provider: 'minimax',
    contextWindow: 1048576,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    pricing: { inputPerMillion: 0.30, outputPerMillion: 1.20 },
  },
  // MiniMax M2.7 — still current upstream (MiniMax lists it in the live pricing
  // table, not the Legacy section alongside M2.5/M2.1/M2), superseded as
  // flagship by M3 rather than retired. 204,800 context.
  //
  // supportsVision is FALSE deliberately, not by omission: MiniMax documents
  // neither vision nor its absence for M2.7, and the launch post describes only
  // text tasks. An unverified `true` makes Ava offer to read an image she can't
  // see; a wrong `false` only shows a struck camera we can lift once we know.
  // Guessing wrong is asymmetric — take the recoverable side.
  {
    id: 'MiniMax-M2.7',
    name: 'MiniMax M2.7',
    provider: 'minimax',
    contextWindow: 204800,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false,
    pricing: { inputPerMillion: 0.30, outputPerMillion: 1.20 },
  },
  // The fast tier — same model and context, served hot at 2x the price. Same
  // role Qwen/GLM Flash play for their providers: reach for it when latency
  // matters more than cost.
  {
    id: 'MiniMax-M2.7-highspeed',
    name: 'MiniMax M2.7 Highspeed',
    provider: 'minimax',
    contextWindow: 204800,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false,
    pricing: { inputPerMillion: 0.60, outputPerMillion: 2.40 },
  },
];
