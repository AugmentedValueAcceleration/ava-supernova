import type { ModelDefinition } from '../../core/types.js';

export const MISTRAL_MODELS: ModelDefinition[] = [
  // Mistral Small 4 (March 2026) — 119B, unifies Magistral (reasoning) +
  // Pixtral (vision) + Devstral (coding) in one weight set. Configurable
  // reasoning, 256K context. Artificial Analysis Intelligence Index 28 —
  // *above* Large 3 (23) at a third of the price. Aurora's high-volume
  // workhorse: chat, intent gate, image-gen orchestration, light specialists.
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
  // Mistral Large 3 (December 2025) — sparse MoE, 41B active / 675B total,
  // 256K context, multimodal (text + image), Apache-2.0. The broadest-
  // knowledge, most-permissive open-weight Mistral — the truest sovereign
  // self-host option. But *non-reasoning*: Artificial Analysis Index 23,
  // below both Medium 3.5 (39) and Small 4 (28). In Aurora it's the heavy
  // reserve / fallback, not a primary route. (A Large 3 reasoning variant
  // is signalled but not yet shipped — revisit when it lands.)
  {
    id: 'mistral-large-3',
    name: 'Mistral Large 3',
    provider: 'mistral',
    contextWindow: 262000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.50, outputPerMillion: 1.50 },
  },
  // Mistral Medium 3.5 (May 2026) — 128B dense, 256K context, vision-capable
  // from-scratch encoder, modified-MIT open weights, configurable reasoning.
  // Mistral's *current frontier flagship*: Artificial Analysis Intelligence
  // Index 39 (#2 of 61), 77.6% SWE-Bench Verified (beats Devstral 2 and
  // Qwen3.5 397B), 91.4 on τ³-Telecom for agentic. The best Mistral model —
  // so it takes Aurora's lead seat: Coordinator + heavy/deep specialists +
  // Builder + vision. The cheaper Small 4 carries volume beneath it.
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
