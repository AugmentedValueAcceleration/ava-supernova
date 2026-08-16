import type { Provider, ProviderConfig, ChatCompletionRequest } from './types.js';
import type { ModelDefinition, CompletionResponse, StreamChunk } from '../core/types.js';
import { ProviderError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { shapeOpenAICompatBody } from './request-shaping/index.js';

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

  /**
   * Shape the outbound body for an OpenAI-compatible provider. Delegates to the
   * shared request-shaper (the single source of truth both this BYOK path and
   * the platform routes use): model-id translation + vision reroute, message
   * massaging (reasoning_content strip, Qwen system-reorder), and per-provider
   * param quirks (MiniMax max_completion_tokens, Qwen frequency_penalty drop,
   * Zhipu-Flash enable_thinking, stream_options). Providers with a quirk the
   * shaper doesn't cover (e.g. Mistral's tool_choice 'required'->'any') call
   * super and tweak the result. Providers whose wire format is not OpenAI-shaped override the
   * transport methods instead and never reach here.
   */
  protected transformRequest(request: ChatCompletionRequest): Record<string, unknown> {
    return shapeOpenAICompatBody({
      provider: this.name,
      model: request.model,
      messages: request.messages as unknown as Record<string, unknown>[],
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      top_p: request.top_p,
      stop: request.stop,
      tools: request.tools,
      tool_choice: request.tool_choice,
      stream: request.stream,
      stream_options: request.stream_options,
      // Forwarded explicitly, like every field above — this list is an
      // allow-list, so anything absent is silently dropped rather than
      // rejected. A caller setting enable_thinking would otherwise see the
      // flag ignored with no error anywhere.
      enable_thinking: request.enable_thinking,
      chat_template_kwargs: request.chat_template_kwargs,
    });
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
  private static readonly RATE_LIMIT_MAX_RETRIES = 5;  // More retries for rate limits (free-tier models)
  private static readonly BASE_DELAY_MS = 1000;
  private static readonly RATE_LIMIT_BASE_DELAY_MS = 5000;  // 5s base for rate limits (Zhipu free models need ~6s)
  private static readonly FETCH_TIMEOUT_MS = 60_000; // 60s connection timeout
  /**
   * Silence allowed between chunks before the stream is declared dead.
   *
   * WAS 30s, RAISED TO 90s after two observed false aborts (28 Jul, Qwen 3.7
   * Plus, ~19k context). Both had already streamed real content — 33 and 50
   * deltas — and then went quiet while the model moved from prose into a large
   * tool call. Thirty seconds of silence is simply not evidence that a
   * connection is dead when a reasoning model is between phases.
   *
   * The cost is asymmetric and that is what decides the number. A genuinely
   * dead stream now takes a minute longer to give up on — annoying. A false
   * abort destroys the turn: the work is thrown away, the credits are spent,
   * and the operator is told something failed that had not. Waiting is the
   * cheaper mistake.
   *
   * Still bounded, deliberately: without any ceiling a hung connection would
   * hang the surface forever with no way to tell it apart from thinking.
   */
  private static readonly STREAM_READ_TIMEOUT_MS = 90_000;

  protected async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    // Extract the caller's abort signal (for user cancellation) — it must not
    // be overwritten by our internal timeout controller.
    const callerSignal = init.signal;
    let lastError: ProviderError | undefined;

    for (let attempt = 0; attempt <= BaseProvider.RATE_LIMIT_MAX_RETRIES; attempt++) {
      // Check caller signal before each attempt
      if (callerSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // Combine timeout + caller signals: abort on whichever fires first
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), BaseProvider.FETCH_TIMEOUT_MS);

      // Forward caller abort to our controller so fetch() respects both
      const onCallerAbort = () => controller.abort();
      callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

      let response: Response;
      try {
        // Remove caller signal from init — our combined controller handles it
        const { signal: _ignored, ...restInit } = init;
        response = await fetch(url, { ...restInit, signal: controller.signal });
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener('abort', onCallerAbort);

        // If the caller aborted, propagate immediately (don't retry)
        if (callerSignal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        // Timeouts and network errors are transient — retry with backoff
        const isTimeout = err instanceof DOMException && err.name === 'AbortError';
        const msg = isTimeout
          ? `${this.displayName} request timed out after ${BaseProvider.FETCH_TIMEOUT_MS / 1000}s`
          : `${this.displayName} network error: ${err instanceof Error ? err.message : String(err)}`;

        logger.debug(`[${this.name}] Fetch error (attempt ${attempt + 1}/${BaseProvider.MAX_RETRIES + 1}): ${msg}`);

        lastError = new ProviderError(msg, this.name);
        if (attempt < BaseProvider.MAX_RETRIES) {
          const delay = BaseProvider.BASE_DELAY_MS * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener('abort', onCallerAbort);
      }

      if (response.ok) return response;

      const errorBody = await response.text();
      const isRateLimit = response.status === 429 || (response.status === 502 && errorBody.includes('429'));
      const maxRetries = isRateLimit ? BaseProvider.RATE_LIMIT_MAX_RETRIES : BaseProvider.MAX_RETRIES;

      logger.debug(`[${this.name}] API error (attempt ${attempt + 1}/${maxRetries + 1}): ${response.status} ${response.statusText} — ${errorBody.slice(0, 500)}`);

      lastError = new ProviderError(
        `${this.displayName} API error: ${response.status} ${response.statusText} — ${errorBody.slice(0, 500)}`,
        this.name,
        response.status,
        errorBody,
      );

      if (!BaseProvider.RETRYABLE_STATUS_CODES.has(response.status)) throw lastError;
      if (attempt >= maxRetries) break;

      // Rate limits get longer backoff — free-tier models (Zhipu GLM Flash)
      // need ~6s between requests.  Also respect Retry-After header.
      let delay: number;
      if (isRateLimit) {
        const retryAfter = response.headers.get('retry-after');
        const retryAfterMs = retryAfter ? Math.min(Number(retryAfter) * 1000, 30_000) : 0;
        delay = Math.max(retryAfterMs, BaseProvider.RATE_LIMIT_BASE_DELAY_MS * Math.pow(1.5, attempt));
      } else {
        delay = BaseProvider.BASE_DELAY_MS * Math.pow(2, attempt);
      }

      logger.debug(`[${this.name}] Retrying in ${Math.round(delay / 1000)}s...`);
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

  /**
   * Embed a single text via the OpenAI-compatible `/embeddings` endpoint
   * (Ollama serves this at `/v1/embeddings`; OpenAI and compatible servers
   * too). Returns the raw vector. Optional on the Provider interface — only
   * used for providers that actually have an embeddings endpoint (local
   * Ollama for semantic memory); the caller degrades gracefully on throw.
   */
  async createEmbedding(text: string, model: string, signal?: AbortSignal): Promise<number[]> {
    const url = `${this.baseUrl}/embeddings`;
    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ model, input: text }),
      signal,
    });
    const raw = await response.json() as {
      data?: Array<{ embedding?: number[] }>;
      embedding?: number[]; // Ollama native /api/embeddings shape, defensive
    };
    const vec = raw.data?.[0]?.embedding ?? raw.embedding;
    if (!Array.isArray(vec) || vec.length === 0) {
      throw new Error(`[${this.name}] embeddings endpoint returned no vector`);
    }
    return vec;
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
