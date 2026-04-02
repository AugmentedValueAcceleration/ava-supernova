import type { ProviderRegistry } from '../providers/provider-registry.js';
import type { Provider } from '../providers/types.js';
import type { ModelDefinition } from '../core/types.js';

/**
 * Coordinator model resolution for Auto Mode.
 *
 * The coordinator is the persistent model that classifies tasks and routes them.
 * It must be the best reasoning model available — not whatever the user has selected.
 *
 * Priority:
 *   Platform paid  → Kimi K2.5 (best agentic reasoning)
 *   BYOK multi-key → Best available: Kimi > Claude > MiniMax M2.7 > DeepSeek > Qwen Plus
 *   Platform free  → Qwen Flash (only option)
 *   BYOK single    → Whatever they have
 */

export interface CoordinatorModelResult {
  provider: Provider;
  model: ModelDefinition;
  reason: string;
}

// Ordered by reasoning capability — best first
// Qwen 3.5 Plus is the platform conductor (50% enterprise pricing, best benchmarks)
// Swaps to Qwen 3.6 Plus when approved
const PLATFORM_PRIORITY = [
  { id: 'qwen3.5-omni-plus', reason: 'Qwen 3.5 Plus — best reasoning + vision, enterprise pricing' },
  { id: 'MiniMax-M2.7',      reason: 'MiniMax M2.7 — strong reasoning fallback' },
  { id: 'qwen3-omni-flash',  reason: 'Qwen Flash — free tier default' },
];

const BYOK_PRIORITY = [
  { id: 'claude-sonnet-4-6',    reason: 'Claude Sonnet — strong reasoning' },
  { id: 'claude-opus-4-6',      reason: 'Claude Opus — strongest reasoning' },
  { id: 'kimi-k2.5',            reason: 'Kimi K2.5 — agentic reasoning (BYOK)' },
  { id: 'MiniMax-M2.7',         reason: 'MiniMax M2.7 — strong reasoning' },
  { id: 'deepseek-chat',        reason: 'DeepSeek — capable coding model' },
  { id: 'mistral-large-latest', reason: 'Mistral Large — reasoning fallback' },
  { id: 'qwen3.5-omni-plus',   reason: 'Qwen Plus — capable fallback' },
  { id: 'qwen3-omni-flash',    reason: 'Qwen Flash — lightweight fallback' },
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
