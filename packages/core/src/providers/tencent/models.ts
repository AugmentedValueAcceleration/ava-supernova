import type { ModelDefinition } from '../../core/types.js';

export const TENCENT_MODELS: ModelDefinition[] = [
  {
    // Hunyuan Hy3 preview (Tencent, Apr 2026) — open-weight MoE, 295B total /
    // 21B active, hybrid fast/slow ("thinking") reasoning, built for agentic
    // workflows. OpenAI-compatible via tokenhub.tencentmaas.com, 262K context.
    // Cheap: ~$0.06/$0.21 per M. BYOK.
    id: 'hy3-preview',
    name: 'Hunyuan Hy3',
    provider: 'tencent',
    contextWindow: 262144,
    maxOutputTokens: 32768,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.063, outputPerMillion: 0.210 },
  },
];
