import type { ModelDefinition } from '../../core/types.js';

export const NVIDIA_MODELS: ModelDefinition[] = [
  {
    // Nemotron 3 Ultra (NVIDIA, 2026) — open-weight MoE, 550B total / 55B
    // active, hybrid Transformer-Mamba. Frontier reasoning + agent
    // orchestration, 1M context, text-only. NVIDIA Open Model License (open
    // weights + data + recipes). BYOK-only — never platform-routed or promoted.
    // Model id matches the NIM / OpenRouter / Together slug.
    id: 'nvidia/nemotron-3-ultra-550b-a55b',
    name: 'Nemotron 3 Ultra',
    provider: 'nvidia',
    contextWindow: 1000000,
    maxOutputTokens: 16384,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.50, outputPerMillion: 2.20 },
  },
  {
    // Nemotron 3.5 Lightning (NVIDIA, 11 Aug 2026) — 30B total / 3B active
    // hybrid LatentMoE (Mamba-2 + MoE + select attention), 1M context,
    // distilled from Nemotron 3 Ultra. Runs on a single H100.
    //
    // Built for the EXECUTION layer rather than the thinking one: tool calls,
    // classification, validation, formatting, retrieval, summarisation. That is
    // the shape of our intent gate, and it is the reason this is interesting
    // beyond being another entry in the list.
    //
    // It is NOT wired into the gate. NVIDIA's throughput claims (~4x similar
    // Qwen models, 30-35% faster than Qwen 3.6 MoE on their own agentic
    // benchmark) are vendor-reported and unverified by anyone else — the same
    // category of claim I would not take at face value from any other lab. The
    // gate is the one seat where we should measure tool-call error rate and P99
    // ourselves before switching.
    //
    // OpenMDW-1.1: weights, TRAINING DATA and recipes, free for commercial use.
    // More open than most of what we ship. BYOK-only.
    //
    // Pricing is the widely published paid rate ($0.05/$0.20 on the DeepInfra
    // route; CoreWeave serves it dearer at $0.10/$0.25, so a user's actual bill
    // depends on who serves them). There is also a genuinely free endpoint,
    // which is an evaluation convenience rather than a production promise —
    // do not quote it as the price.
    id: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    name: 'Nemotron 3.5 Lightning',
    provider: 'nvidia',
    contextWindow: 1000000,
    maxOutputTokens: 24576,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: false,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.05, outputPerMillion: 0.20 },
  },
];
