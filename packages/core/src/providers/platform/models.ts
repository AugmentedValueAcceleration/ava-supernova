import type { ModelDefinition } from '../../core/types.js';

/**
 * Platform models — available on managed plans + free accounts.
 * Paid plans: Qwen family + the managed coordinators (Supernova/Aurora).
 * Free accounts: Qwen only (Omni Flash default).
 * MiniMax is BYOK only — users supply their own MiniMax API key (see
 *   providers/minimax/models.ts). It carries no managed/platform entry.
 * Kimi is BYOK only — users supply a Moonshot API key to use K2.6 / K2.5.
 */
export const PLATFORM_MODELS: ModelDefinition[] = [
  // Qwen 3.6 Plus — flagship conductor. Agentic coding, 1M context, always-on CoT.
  {
    id: 'qwen3.6-plus',
    name: 'Qwen 3.6 Plus',
    provider: 'platform',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true, // Default Maestro coordinator. Reliable tool calls, fast enough.
    pricing: { inputPerMillion: 0.29, outputPerMillion: 1.70 },
  },
  // Qwen 3.5 Omni Plus — multimodal
  {
    id: 'qwen3.5-omni-plus',
    name: 'Qwen 3.5 Omni Plus',
    provider: 'platform',
    contextWindow: 256000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true, // Multimodal coordinator with reliable tool calls.
    pricing: { inputPerMillion: 0.26, outputPerMillion: 1.56 },
  },
  // Qwen 3.5 Omni Flash — multimodal fast-path (vision + audio).
  // Not desktop-capable: Flash variants drop tool-call args under
  // sequential pressure; fine for chat / single-shot, brittle for the
  // multi-call desktop_* cadence.
  {
    id: 'qwen3.5-omni-flash',
    name: 'Qwen 3.5 Omni Flash',
    provider: 'platform',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: true,
    pricing: { inputPerMillion: 0.065, outputPerMillion: 0.26 },
  },
  // Qwen 3.5 Plus — 1M context
  {
    id: 'qwen3.5-plus',
    name: 'Qwen 3.5 Plus',
    provider: 'platform',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true, // Solid coordinator on the older Qwen line; works.
    pricing: { inputPerMillion: 0.20, outputPerMillion: 1.20 },
  },
  // Qwen 3.5 Flash — fast, lightweight, text-only.
  // Not desktop-capable: same reasoning as Omni Flash above.
  {
    id: 'qwen3.5-flash',
    name: 'Qwen 3.5 Flash',
    provider: 'platform',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: false,
    pricing: { inputPerMillion: 0.05, outputPerMillion: 0.40 },
  },
  // DeepSeek V4 Pro (managed) — admin-gated rollout (migration 218).
  // Frontier open-source coordinator candidate: 1.6T / 49B active per
  // token, SWE-bench Verified 80.6%. Currently only visible to admin
  // accounts; un-gate by flipping admin_only=false in the models table.
  // ID matches the row in the `models` table so server lookups resolve.
  {
    id: 'deepseek-v4-pro-platform',
    name: 'DeepSeek V4 Pro',
    provider: 'platform',
    contextWindow: 1_000_000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false,
    desktopCapable: true, // Supernova coordinator. Frontier tool-call reliability.
    pricing: { inputPerMillion: 1.74, outputPerMillion: 3.48 },
  },
  // DeepSeek V4 Flash (managed) — admin-gated. 284B / 13B active. 1M ctx.
  // Not desktop-capable: Flash bracket on the V4 line, same caution as
  // Qwen Flash family.
  {
    id: 'deepseek-v4-flash-platform',
    name: 'DeepSeek V4 Flash',
    provider: 'platform',
    contextWindow: 1_000_000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false,
    pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  },
  // Mistral Small 4 (managed, platform key) — Aurora's Builder spawn.
  // Unified Magistral + Pixtral + Devstral merge: vision-aware, agentic
  // coding capable, configurable reasoning. Same id pattern as the V4
  // platform entries; ID resolves server-side via /api/chat alias.
  {
    id: 'mistral-small-4-platform',
    name: 'Mistral Small 4',
    provider: 'platform',
    contextWindow: 262_000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  },
  // Mistral Large 3 (managed, platform key) — Aurora's Coordinator.
  // Sparse MoE 41B active / 675B total, frontier reasoning + long
  // context synthesis at competitive pricing.
  {
    id: 'mistral-large-3-platform',
    name: 'Mistral Large 3',
    provider: 'platform',
    contextWindow: 262_000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.50, outputPerMillion: 1.50 },
  },
];
