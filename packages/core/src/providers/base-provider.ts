import type { Provider, ProviderConfig, ChatCompletionRequest } from './types.js';
import type { ModelDefinition, CompletionResponse, StreamChunk } from '../core/types.js';
import { ProviderError } from '../core/errors.js';
import { logger } from '../core/logger.js';

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
  private static readonly FETCH_TIMEOUT_MS = 60_000; // 60s connection timeout
  private static readonly STREAM_READ_TIMEOUT_MS = 90_000; // 90s per-chunk — reasoning models can think for a while

  protected async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: ProviderError | undefined;

    for (let attempt = 0; attempt <= BaseProvider.MAX_RETRIES; attempt++) {
      // Add timeout signal — prevents hanging if API never responds
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), BaseProvider.FETCH_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(url, { ...init, signal: controller.signal });
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new ProviderError(
            `${this.displayName} request timed out after ${BaseProvider.FETCH_TIMEOUT_MS / 1000}s`,
            this.name,
          );
        }
        throw new ProviderError(
          `${this.displayName} network error: ${err instanceof Error ? err.message : String(err)}`,
          this.name,
        );
      } finally {
        clearTimeout(timeoutId);
      }

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

  async createCompletion(request: ChatCompletionRequest, signal?: AbortSignal): Promise<CompletionResponse> {
    const body = this.transformRequest({ ...request, stream: false });
    const url = this.getCompletionUrl();
    const headers = this.getAuthHeaders();

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    const raw = await response.json();
    return this.normalizeResponse(raw);
  }

  async *createStreamingCompletion(
    request: ChatCompletionRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const body = this.transformRequest({
      ...request,
      stream: true,
      stream_options: { include_usage: true },
    });
    const url = this.getCompletionUrl();
    const headers = this.getAuthHeaders();

    const toolCount = Array.isArray(body.tools) ? body.tools.length : 0;
    logger.debug(`[${this.name}] POST ${url} | model=${body.model} tools=${toolCount} tool_choice=${body.tool_choice ?? 'none'}`);

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!response.body) {
      throw new ProviderError('No response body for streaming', this.name);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Per-chunk read timeout — prevents hanging if stream stalls mid-response.
    // Clears the timer on every successful read to avoid dangling unhandled
    // rejections that can crash the extension host.
    const readWithTimeout = () => {
      // Check abort signal before each read
      if (signal?.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      }

      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new ProviderError(
            `${this.displayName} stream stalled — no data received for ${BaseProvider.STREAM_READ_TIMEOUT_MS / 1000}s`,
            this.name,
          )),
          BaseProvider.STREAM_READ_TIMEOUT_MS,
        );
      });
      // Wrap reader.read() to clear timeout on settle (success or error)
      const readPromise = reader.read().then(
        (result) => { clearTimeout(timeoutId); return result; },
        (err) => { clearTimeout(timeoutId); throw err; },
      );
      return Promise.race([readPromise, timeoutPromise]);
    };

    const processLine = (line: string): StreamChunk | 'done' | null => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) return null;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return 'done';
      try {
        const parsed = JSON.parse(data);

        // Some APIs return 200 OK but send error objects inside the SSE stream
        if (parsed.error) {
          const errMsg = parsed.error.message || parsed.error.type || JSON.stringify(parsed.error);
          throw new ProviderError(
            `${this.displayName} stream error: ${errMsg}`,
            this.name,
            parsed.error.code,
          );
        }

        return this.normalizeStreamChunk(parsed);
      } catch (err) {
        // Re-throw ProviderErrors (from the check above)
        if (err instanceof ProviderError) throw err;
        return null; // Skip malformed chunks
      }
    };

    try {
      while (true) {
        const { done, value } = await readWithTimeout();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const result = processLine(line);
          if (result === 'done') return;
          if (result) yield result;
        }
      }

      // Process any remaining data in the buffer (final line without trailing newline)
      if (buffer.trim()) {
        const result = processLine(buffer);
        if (result && result !== 'done') yield result;
      }
    } finally {
      try { reader.cancel(); } catch { /* already closed */ }
      reader.releaseLock();
    }
  }
}
