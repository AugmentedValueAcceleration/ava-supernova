import type { ProviderRegistry } from '../providers/provider-registry.js';
import type { Provider } from '../providers/types.js';
import type { ModelDefinition } from '../core/types.js';

/**
 * Coordinator model resolution for Auto Mode.
 *
 * The coordinator is the persistent model that classifies tasks and routes them.
 * It must be the best reasoning model available — not whatever the user has selected.
 *
 * MiniMax is NEVER used as a coordinator — it is BYOK chat only (M3), not an orchestration model.
 *
 * Priority (all coordinator-eligible Plus models are 1M context; Flash tiers are 256K).
 * Every plan has access to every model — tier differs by token allowance, not model access.
 *   Platform  → Qwen 3.8 Flash (1M) → Qwen 3.7 Plus (1M) → Qwen 3.5 Flash (256K)
 *   BYOK      → Kimi K3 > K2.7 Code > K2.6 > DeepSeek > Qwen 3.7 Plus > GLM-5.3
 *               > Mistral Large 3 > Qwen 3.8 Flash > Qwen 3.5 Flash
 *
 * Both lines above were wrong until 2026-10-07 and contradicted the arrays
 * directly beneath them: the platform ladder still led with 3.7 Plus (3.8 Flash
 * took the seat on 6 Oct) and still listed 3.5 Plus (off the ladder since 10
 * Sep), while the BYOK line named Opus 4.8 and Sonnet — models removed from
 * the product entirely on 13 Aug. A comment that names a model we do not sell
 * is worse than no comment.
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


const BYOK_PRIORITY = [
  // K3 leads this list on merit as well as by default: Moonshot's launch table
  // put it ahead on agentic work (Terminal Bench 88.3, BrowseComp 91.2) at a
  // fraction of closed-frontier pricing.
  { id: 'kimi-k3',              reason: 'Kimi K3 — Moonshot frontier model, 2.8T MoE, 1M context, leads agentic + browsing benchmarks' },
  { id: 'kimi-k2.7-code',       reason: 'Kimi K2.7 Code — Moonshot flagship agentic coder, ~30% fewer reasoning tokens than K2.6, 256K context' },
  { id: 'kimi-k2.6',            reason: 'Kimi K2.6 — agentic coding fallback (SWE-Bench Pro 58.6), 256K context' },
  { id: 'deepseek-flash',      reason: 'DeepSeek V4.1 Flash — frontier coding + long-context reasoning' },
  { id: 'qwen3.7-plus',         reason: 'Qwen 3.7 Plus — #1 SWE-bench Pro, Terminal-Bench leader, 1M context, reasoning-capable' },
  // 'tools + vision' stood here for six weeks after the catalogue was
  // corrected on 2026-07-17: the GLM main line cannot see. Gone with 5.2.
  { id: 'glm-5.3',              reason: 'Zhipu GLM-5.3 — open-weights, 1M context, tools + thinking (text only)' },
  { id: 'mistral-large-3',      reason: 'Mistral Large 3 — broad-knowledge fallback (non-reasoning today)' },
  { id: 'qwen3.8-flash',        reason: 'Qwen 3.8 Flash — 1M context, multimodal, newer generation at flash cost' },
  { id: 'qwen3.5-flash',        reason: 'Qwen 3.5 Flash — lightweight fallback' },
];

export function resolveCoordinatorModel(
  providerRegistry: ProviderRegistry,
  availableProviders: Set<string>,
  preferredCoordinatorId?: string,
): CoordinatorModelResult | null {
  // Operator override — if the user has picked a specific coordinator in
  // settings (e.g. "try DeepSeek Flash in Auto Mode" during the admin-
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

  // Try each model across the providers the user holds keys for
  for (const candidate of BYOK_PRIORITY) {
    // Direct lookup (provider may be implicit)
    const direct = providerRegistry.resolveModel(candidate.id);
    if (direct) {
      return { provider: direct.provider, model: direct.model, reason: candidate.reason };
    }

    // Try with each available provider prefix
    for (const providerName of availableProviders) {
      const qualified = `${providerName}:${candidate.id}`;
      const resolved = providerRegistry.resolveModel(qualified);
      if (resolved) {
        return { provider: resolved.provider, model: resolved.model, reason: candidate.reason };
      }
    }
  }

  return null;
}
