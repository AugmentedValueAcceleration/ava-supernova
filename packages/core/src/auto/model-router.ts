import type { ProviderRegistry } from '../providers/provider-registry.js';
import type { TaskCategory, RouteResult, UserRoutePreferences } from './types.js';

// ─── Default routing table (platform users with all 3 providers) ─────────────

interface RouteEntry {
  modelId: string;
  reason: string;
  fallbackModelId?: string;
  requiresVision?: boolean;
}

const DEFAULT_ROUTES: Record<TaskCategory, RouteEntry> = {
  coding:       { modelId: 'kimi-k2.5',      reason: 'Best agentic coding — multi-step tool calling', fallbackModelId: 'MiniMax-M2.7' },
  vision:       { modelId: 'kimi-k2.5',      reason: 'Vision-capable with strong reasoning', fallbackModelId: 'qwen3.5-omni-plus', requiresVision: true },
  image_gen:    { modelId: 'MiniMax-M2.5',    reason: 'Image generation handled by generate_image tool' },
  planning:     { modelId: 'MiniMax-M2.7',    reason: 'Strong reasoning, concise output', fallbackModelId: 'qwen3.5-plus' },
  chat:         { modelId: 'MiniMax-M2.5',    reason: 'Coordinator handles directly' },
  long_context: { modelId: 'MiniMax-M2.5',    reason: '1M context window for large codebases', fallbackModelId: 'qwen3.5-plus' },
  teach:        { modelId: 'MiniMax-M2.7',    reason: 'Patient, structured teaching', fallbackModelId: 'qwen3.5-plus' },
  security:     { modelId: 'kimi-k2.5',       reason: 'Thorough tool calling for security audits', fallbackModelId: 'MiniMax-M2.7' },
  brainstorm:   { modelId: 'MiniMax-M2.7',    reason: 'Creative reasoning', fallbackModelId: 'qwen3.5-plus' },
};

/**
 * Routes task categories to the best available model.
 * Respects user overrides, checks provider availability, falls back gracefully.
 */
export class ModelRouter {
  private providerRegistry: ProviderRegistry;
  private availableProviders: Set<string>;
  private hasPlatform: boolean;
  private userPreferences: UserRoutePreferences;

  constructor(
    providerRegistry: ProviderRegistry,
    availableProviders: Set<string>,
    platformKey?: string,
    userPreferences?: UserRoutePreferences,
  ) {
    this.providerRegistry = providerRegistry;
    this.availableProviders = availableProviders;
    this.hasPlatform = !!platformKey || availableProviders.has('platform');
    this.userPreferences = userPreferences || {};
  }

  /**
   * Route a task category to the best available model.
   * Returns null only if no model at all is available (shouldn't happen in practice).
   */
  route(category: TaskCategory, modelOverride?: string): RouteResult | null {
    // 1. Explicit model override from user (e.g. "@kimi")
    if (modelOverride) {
      return this.resolveModel(modelOverride, `User requested ${modelOverride}`);
    }

    // 2. User's per-category preference from settings
    const preferred = this.userPreferences[category];
    if (preferred) {
      const result = this.resolveModel(preferred, `User preference for ${category}`);
      if (result) return result;
      // Preference set but model unavailable — fall through to default
    }

    // 3. Default routing table
    const entry = DEFAULT_ROUTES[category];
    if (!entry) return null;

    // Try primary
    const primary = this.resolveModel(entry.modelId, entry.reason);
    if (primary) {
      // Check vision requirement
      if (entry.requiresVision && !primary.model.supportsVision) {
        // Primary doesn't have vision — try fallback
        if (entry.fallbackModelId) {
          const fallback = this.resolveModel(entry.fallbackModelId, `${entry.reason} (fallback — primary lacks vision)`);
          if (fallback?.model.supportsVision) return fallback;
        }
        // No vision model available — return primary with warning
        return { ...primary, warning: 'No vision-capable model available. Image analysis may be limited.' };
      }
      return primary;
    }

    // Try fallback
    if (entry.fallbackModelId) {
      const fallback = this.resolveModel(entry.fallbackModelId, `${entry.reason} (fallback)`);
      if (fallback) return fallback;
    }

    // Last resort — try any available model
    return this.resolveAnyModel(`No preferred model available for ${category}`);
  }

  /** Check if a category can be routed to any model */
  canRoute(category: TaskCategory): boolean {
    return this.route(category) !== null;
  }

  /** Update user preferences (e.g. from settings change) */
  setPreferences(prefs: UserRoutePreferences): void {
    this.userPreferences = prefs;
  }

  private resolveModel(modelId: string, reason: string): RouteResult | null {
    // Try platform first
    if (this.hasPlatform) {
      const result = this.providerRegistry.resolveModel(`platform:${modelId}`);
      if (result) {
        return { modelId: `platform:${modelId}`, provider: result.provider, model: result.model, reason };
      }
    }

    // Try direct provider
    const result = this.providerRegistry.resolveModel(modelId);
    if (result && this.isProviderAvailable(result.provider.name)) {
      return { modelId, provider: result.provider, model: result.model, reason };
    }

    // Try with provider prefix
    for (const providerName of this.availableProviders) {
      const qualified = `${providerName}:${modelId}`;
      const r = this.providerRegistry.resolveModel(qualified);
      if (r) return { modelId: qualified, provider: r.provider, model: r.model, reason };
    }

    return null;
  }

  private resolveAnyModel(reason: string): RouteResult | null {
    // Platform models (preferred order: coding-capable first)
    if (this.hasPlatform) {
      const platformModels = ['kimi-k2.5', 'MiniMax-M2.7', 'MiniMax-M2.5', 'qwen3.5-omni-plus', 'qwen3-omni-flash'];
      for (const id of platformModels) {
        const result = this.providerRegistry.resolveModel(`platform:${id}`);
        if (result) return { modelId: `platform:${id}`, provider: result.provider, model: result.model, reason };
      }
    }

    // BYOK models (dynamic — try whatever providers are available, best first)
    const byokModels = ['kimi-k2.5', 'claude-sonnet-4-6', 'MiniMax-M2.7', 'deepseek-chat', 'mistral-large-latest', 'qwen3.5-omni-plus', 'qwen3-omni-flash'];
    for (const id of byokModels) {
      const result = this.providerRegistry.resolveModel(id);
      if (result && this.isProviderAvailable(result.provider.name)) {
        return { modelId: id, provider: result.provider, model: result.model, reason };
      }
      // Try with provider prefix
      for (const providerName of this.availableProviders) {
        if (providerName === 'platform') continue;
        const qualified = `${providerName}:${id}`;
        const r = this.providerRegistry.resolveModel(qualified);
        if (r) return { modelId: qualified, provider: r.provider, model: r.model, reason };
      }
    }

    // Last resort — any registered provider's default model
    for (const providerName of this.availableProviders) {
      const result = this.providerRegistry.resolveModel(providerName);
      if (result) return { modelId: result.model.id, provider: result.provider, model: result.model, reason };
    }

    return null;
  }

  private isProviderAvailable(providerName: string): boolean {
    return this.availableProviders.has(providerName) || this.hasPlatform;
  }
}
