import type { ModelDefinition } from '../../core/types.js';

// BYOK only — users supply their own MiniMax API key. The managed/platform
// catalog carries no MiniMax models; on our stack MiniMax is bring-your-own-key.
export const MINIMAX_MODELS: ModelDefinition[] = [
  // MiniMax M3 — flagship (launched 2026-06-01). First open-weight model to
  // combine frontier coding, 1M context, and native multimodality (text/image/
  // video in). MiniMax Sparse Attention (MSA) for cheap long-context. Pricing
  // is the standard ≤512k rate; a launch promo halves it for the first 7 days.
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
    pricing: { inputPerMillion: 0.60, outputPerMillion: 2.40 },
  },
];
