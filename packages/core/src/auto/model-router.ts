import type { ProviderRegistry } from '../providers/provider-registry.js';
import type { TaskCategory, RouteResult, UserRoutePreferences } from './types.js';
import { SUPERNOVA_ROUTES } from './supernova-router.js';
import { AURORA_ROUTES } from './aurora-router.js';

export type RoutingMode = 'auto' | 'supernova' | 'aurora';

// ─── Default routing table (platform users with all 3 providers) ─────────────

interface RouteEntry {
  modelId: string;
  reason: string;
  fallbackModelId?: string;
  requiresVision?: boolean;
  /**
   * Used by the `teach` category. When the upstream Flash gate
   * (`classifyTeachDepth`) reports `depth: 'full'` — i.e. the user is
   * creating a new curriculum — the router upgrades to this model
   * instead of the standard `modelId`. Curriculum creation runs the full
   * 5-persona team (Architect → Writer → Fact Checker → Quiz Master →
   * Tutor) and benefits from the coordinator-tier model; delivery turns
   * are Tutor-only and stay on the cheaper teach-tier model. Optional
   * everywhere; only set on the `teach` entry of each routing table.
   */
  creationModelId?: string;
}

// Maestro routing — Qwen-only, tier-differentiated by task. Heavy reasoning
// and long-context work go to Qwen 3.6 Plus (#1 on SWE-bench Pro, Terminal-
// Bench 2.0, SkillsBench as of 2026-04-20). Light orchestration / chat go to
// Qwen 3.5 Flash. Vision-input tasks land on Qwen 3.5 Omni Plus — the dedicated
// vision+audio specialist. (Qwen 3.6 Plus is ALSO vision-capable; the Omni tier
// is under modernisation review vs the newer Qwen 3.6 Flash.)
// MiniMax reserved for creative generation (image/video/music/voice).
const DEFAULT_ROUTES: Record<TaskCategory, RouteEntry> = {
  coding:       { modelId: 'qwen3.6-plus',      reason: 'Qwen 3.6 Plus — #1 SWE-bench Pro + Terminal-Bench 2.0, 1M context', fallbackModelId: 'qwen3.5-plus' },
  // Vision needs an actually vision-capable Qwen — Omni Plus is the only one.
  vision:       { modelId: 'qwen3.5-omni-plus', reason: 'Qwen 3.5 Omni Plus — dedicated vision + audio multimodal specialist', fallbackModelId: 'qwen3.5-omni-flash', requiresVision: true },
  // image_gen orchestrates the generate_image tool call to Wan/MiniMax —
  // no agentic depth needed at this layer. Flash is ~6× cheaper.
  image_gen:    { modelId: 'qwen3.5-flash',     reason: 'Qwen 3.5 Flash — orchestrates generate_image tool calls; depth not required at this layer', fallbackModelId: 'qwen3.5-omni-plus' },
  // computer_use route retired alongside the Holo3 integration.
  planning:     { modelId: 'qwen3.6-plus',      reason: 'Qwen 3.6 Plus — 1M context for architecture + planning depth', fallbackModelId: 'qwen3.5-plus' },
  // Chat = direct conversational response. Flash's $0.05/$0.40 pricing and
  // faster TTFT are right for typical chat turns; 3.6 Plus is the warm
  // fallback if Flash is unavailable.
  chat:         { modelId: 'qwen3.5-flash',     reason: 'Qwen 3.5 Flash — fast TTFT, cheapest input/output for typical chat turns', fallbackModelId: 'qwen3.6-plus' },
  long_context: { modelId: 'qwen3.6-plus',      reason: 'Qwen 3.6 Plus — hybrid linear-attention + MoE efficient at 1M', fallbackModelId: 'qwen3.5-plus' },
  // Teach leans on long-form coherent output more than frontier reasoning.
  // 3.5 Plus is the cost-sensitive long-output tier.
  teach:        { modelId: 'qwen3.5-plus',      reason: 'Qwen 3.5 Plus — cost-sensitive long-form coherent output for tutorials', fallbackModelId: 'qwen3.6-plus', creationModelId: 'qwen3.6-plus' },
  security:     { modelId: 'qwen3.6-plus',      reason: 'Qwen 3.6 Plus — security analysis with full codebase context + depth', fallbackModelId: 'qwen3.5-plus' },
  // Brainstorm = ideation, not depth-bound reasoning. Qwen 3.5 Plus is
  // the right cognitive shape for breadth — cheaper, faster, creatively
  // wider than 3.6 Plus, whose RLHF favours careful reasoning over the
  // diverse-angles output ideation rewards. 3.6 Plus stays as the
  // fallback for the rare deep-reasoning brainstorm workload.
  brainstorm:   { modelId: 'qwen3.5-plus',      reason: 'Qwen 3.5 Plus — breadth over depth for ideation, cheaper and creatively wider than 3.6 Plus', fallbackModelId: 'qwen3.6-plus' },
};

/**
 * Routes task categories to the best available model.
 * Respects user overrides, checks provider availability, falls back gracefully.
 *
 * `mode` selects the routing table — 'auto' (default) uses the static
 * Qwen-coordinated table; 'supernova' uses the polyglot table that picks
 * different models per task based on what each is best at.
 */
export class ModelRouter {
  private providerRegistry: ProviderRegistry;
  private availableProviders: Set<string>;
  private hasPlatform: boolean;
  private userPreferences: UserRoutePreferences;
  private mode: RoutingMode;

  constructor(
    providerRegistry: ProviderRegistry,
    availableProviders: Set<string>,
    platformKey?: string,
    userPreferences?: UserRoutePreferences,
    mode: RoutingMode = 'auto',
  ) {
    this.providerRegistry = providerRegistry;
    this.availableProviders = availableProviders;
    this.hasPlatform = !!platformKey || availableProviders.has('platform');
    this.userPreferences = userPreferences || {};
    this.mode = mode;
  }

  /**
   * Route a task category to the best available model.
   * Returns null only if no model at all is available (shouldn't happen in practice).
   *
   * `teachDepth` is consulted only for `category === 'teach'`. When the
   * Flash gate upstream determines this is a curriculum-creation request
   * ('full'), the router upgrades to `entry.creationModelId` (the
   * coordinator-tier model) — running the 5-persona prep team on a
   * mid-tier model produced shallow curriculums. Delivery turns
   * ('light') and undefined (Flash unavailable / non-Teach) keep the
   * standard `entry.modelId`.
   */
  route(category: TaskCategory, modelOverride?: string, teachDepth?: 'light' | 'full'): RouteResult | null {
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

    // 3. Default routing table — table swap based on mode.
    const routes = this.mode === 'supernova'
      ? SUPERNOVA_ROUTES
      : this.mode === 'aurora'
        ? AURORA_ROUTES
        : DEFAULT_ROUTES;
    const entry = routes[category];
    if (!entry) return null;

    // Curriculum-creation upgrade: route to the coordinator-tier model
    // when the Flash gate has flagged this turn as full curriculum prep.
    const primaryModelId =
      category === 'teach' && teachDepth === 'full' && entry.creationModelId
        ? entry.creationModelId
        : entry.modelId;
    const primaryReason =
      category === 'teach' && teachDepth === 'full' && entry.creationModelId
        ? `${entry.reason} (curriculum-creation upgrade → coordinator tier)`
        : entry.reason;

    // Try primary
    const primary = this.resolveModel(primaryModelId, primaryReason);
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
    // Try platform first. The registry bridges the native/-platform id-suffix
    // duality, so a route written in either form resolves; we surface the
    // concrete resolved id (e.g. `platform:deepseek-v4-pro-platform`) so the
    // downstream API call + billing key match the model actually served.
    if (this.hasPlatform) {
      const result = this.providerRegistry.resolveModel(`platform:${modelId}`);
      if (result) {
        return { modelId: `platform:${result.model.id}`, provider: result.provider, model: result.model, reason };
      }
    }

    // Try direct provider
    const result = this.providerRegistry.resolveModel(modelId);
    if (result && this.isProviderAvailable(result.provider.name)) {
      return { modelId: result.model.id, provider: result.provider, model: result.model, reason };
    }

    // Try with provider prefix
    for (const providerName of this.availableProviders) {
      const qualified = `${providerName}:${modelId}`;
      const r = this.providerRegistry.resolveModel(qualified);
      if (r) return { modelId: `${providerName}:${r.model.id}`, provider: r.provider, model: r.model, reason };
    }

    return null;
  }

  private resolveAnyModel(reason: string): RouteResult | null {
    // Platform models (preferred order: coding-capable first).
    // Kimi removed — Kimi is BYOK only, so `platform:kimi-*` never resolved.
    // MiniMax excluded from reasoning fallback — reserved for creative generation.
    if (this.hasPlatform) {
      const platformModels = ['qwen3.6-plus', 'qwen3.5-omni-plus', 'qwen3.5-omni-flash', 'qwen3.5-flash'];
      for (const id of platformModels) {
        const result = this.providerRegistry.resolveModel(`platform:${id}`);
        if (result) return { modelId: `platform:${id}`, provider: result.provider, model: result.model, reason };
      }
    }

    // BYOK models (dynamic — try whatever providers are available, best first).
    // Fable 5 first: Anthropic's Mythos-class flagship. K2.6 next: SoTA
    // agentic coding. K2.5 kept as legacy fallback. MiniMax excluded — creative only.
    const byokModels = ['claude-fable-5', 'kimi-k2.6', 'claude-opus-4-8', 'claude-sonnet-4-6', 'kimi-k2.5', 'deepseek-chat', 'glm-5.2', 'mistral-medium-3.5', 'qwen3.5-omni-plus', 'qwen3.5-omni-flash', 'qwen3.5-flash'];
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
