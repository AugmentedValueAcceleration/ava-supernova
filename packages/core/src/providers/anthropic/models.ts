import type { ModelDefinition } from '../../core/types.js';

export const ANTHROPIC_MODELS: ModelDefinition[] = [
  {
    id: 'claude-fable-5',
    name: 'Claude Fable 5',
    provider: 'anthropic',
    contextWindow: 1000000,
    maxOutputTokens: 32768,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: true,
    desktopCapable: true, // Anthropic's Mythos-class flagship (released 2026-06-09).
    // DISABLED 2026-06-14 — pulled over a US-government restriction. Definition
    // kept intact; flip `disabled` back to false (or remove it) to re-enable.
    disabled: true,
    // NOTE Fable 5 API quirks (shared with Opus 4.7/4.8 plus one of its own):
    // adaptive thinking only; temperature/top_p/top_k are rejected (400); an
    // explicit thinking:{type:'disabled'} also 400s — omit the param instead.
    pricing: { inputPerMillion: 10, outputPerMillion: 50 },
  },
  {
    id: 'claude-opus-4-8',
    name: 'Claude Opus 4.8',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 32768,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: true,
    desktopCapable: true, // Current Anthropic flagship.
    // Latest-only policy: superseded Opus versions (4.7, 4.6) are not offered.
    // Confirm pricing against Anthropic's actual 4.8 rates.
    pricing: { inputPerMillion: 5, outputPerMillion: 25 },
  },
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 32768,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: true,
    desktopCapable: true,
    // Released 2026-06. Latest-only policy: supersedes Sonnet 4.6. Adaptive
    // thinking only — rejects temperature/top_p/top_k (see index.ts sampling
    // strip). Standard pricing $3/$15; introductory $2/$10 through 2026-08-31.
    pricing: { inputPerMillion: 3, outputPerMillion: 15 },
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: true,
    desktopCapable: true, // Anthropic Haiku class clears the tool-call reliability bar despite the smaller bracket.
    pricing: { inputPerMillion: 1, outputPerMillion: 5 },
  },
];
