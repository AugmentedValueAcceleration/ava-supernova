import type { ProviderRegistry } from '../providers/provider-registry.js';
import type { TaskCategory, RouteResult, UserRoutePreferences } from './types.js';

// ─── Default routing table (platform users with all 3 providers) ─────────────

interface RouteEntry {
  modelId: string;
  reason: string;
  fallbackModelId?: string;
  requiresVision?: boolean;
}

// All reasoning/coding/planning tasks → Qwen 3.6 Plus (1M context, Terminal-Bench #1)
// MiniMax reserved for creative generation (image/video/music/voice) — added when Creative Studio ships
const DEFAULT_ROUTES: Record<TaskCategory, RouteEntry> = {
  coding:       { modelId: 'qwen3.6-plus',      reason: 'Qwen 3.6 Plus — Terminal-Bench #1, 1M context', fallbackModelId: 'qwen3.5-omni-plus' },
  vision:       { modelId: 'qwen3.6-plus',      reason: 'Qwen 3.6 Plus — vision + reasoning + 1M context', fallbackModelId: 'qwen3.5-omni-plus', requiresVision: true },
  image_gen:    { modelId: 'qwen3.6-plus',      reason: 'Qwen 3.6 Plus — image generation via generate_image tool', fallbackModelId: 'qwen3.5-omni-plus' },
  computer_use: { modelId: 'qwen3.6-plus',      reason: 'Qwen 3.6 Plus — conductor plans, Holo3 executes', fallbackModelId: 'qwen3.5-omni-plus', requiresVision: true },
  planning:     { modelId: 'qwen3.6-plus',      reason: 'Qwen 3.6 Plus — 1M context for architecture + planning', fallbackModelId: 'qwen3.5-omni-plus' },
  chat:         { modelId: 'qwen3.6-plus',      reason: 'Qwen 3.6 Plus — conversational with full context', fallbackModelId: 'qwen3.5-flash' },
  long_context: { modelId: 'qwen3.6-plus',      reason: 'Qwen 3.6 Plus — 1M context', fallbackModelId: 'qwen3.5-omni-plus' },
  teach:        { modelId: 'qwen3.6-plus',      reason: 'Qwen 3.6 Plus — patient structured teaching', fallbackModelId: 'qwen3.5-omni-plus' },
  security:     { modelId: 'qwen3.6-plus',      reason: 'Qwen 3.6 Plus — security analysis with full codebase context', fallbackModelId: 'qwen3.5-omni-plus' },
  brainstorm:   { modelId: 'qwen3.6-plus',      reason: 'Qwen 3.6 Plus — creative reasoning with 1M context', fallbackModelId: 'qwen3.5-omni-plus' },
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
      // MiniMax excluded from reasoning fallback — reserved for creative generation
      const platformModels = ['qwen3.6-plus', 'qwen3.5-omni-plus', 'qwen3.5-omni-flash', 'qwen3.5-flash', 'kimi-k2.5'];
      for (const id of platformModels) {
        const result = this.providerRegistry.resolveModel(`platform:${id}`);
        if (result) return { modelId: `platform:${id}`, provider: result.provider, model: result.model, reason };
      }
    }

    // BYOK models (dynamic — try whatever providers are available, best first)
    // MiniMax excluded — reserved for creative generation only
    const byokModels = ['kimi-k2.5', 'claude-sonnet-4-6', 'deepseek-chat', 'mistral-large-latest', 'qwen3.5-omni-plus', 'qwen3.5-omni-flash', 'qwen3.5-flash'];
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
