import type { Provider, ProviderConfig } from './types.js';
import type { ModelDefinition } from '../core/types.js';
import type { FallbackEntry } from './resilient-provider.js';
import { DeepSeekProvider } from './deepseek/index.js';
import { KimiProvider } from './kimi/index.js';
import { QwenProvider } from './qwen/index.js';
import { ZhipuProvider } from './zhipu/index.js';
import { MistralProvider } from './mistral/index.js';
import { AnthropicProvider } from './anthropic/index.js';
import { DEEPSEEK_MODELS } from './deepseek/models.js';
import { KIMI_MODELS } from './kimi/models.js';
import { QWEN_MODELS } from './qwen/models.js';
import { ZHIPU_MODELS } from './zhipu/models.js';
import { MISTRAL_MODELS } from './mistral/models.js';
import { ANTHROPIC_MODELS } from './anthropic/models.js';

type ProviderFactory = (config: ProviderConfig) => Provider;

/** Every model Ava supports, keyed by provider name. */
const ALL_MODELS: Record<string, ModelDefinition[]> = {
  deepseek: DEEPSEEK_MODELS,
  kimi: KIMI_MODELS,
  qwen: QWEN_MODELS,
  zhipu: ZHIPU_MODELS,
  mistral: MISTRAL_MODELS,
  anthropic: ANTHROPIC_MODELS,
};

const BUILT_IN_PROVIDERS: Record<string, ProviderFactory> = {
  deepseek: (config) => new DeepSeekProvider(config),
  kimi: (config) => new KimiProvider(config),
  qwen: (config) => new QwenProvider(config),
  zhipu: (config) => new ZhipuProvider(config),
  mistral: (config) => new MistralProvider(config),
  anthropic: (config) => new AnthropicProvider(config),
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
      const model = provider.listModels().find((m) => m.id === modelId);
      if (!model) return undefined;
      return { provider, model };
    }

    for (const [, provider] of this.providers) {
      const model = provider.listModels().find((m) => m.id === modelId);
      if (model) return { provider, model };
    }

    return undefined;
  }

  listAllModels(): ModelDefinition[] {
    const models: ModelDefinition[] = [];
    for (const [, provider] of this.providers) {
      models.push(...provider.listModels());
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
        results.push({ ...m, available: isAvailable });
      }
    }
    // Include any custom/generic providers that aren't in ALL_MODELS
    for (const [name, provider] of this.providers) {
      if (!(name in ALL_MODELS)) {
        for (const m of provider.listModels()) {
          results.push({ ...m, available: true });
        }
      }
    }
    return results;
  }
}
