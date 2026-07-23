import type { ModelDefinition } from '../../core/types.js';
import { LONGXIANG_ENABLED } from '../../auto/longxiang-router.js';

/**
 * Platform models — available on managed plans + free accounts.
 * Paid plans: Qwen family + the managed coordinators (Supernova/Aurora).
 * Free accounts: Qwen only (3.5 Flash default).
 * MiniMax is BYOK only — users supply their own MiniMax API key (see
 *   providers/minimax/models.ts). It carries no managed/platform entry.
 * Kimi: K2.6 / K2.5 / K2.7 Code remain BYOK only. K3 is the exception — it
 *   is served managed as Longxiang's coordinator + Builder seat, so that
 *   fleet is reachable on a plan like every other fleet. Operator decision
 *   2026-07-18, superseding the earlier blanket "Kimi is BYOK-only" position.
 */
/**
 * Kimi K3 as a MANAGED model — Longxiang's lead seat (coordinator AND
 * Builder). 2.8T Stable LatentMoE, 1M context, native vision. The priciest
 * model we serve at $3.00/$15.00, hence the largest credit multiplier in
 * credits.ts (7.28x) — real cost passed through, not margin.
 *
 * Only K3 is promoted to managed; the rest of the Kimi line stays BYOK.
 *
 * GATED on LONGXIANG_ENABLED. A managed K3 exists solely to make Longxiang
 * reachable on a plan, so while the fleet is dark this entry must not exist
 * either — otherwise it is registerable through the provider registry (CLI,
 * IDE sidecar) as a bookable managed model for a fleet nobody can select.
 */
const KIMI_K3_PLATFORM: ModelDefinition = {
  id: 'kimi-k3-platform',
  name: 'Kimi K3',
  provider: 'platform',
  contextWindow: 1000000,
  maxOutputTokens: 8192,
  supportsToolCalls: true,
  supportsStreaming: true,
  supportsThinking: true,
  supportsVision: true,
  desktopCapable: true, // Frontier agentic model — strongest coordinator we serve.
  pricing: { inputPerMillion: 3.00, outputPerMillion: 15.00 },
};

/**
 * Kimi K2.7 Code as a MANAGED single model — a Longxiang fleet member opened
 * for direct credit selection (2026-07-23). 1T MoE / 32B active, 256K context,
 * native vision, agentic-coding leader at $0.95/$4.00. Credit multiplier 1.68×
 * in credits.ts. Unlike K3 this is NOT gated on Longxiang — it stands on its
 * own as a pickable single model, served through the same Moonshot billing
 * path that made K3 managed. The "Kimi is BYOK-only" rule was retired.
 */
const KIMI_K2_7_CODE_PLATFORM: ModelDefinition = {
  id: 'kimi-k2.7-code-platform',
  name: 'Kimi K2.7 Code',
  provider: 'platform',
  contextWindow: 256000,
  maxOutputTokens: 8192,
  supportsToolCalls: true,
  supportsStreaming: true,
  supportsThinking: true,
  supportsVision: true,
  desktopCapable: true, // Agentic-coding leader.
  pricing: { inputPerMillion: 0.95, outputPerMillion: 4.00 },
};

export const PLATFORM_MODELS: ModelDefinition[] = [
  ...(LONGXIANG_ENABLED ? [KIMI_K3_PLATFORM] : []),
  KIMI_K2_7_CODE_PLATFORM,
  // Qwen 3.7 Max — Alibaba's heavy flagship, opened to account credits
  // 2026-07-23 (operator: it's in the Qwen family, price it honestly). Bare id
  // on both surfaces like the rest of Qwen. $2.50/$7.50 = the priciest Qwen we
  // serve → credit multiplier 3.22× in credits.ts. NOT a fleet coordinator; a
  // standalone single pick for users who want the flagship on credits.
  {
    id: 'qwen3.7-max',
    name: 'Qwen 3.7 Max',
    provider: 'platform',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 2.50, outputPerMillion: 7.50 },
  },
  // Qwen 3.7 Plus — flagship Maestro conductor. Agentic coding, 1M context,
  // vision + video, reasoning. Supersedes Qwen 3.6 Plus + the 3.5 Omni tier:
  // better agentic coding, multimodal, and cheaper.
  {
    id: 'qwen3.7-plus',
    name: 'Qwen 3.7 Plus',
    provider: 'platform',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true, // Default Maestro coordinator. Reliable tool calls, sees images natively.
    pricing: { inputPerMillion: 0.40, outputPerMillion: 1.60 },
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
    // Corrected from $1.74/$3.48 (4× too high) — real DeepSeek API rate.
    pricing: { inputPerMillion: 0.435, outputPerMillion: 0.87 },
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
  // Mistral Large 3 (managed, platform key) — Aurora's heavy reserve / fallback.
  // Sparse MoE 41B active / 675B total, broad knowledge + long-context
  // synthesis. Non-reasoning today, so it holds no primary Aurora route.
  {
    id: 'mistral-large-3-platform',
    name: 'Mistral Large 3',
    provider: 'platform',
    contextWindow: 262_000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true, // multimodal (text + image) per the vendor def — was wrongly false here + in the DB
    desktopCapable: true,
    pricing: { inputPerMillion: 0.50, outputPerMillion: 1.50 },
  },
  // Mistral Medium 3.5 (managed, platform key) — Aurora's LEAD seat:
  // coordinator + Builder + vision + the deep specialists. Mistral's frontier
  // flagship (128B dense, 256K, from-scratch vision encoder, configurable
  // reasoning, AA Intelligence Index 39). The Aurora routing table targets
  // this model for every hard/deep route, so it must exist on platform.
  {
    id: 'mistral-medium-3.5-platform',
    name: 'Mistral Medium 3.5',
    provider: 'platform',
    contextWindow: 256_000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 1.50, outputPerMillion: 7.50 },
  },
];
