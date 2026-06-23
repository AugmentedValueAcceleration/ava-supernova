import type { ModelDefinition } from '../../core/types.js';

export const KIMI_MODELS: ModelDefinition[] = [
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
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    provider: 'kimi',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    hiddenFromPicker: true, // superseded by Kimi K2.7 Code — kept for routing/fallback only
    pricing: { inputPerMillion: 0.60, outputPerMillion: 3.00 },
  },
];
