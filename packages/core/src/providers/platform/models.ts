import type { ModelDefinition } from '../../core/types.js';

/**
 * Platform models — available on managed plans + free accounts.
 * Paid plans: Kimi K2.5 (default) + all Qwen models.
 * Free accounts: Qwen only (Omni Flash default).
 */
export const PLATFORM_MODELS: ModelDefinition[] = [
  // Kimi K2.5 — paid plans default. Best agentic coding, multimodal, 256K context.
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    provider: 'platform',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    pricing: { inputPerMillion: 0.60, outputPerMillion: 3.00 },
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
    supportsVision: true,
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
  // Qwen Omni Flash — free accounts default
  {
    id: 'qwen3-omni-flash',
    name: 'Qwen Omni Flash',
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
  // Qwen Flash — fast, lightweight
  {
    id: 'qwen-flash',
    name: 'Qwen Flash',
    provider: 'platform',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.05, outputPerMillion: 0.40 },
  },
];
