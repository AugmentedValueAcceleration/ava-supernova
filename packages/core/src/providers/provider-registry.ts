import type { Provider, ProviderConfig } from './types.js';
import type { ModelDefinition } from '../core/types.js';
import { DeepSeekProvider } from './deepseek/index.js';
import { KimiProvider } from './kimi/index.js';

type ProviderFactory = (config: ProviderConfig) => Provider;

const BUILT_IN_PROVIDERS: Record<string, ProviderFactory> = {
  deepseek: (config) => new DeepSeekProvider(config),
  kimi: (config) => new KimiProvider(config),
};

export class ProviderRegistry {
  private providers = new Map<string, Provider>();

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
}
