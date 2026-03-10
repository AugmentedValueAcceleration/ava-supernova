import type { Provider, ProviderConfig } from './types.js';
import type { ModelDefinition } from '../core/types.js';
import { DeepSeekProvider } from './deepseek/index.js';
import { KimiProvider } from './kimi/index.js';
import { QwenProvider } from './qwen/index.js';
import { ZhipuProvider } from './zhipu/index.js';
import { MistralProvider } from './mistral/index.js';
import { AnthropicProvider } from './anthropic/index.js';
import { AvaFreeProvider } from './ava-free/index.js';
import { DEEPSEEK_MODELS } from './deepseek/models.js';
import { KIMI_MODELS } from './kimi/models.js';
import { QWEN_MODELS } from './qwen/models.js';
import { ZHIPU_MODELS } from './zhipu/models.js';
import { MISTRAL_MODELS } from './mistral/models.js';
import { ANTHROPIC_MODELS } from './anthropic/models.js';
import { AVA_FREE_MODELS } from './ava-free/models.js';

type ProviderFactory = (config: ProviderConfig) => Provider;

/** Every model Ava supports, keyed by provider name. */
const ALL_MODELS: Record<string, ModelDefinition[]> = {
  'ava-free': AVA_FREE_MODELS,
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
    // Always register the free provider — available to all users without config
    this.providers.set('ava-free', new AvaFreeProvider());
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
