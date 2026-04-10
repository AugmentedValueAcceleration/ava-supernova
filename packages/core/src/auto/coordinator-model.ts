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
 * Priority (all coordinator-eligible models must be 1M context to avoid fallback cliffs):
 *   Platform paid  → Qwen 3.6 Plus (1M) → Qwen 3.5 Plus (1M)
 *   Platform free  → Qwen Omni Flash
 *   BYOK           → Claude > Kimi > DeepSeek > Mistral > Qwen Plus > Qwen Flash
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
  { id: 'qwen3-omni-flash', reason: 'Qwen Omni Flash — free tier default' },
];

const BYOK_PRIORITY = [
  { id: 'claude-sonnet-4-6',    reason: 'Claude Sonnet — strong reasoning' },
  { id: 'claude-opus-4-6',      reason: 'Claude Opus — strongest reasoning' },
  { id: 'kimi-k2.5',            reason: 'Kimi K2.5 — agentic reasoning (BYOK)' },
  { id: 'deepseek-chat',        reason: 'DeepSeek — capable coding model' },
  { id: 'mistral-large-latest', reason: 'Mistral Large — reasoning fallback' },
  { id: 'qwen3.5-plus',         reason: 'Qwen 3.5 Plus — 1M context fallback' },
  { id: 'qwen3-omni-flash',     reason: 'Qwen Omni Flash — lightweight fallback' },
];

export function resolveCoordinatorModel(
  providerRegistry: ProviderRegistry,
  availableProviders: Set<string>,
  hasPlatform: boolean,
): CoordinatorModelResult | null {
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
