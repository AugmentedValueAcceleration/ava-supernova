import type { ProviderRegistry } from '../providers/provider-registry.js';
import type { Provider } from '../providers/types.js';
import type { ModelDefinition } from '../core/types.js';

/**
 * Coordinator model resolution for Auto Mode.
 *
 * The coordinator is the persistent model that classifies tasks and routes them.
 * It must be the best reasoning model available — not whatever the user has selected.
 *
 * MiniMax is NEVER used as a coordinator — it is reserved exclusively for Creative Studio.
 *
 * Priority (all coordinator-eligible Plus models are 1M context; Flash tiers are 256K).
 * Every plan has access to every model — tier differs by token allowance, not model access.
 *   Platform  → Qwen 3.6 Plus (1M) → Qwen 3.5 Plus (1M) → Qwen 3.5 Flash (256K)
 *   BYOK      → Kimi K2.6 > Opus 4.7 > Sonnet > K2.5 > DeepSeek > GLM-5 > Mistral > Qwen
 *
 * BYOK ordering puts Kimi K2.6 at the top because Ava is an agentic coder first
 * and K2.6 is SoTA on the benchmarks that measure that job:
 *   - SWE-Bench Pro: 58.6 (vs Opus 4.6's 53.4, GPT-5.4's 57.7)
 *   - HLE with tools: 54.0 (leads every frontier model, open or closed)
 *   - LiveCodeBench v6: 89.6 (edges Opus 4.6)
 * Plus it's built for orchestration — scales to 300 sub-agents, 4,000 steps —
 * which is exactly what Auto Mode needs a coordinator to do.
 */

export interface CoordinatorModelResult {
  provider: Provider;
  model: ModelDefinition;
  reason: string;
}

// Ordered by reasoning capability — best first.
// Both Plus tiers are 1M context — no cliff on fallback. MiniMax excluded (creative-only, 200K).
const PLATFORM_PRIORITY = [
  { id: 'qwen3.6-plus',     reason: 'Qwen 3.6 Plus — best agentic coding, 1M context, native function calling' },
  { id: 'qwen3.5-plus',     reason: 'Qwen 3.5 Plus — 1M context fallback conductor' },
  { id: 'qwen3.5-flash',    reason: 'Qwen 3.5 Flash — lightweight fallback' },
];

const BYOK_PRIORITY = [
  { id: 'kimi-k2.6',            reason: 'Kimi K2.6 — SoTA agentic coding (SWE-Bench Pro 58.6), 256K context, built for orchestration' },
  { id: 'claude-opus-4-8',      reason: 'Claude Opus 4.8 — strongest general reasoning' },
  { id: 'claude-sonnet-4-6',    reason: 'Claude Sonnet — fast reasoning' },
  { id: 'kimi-k2.5',            reason: 'Kimi K2.5 — legacy agentic fallback' },
  { id: 'deepseek-v4-pro',      reason: 'DeepSeek V4 Pro — frontier coding + long-context reasoning' },
  { id: 'qwen3.6-plus',         reason: 'Qwen 3.6 Plus — flagship Maestro coordinator: #1 SWE-bench Pro, Terminal-Bench leader, 1M context, reasoning-capable' },
  { id: 'glm-5',                reason: 'Zhipu GLM-5 — 200K context, tools + vision' },
  { id: 'mistral-large-3',      reason: 'Mistral Large 3 — broad-knowledge fallback (non-reasoning today)' },
  { id: 'qwen3.5-plus',         reason: 'Qwen 3.5 Plus — 1M context fallback' },
  { id: 'qwen3.5-flash',        reason: 'Qwen 3.5 Flash — lightweight fallback' },
];

export function resolveCoordinatorModel(
  providerRegistry: ProviderRegistry,
  availableProviders: Set<string>,
  hasPlatform: boolean,
  preferredCoordinatorId?: string,
): CoordinatorModelResult | null {
  // Operator override — if the user has picked a specific coordinator in
  // settings (e.g. "try DeepSeek V4 Pro in Auto Mode" during the admin-
  // gated rollout), honour that choice before falling through to the
  // default priority ladder. Silently falls back if the preferred model
  // isn't actually resolvable (keys missing, not enabled, etc.) so the
  // UI can't lock users out of Auto Mode by setting a stale preference.
  if (preferredCoordinatorId) {
    const resolved = providerRegistry.resolveModel(preferredCoordinatorId);
    if (resolved) {
      return {
        provider: resolved.provider,
        model: resolved.model,
        reason: `${resolved.model.name} — operator-selected coordinator`,
      };
    }
  }

  // Platform users — try platform models first (managed, reliable)
  if (hasPlatform) {
    for (const candidate of PLATFORM_PRIORITY) {
      const resolved = providerRegistry.resolveModel(`platform:${candidate.id}`);
      if (resolved) {
        return { provider: resolved.provider, model: resolved.model, reason: candidate.reason };
      }
    }
  }

  // BYOK users — try each model across available providers
  for (const candidate of BYOK_PRIORITY) {
    // Direct lookup (provider may be implicit)
    const direct = providerRegistry.resolveModel(candidate.id);
    if (direct) {
      return { provider: direct.provider, model: direct.model, reason: candidate.reason };
    }

    // Try with each available provider prefix
    for (const providerName of availableProviders) {
      if (providerName === 'platform') continue; // Already tried above
      const qualified = `${providerName}:${candidate.id}`;
      const resolved = providerRegistry.resolveModel(qualified);
      if (resolved) {
        return { provider: resolved.provider, model: resolved.model, reason: candidate.reason };
      }
    }
  }

  return null;
}
