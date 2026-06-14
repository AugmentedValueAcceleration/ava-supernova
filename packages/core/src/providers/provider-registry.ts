import type { Provider, ProviderConfig } from './types.js';
import type { ModelDefinition } from '../core/types.js';
import type { FallbackEntry } from './resilient-provider.js';
import { DeepSeekProvider } from './deepseek/index.js';
import { KimiProvider } from './kimi/index.js';
import { QwenProvider } from './qwen/index.js';
import { ZhipuProvider } from './zhipu/index.js';
import { MistralProvider } from './mistral/index.js';
import { AnthropicProvider } from './anthropic/index.js';
import { MiniMaxProvider } from './minimax/index.js';
import { XiaomiProvider } from './xiaomi/index.js';
import { DEEPSEEK_MODELS } from './deepseek/models.js';
import { KIMI_MODELS } from './kimi/models.js';
import { QWEN_MODELS } from './qwen/models.js';
import { ZHIPU_MODELS } from './zhipu/models.js';
import { MISTRAL_MODELS } from './mistral/models.js';
import { ANTHROPIC_MODELS } from './anthropic/models.js';
import { MINIMAX_MODELS } from './minimax/models.js';
import { XIAOMI_MODELS } from './xiaomi/models.js';

type ProviderFactory = (config: ProviderConfig) => Provider;

/** Every model Ava supports, keyed by provider name. */
const ALL_MODELS: Record<string, ModelDefinition[]> = {
  deepseek: DEEPSEEK_MODELS,
  kimi: KIMI_MODELS,
  qwen: QWEN_MODELS,
  zhipu: ZHIPU_MODELS,
  mistral: MISTRAL_MODELS,
  anthropic: ANTHROPIC_MODELS,
  minimax: MINIMAX_MODELS,
  xiaomi: XIAOMI_MODELS,
};

const BUILT_IN_PROVIDERS: Record<string, ProviderFactory> = {
  deepseek: (config) => new DeepSeekProvider(config),
  kimi: (config) => new KimiProvider(config),
  qwen: (config) => new QwenProvider(config),
  zhipu: (config) => new ZhipuProvider(config),
  mistral: (config) => new MistralProvider(config),
  anthropic: (config) => new AnthropicProvider(config),
  minimax: (config) => new MiniMaxProvider(config),
  xiaomi: (config) => new XiaomiProvider(config),
};

export class ProviderRegistry {
  private providers = new Map<string, Provider>();

  constructor() {
    // No built-in free provider — free users get Qwen through the platform provider
  }

  register(name: string, config: ProviderConfig): void {
    const factory = BUILT_IN_PROVIDERS[name];
    if (!factory) {
      throw new Error(`Unknown provider: ${name}`);
    }
    this.providers.set(name, factory(config));
  }

  registerCustom(name: string, provider: Provider): void {
    this.providers.set(name, provider);
  }

  get(name: string): Provider | undefined {
    return this.providers.get(name);
  }

  resolveModel(qualifiedId: string): { provider: Provider; model: ModelDefinition } | undefined {
    const [providerName, modelId] = qualifiedId.includes(':')
      ? (qualifiedId.split(':', 2) as [string, string])
      : [undefined, qualifiedId];

    if (providerName) {
      const provider = this.providers.get(providerName);
      if (!provider) return undefined;
      const model = this.findModel(provider, modelId);
      if (!model) return undefined;
      return { provider, model };
    }

    for (const [, provider] of this.providers) {
      const model = this.findModel(provider, modelId);
      if (model) return { provider, model };
    }

    return undefined;
  }

  /**
   * Find a model on a provider, bridging the platform/native id-suffix duality.
   *
   * The same logical model is listed under different ids depending on surface:
   * the managed platform serves DeepSeek/Mistral under `<id>-platform` rows
   * (the server `models` table key), while a BYOK provider lists the native
   * `<id>`. A routing table written against either form must resolve on both
   * surfaces. So after an exact match, also try the id with `-platform`
   * stripped and appended. Qwen uses one native id on both surfaces and is
   * unaffected. Returns the concrete model so callers use its real `.id`.
   */
  private findModel(provider: Provider, modelId: string): ModelDefinition | undefined {
    // Disabled models are invisible to resolution — auto-routing skips them and
    // a stale saved selection falls back instead of failing. See ModelDefinition.disabled.
    const models = provider.listModels().filter((m) => !m.disabled);
    const exact = models.find((m) => m.id === modelId);
    if (exact) return exact;

    const alt = modelId.endsWith('-platform')
      ? modelId.slice(0, -'-platform'.length) // platform route → native BYOK id
      : `${modelId}-platform`;                // BYOK/native route → platform row
    return models.find((m) => m.id === alt);
  }

  listAllModels(): ModelDefinition[] {
    const models: ModelDefinition[] = [];
    for (const [, provider] of this.providers) {
      models.push(...provider.listModels().filter((m) => !m.disabled));
    }
    return models;
  }

  /**
   * Build a fallback chain for a given model. Returns the primary entry plus
   * compatible fallbacks from other registered providers, sorted by capability
   * match, context window, and pricing. Capped at 3 fallbacks.
   *
   * Returns undefined if the primary model cannot be resolved.
   */
  buildFallbackChain(qualifiedId: string): FallbackEntry[] | undefined {
    const primary = this.resolveModel(qualifiedId);
    if (!primary) return undefined;

    const candidates: Array<FallbackEntry & { score: number }> = [];
    const primaryModel = primary.model;

    for (const [, provider] of this.providers) {
      if (provider === primary.provider) continue; // skip primary's own provider

      for (const model of provider.listModels()) {
        // Never fall back onto a disabled model
        if (model.disabled) continue;
        // Must support tool calls if primary does
        if (primaryModel.supportsToolCalls && !model.supportsToolCalls) continue;
        // Must support streaming if primary does
        if (primaryModel.supportsStreaming && !model.supportsStreaming) continue;

        // Score: higher is better
        let score = 0;

        // Prefer matching thinking capability
        if (primaryModel.supportsThinking && model.supportsThinking) score += 10;
        // Prefer matching vision capability
        if (primaryModel.supportsVision && model.supportsVision) score += 5;
        // Larger context window is better
        score += Math.min(model.contextWindow / 10_000, 20);
        // Cheaper is better (if pricing available on both)
        if (primaryModel.pricing && model.pricing) {
          if (model.pricing.inputPerMillion < primaryModel.pricing.inputPerMillion) score += 3;
        }

        candidates.push({ provider, model, score });
      }
    }

    // Sort by score descending, take top 3
    candidates.sort((a, b) => b.score - a.score);
    const fallbacks = candidates.slice(0, 3).map(({ provider, model }) => ({ provider, model }));

    return [{ provider: primary.provider, model: primary.model }, ...fallbacks];
  }

  /**
   * List every model Ava supports, regardless of whether the provider is configured.
   * Each entry includes `available: true` if the provider is registered (user has API key),
   * or `available: false` if not.
   */
  listAllPossibleModels(): Array<ModelDefinition & { available: boolean }> {
    const results: Array<ModelDefinition & { available: boolean }> = [];
    for (const [providerName, models] of Object.entries(ALL_MODELS)) {
      const isAvailable = this.providers.has(providerName);
      for (const m of models) {
        if (m.disabled) continue; // hidden from the picker while disabled
        results.push({ ...m, available: isAvailable });
      }
    }
    // Include any custom/generic providers that aren't in ALL_MODELS
    for (const [name, provider] of this.providers) {
      if (!(name in ALL_MODELS)) {
        for (const m of provider.listModels()) {
          if (m.disabled) continue;
          results.push({ ...m, available: true });
        }
      }
    }
    return results;
  }
}
