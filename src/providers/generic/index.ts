import { BaseProvider } from '../base-provider.js';
import type { ProviderConfig } from '../types.js';
import type { ModelDefinition } from '../../core/types.js';
import { DEFAULT_GENERIC_MODELS } from './models.js';

export interface GenericProviderConfig extends ProviderConfig {
  models?: ModelDefinition[];
}

export class GenericProvider extends BaseProvider {
  readonly name = 'generic';
  readonly displayName = 'Custom Provider';
  private readonly models: ModelDefinition[];

  constructor(config: GenericProviderConfig) {
    super(config);
    this.models = config.models ?? DEFAULT_GENERIC_MODELS;
  }

  protected getDefaultBaseUrl(): string {
    return 'http://localhost:11434/v1';
  }

  listModels(): ModelDefinition[] {
    return this.models;
  }

  // Local servers (Ollama) may not require auth
  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }
}
