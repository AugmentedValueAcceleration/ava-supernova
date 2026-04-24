import type { ModelDefinition } from '../../core/types.js';

/**
 * Platform models — available on managed plans + free accounts.
 * Paid plans: Qwen family + MiniMax creative stack.
 * Free accounts: Qwen only (Omni Flash default).
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
    pricing: { inputPerMillion: 0.29, outputPerMillion: 1.70 },
  },
  // MiniMax M2.7 — self-evolving, premium reasoning, fewer hallucinations
  {
    id: 'MiniMax-M2.7',
    name: 'MiniMax M2.7',
    provider: 'platform',
    contextWindow: 204800,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false,
    pricing: { inputPerMillion: 0.30, outputPerMillion: 1.20 },
  },
  // MiniMax M2.5 — best tool calling, cheapest agentic model
  {
    id: 'MiniMax-M2.5',
    name: 'MiniMax M2.5',
    provider: 'platform',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: false,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 1.20 },
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
    pricing: { inputPerMillion: 0.26, outputPerMillion: 1.56 },
  },
  // Qwen 3.5 Omni Flash — multimodal fast-path (vision + audio)
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
    pricing: { inputPerMillion: 0.20, outputPerMillion: 1.20 },
  },
  // Qwen 3.5 Flash — fast, lightweight, text-only
  {
    id: 'qwen3.5-flash',
    name: 'Qwen 3.5 Flash',
    provider: 'platform',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
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
    pricing: { inputPerMillion: 1.74, outputPerMillion: 3.48 },
  },
  // DeepSeek V4 Flash (managed) — admin-gated. 284B / 13B active. 1M ctx.
  {
    id: 'deepseek-v4-flash-platform',
    name: 'DeepSeek V4 Flash',
    provider: 'platform',
    contextWindow: 1_000_000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  },
];
