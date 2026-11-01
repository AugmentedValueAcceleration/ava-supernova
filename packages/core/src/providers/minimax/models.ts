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
  // MiniMax M3.1 Flash (released 2026-10-19) — "ultra-efficient open-weight
  // model for everyday work", 1M context, tunable thinking depth. $0.15/$0.60,
  // no tiers (MiniMax pricing overview, read 2026-11-01). It is where MiniMax
  // itself routes M2.5/M2.7 traffic, so it takes their place here too.
  //
  // supportsVision FALSE on the same asymmetric rule as M2.7 below: the pages
  // call it "multimodal" without saying image input, and the release note says
  // nothing of it. maxOutputTokens is not published for it; M3's figure is used.
  {
    id: 'MiniMax-M3.1-Flash',
    name: 'MiniMax M3.1 Flash',
    provider: 'minimax',
    contextWindow: 1048576,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  },
  // MiniMax M2.7 and M2.7 Highspeed — RETIRED by MiniMax: closed to new users
  // 2026-10-19, shut down 2026-11-18. Rolled forward, not removed (the
  // qwen3.7-max precedent): request-shaping/model-ids sends both ids as
  // MiniMax-M3.1-Flash, so a saved choice keeps working, on a better model for
  // half the price. Hidden from the picker; priced as what is actually called.
  {
    id: 'MiniMax-M2.7',
    name: 'MiniMax M2.7 (now M3.1 Flash)',
    provider: 'minimax',
    contextWindow: 1048576,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60 },
    hiddenFromPicker: true, // retired upstream — routes to MiniMax-M3.1-Flash
  },
  {
    id: 'MiniMax-M2.7-highspeed',
    name: 'MiniMax M2.7 Highspeed (now M3.1 Flash)',
    provider: 'minimax',
    contextWindow: 1048576,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60 },
    hiddenFromPicker: true, // retired upstream — routes to MiniMax-M3.1-Flash
  },
];
