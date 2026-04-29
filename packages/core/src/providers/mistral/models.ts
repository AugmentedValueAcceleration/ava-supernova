import type { ModelDefinition } from '../../core/types.js';

export const MISTRAL_MODELS: ModelDefinition[] = [
  // Mistral Small 4 (March 2026) — unified Magistral + Pixtral + Devstral
  // merge. Vision-aware, agentic-coding capable, configurable reasoning
  // effort. The model that anchors Aurora's Builder route — frontier
  // capability at flash-tier cost ($0.15/$0.60). Replaces the single-
  // purpose Codestral / Devstral pair for most agentic workloads.
  {
    id: 'mistral-small-4',
    name: 'Mistral Small 4',
    provider: 'mistral',
    contextWindow: 262000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  },
  // Mistral Large 3 (December 2025) — sparse MoE, 41B active / 675B
  // total. Frontier-tier reasoning + long-context synthesis at a price
  // 75% below the legacy Mistral Large. Aurora's Coordinator pick.
  {
    id: 'mistral-large-3',
    name: 'Mistral Large 3',
    provider: 'mistral',
    contextWindow: 262000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.50, outputPerMillion: 1.50 },
  },
  // Mistral Medium 3.5 (April 2026) — 128B dense, 256K context, vision-
  // capable from-scratch encoder, modified-MIT open weights. Mistral's
  // first "merged flagship" combining instruction + reasoning + coding
  // in a single weight set. 77.6% SWE-Bench Verified, beats Devstral 2
  // and Qwen3.5 397B. Designed for long-horizon work — replaces Devstral
  // 2 in Vibe CLI. Aurora's Builder + mid-tier specialist + vision +
  // long-form pick. Sits above Small 4 (light tier) and below Large 3
  // (coordinator + heavy specialists). Three-tier Aurora fleet.
  {
    id: 'mistral-medium-3.5',
    name: 'Mistral Medium 3.5',
    provider: 'mistral',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 1.50, outputPerMillion: 7.50 },
  },
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    provider: 'mistral',
    contextWindow: 262000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 2.00, outputPerMillion: 6.00 },
  },
  {
    id: 'codestral-latest',
    name: 'Codestral',
    provider: 'mistral',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    desktopCapable: true, // Coding-tuned, tool calls solid.
    pricing: { inputPerMillion: 0.30, outputPerMillion: 0.90 },
  },
  {
    id: 'devstral-latest',
    name: 'Devstral 2',
    provider: 'mistral',
    contextWindow: 262000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    desktopCapable: true, // Agentic coding model, tool-call reliable.
    pricing: { inputPerMillion: 0.40, outputPerMillion: 2.00 },
  },
];
