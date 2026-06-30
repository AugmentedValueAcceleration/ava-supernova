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
];
