import type { ModelDefinition } from '../../core/types.js';

export const MISTRAL_MODELS: ModelDefinition[] = [
  // Mistral Large 4 (6 Oct 2026, public preview) — 1.05T MoE, 52B active, 1M
  // context, hybrid instruct + reasoning, native image input, tools. Mistral's
  // named replacement for both Medium 3.5 and Large 3 (each deprecated 31 Oct
  // 2026, switched off 30 Apr 2027). Aurora's lead seat from 2 Nov 2026.
  // Verified live 2 Nov: tool calls return, reasoning tokens are reported, and
  // the API caps a reply at 262,144 tokens. $0.70 / $2.10 per million.
  {
    id: 'mistral-large-4',
    name: 'Mistral Large 4',
    provider: 'mistral',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.70, outputPerMillion: 2.10 },
  },
  // Mistral Small 4 (March 2026) — 119B, unifies Magistral (reasoning) +
  // Pixtral (vision) + Devstral (coding) in one weight set. Configurable
  // reasoning, 256K context. Artificial Analysis Intelligence Index 28 —
  // *above* Large 3 (23) at a third of the price. Aurora's high-volume
  // workhorse: chat, brainstorm, image-gen orchestration, the intent gate.
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
  // DEPRECATED by Mistral 31 Oct 2026, switched off 30 Apr 2027 (replacement:
  // Large 4). Out of Aurora; stays pickable by name until then.
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
  // DEPRECATED by Mistral 31 Oct 2026, switched off 30 Apr 2027 (replacement:
  // Large 4). Out of Aurora; stays pickable by name until then.
  // Mistral Medium 3.5 (May 2026) — 128B dense, 256K context, vision-capable
  // from-scratch encoder, modified-MIT open weights, configurable reasoning.
  // Was Aurora's lead seat until Large 4 replaced it: Artificial Analysis
  // Intelligence Index 39, 77.6% SWE-Bench Verified.
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
  // Codestral + Devstral 2 retired 2026-07-23 (superseded by Mistral Small 4,
  // which unifies Magistral + Pixtral + Devstral in one weight set). Removed
  // from the code registry — the source the extension/IDE BYOK picker actually
  // reads. Setting enabled=false in the DB alone did NOT hide them here.
];
