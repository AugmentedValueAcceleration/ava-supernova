import { BaseProvider } from '../base-provider.js';
import type { ProviderConfig } from '../types.js';
import type { ModelDefinition } from '../../core/types.js';
import { DEFAULT_GENERIC_MODELS } from './models.js';

export interface GenericProviderConfig extends ProviderConfig {
  models?: ModelDefinition[];
}

/**
 * List the models an OpenAI-compatible endpoint is serving via `GET {baseUrl}/models`
 * (Ollama, LM Studio, vLLM, OpenRouter, … all expose this). Lets the Custom Model
 * card offer "detect + pick from your local library" instead of typing one name.
 * Returns the model ids (deduped, sorted). Throws on a non-OK response so callers
 * can surface a friendly error. Run host-side (extension host / IDE sidecar) — a
 * Node fetch reaches `localhost` without the webview's CORS constraints.
 */
export async function listOpenAICompatibleModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    throw new Error(`Could not list models (HTTP ${res.status}) from ${url}`);
  }
  const body = (await res.json()) as { data?: Array<{ id?: unknown }> };
  const ids = (body?.data ?? [])
    .map((m) => m?.id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
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
