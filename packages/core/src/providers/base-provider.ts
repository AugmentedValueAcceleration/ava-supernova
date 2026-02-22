import type { Provider, ProviderConfig, ChatCompletionRequest } from './types.js';
import type { ModelDefinition, CompletionResponse, StreamChunk } from '../core/types.js';
import { ProviderError } from '../core/errors.js';

export abstract class BaseProvider implements Provider {
  abstract readonly name: string;
  abstract readonly displayName: string;
  protected abstract getDefaultBaseUrl(): string;

  protected readonly apiKey: string;
  private readonly configBaseUrl?: string;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.configBaseUrl = config.baseUrl;
  }

  protected get baseUrl(): string {
    return this.configBaseUrl ?? this.getDefaultBaseUrl();
  }

  abstract listModels(): ModelDefinition[];

  // ── Hook methods for provider-specific quirks ────────────────────────────

  protected getCompletionUrl(): string {
    return `${this.baseUrl}/chat/completions`;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  protected transformRequest(request: ChatCompletionRequest): Record<string, unknown> {
    return { ...request };
  }

  protected normalizeResponse(raw: unknown): CompletionResponse {
    return raw as CompletionResponse;
  }

  protected normalizeStreamChunk(raw: unknown): StreamChunk {
    return raw as StreamChunk;
  }

  // ── Retry logic ─────────────────────────────────────────────────────────

  private static readonly RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_DELAY_MS = 1000;

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: ProviderError | undefined;

    for (let attempt = 0; attempt <= BaseProvider.MAX_RETRIES; attempt++) {
      const response = await fetch(url, init);

      if (response.ok) return response;

      const errorBody = await response.text();
      lastError = new ProviderError(
        `${this.displayName} API error: ${response.status} ${response.statusText}`,
        this.name,
        response.status,
        errorBody,
      );

      if (!BaseProvider.RETRYABLE_STATUS_CODES.has(response.status)) throw lastError;
      if (attempt === BaseProvider.MAX_RETRIES) break;

      const delay = BaseProvider.BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }

    throw lastError!;
  }

  // ── Shared HTTP logic ────────────────────────────────────────────────────

  async createCompletion(request: ChatCompletionRequest): Promise<CompletionResponse> {
    const body = this.transformRequest({ ...request, stream: false });
    const url = this.getCompletionUrl();
    const headers = this.getAuthHeaders();

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const raw = await response.json();
    return this.normalizeResponse(raw);
  }

  async *createStreamingCompletion(
    request: ChatCompletionRequest,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const body = this.transformRequest({
      ...request,
      stream: true,
      stream_options: { include_usage: true },
    });
    const url = this.getCompletionUrl();
    const headers = this.getAuthHeaders();

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.body) {
      throw new ProviderError('No response body for streaming', this.name);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            yield this.normalizeStreamChunk(parsed);
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
