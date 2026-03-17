/**
 * Resilient provider wrapper — automatic failover across multiple providers.
 *
 * Implements the Provider interface and wraps multiple {provider, model} pairs.
 * On transient failures (429, 500, 502, 503, network errors) it automatically
 * falls back to the next healthy provider in the chain. Non-retryable errors
 * (401, 403, 404) are thrown immediately as they indicate configuration problems.
 *
 * The Agent sees this as a single Provider — failover is transparent.
 */

import type { ChatCompletionRequest, Provider } from './types.js';
import type { ModelDefinition, CompletionResponse, StreamChunk } from '../core/types.js';
import { ProviderError } from '../core/errors.js';
import type { ProviderHealthTracker } from './health-tracker.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FallbackEntry {
  provider: Provider;
  model: ModelDefinition;
}

export interface ResilientProviderOptions {
  primary: FallbackEntry;
  fallbacks: FallbackEntry[];
  healthTracker: ProviderHealthTracker;
  onFallback?: (from: FallbackEntry, to: FallbackEntry, error: Error) => void;
}

// ── Implementation ───────────────────────────────────────────────────────────

export class ResilientProvider implements Provider {
  private readonly primary: FallbackEntry;
  private readonly fallbacks: FallbackEntry[];
  private readonly healthTracker: ProviderHealthTracker;
  private readonly onFallback?: ResilientProviderOptions['onFallback'];
  private _activeModel: ModelDefinition;

  constructor(opts: ResilientProviderOptions) {
    this.primary = opts.primary;
    this.fallbacks = opts.fallbacks;
    this.healthTracker = opts.healthTracker;
    this.onFallback = opts.onFallback;
    this._activeModel = opts.primary.model;
  }

  get name(): string {
    return this.primary.provider.name;
  }

  get displayName(): string {
    return this.primary.provider.displayName;
  }

  /** The model currently in use (may differ from primary during fallback). */
  get activeModel(): ModelDefinition {
    return this._activeModel;
  }

  listModels(): ModelDefinition[] {
    return this.primary.provider.listModels();
  }

  // ── Completion with failover ─────────────────────────────────────────────

  async createCompletion(
    request: ChatCompletionRequest,
    signal?: AbortSignal,
  ): Promise<CompletionResponse> {
    const chain = this.buildChain();
    let lastError: Error | undefined;

    for (let i = 0; i < chain.length; i++) {
      const entry = chain[i];
      const rewrittenRequest = { ...request, model: entry.model.id };
      const start = Date.now();

      try {
        const result = await entry.provider.createCompletion(rewrittenRequest, signal);
        this.healthTracker.recordSuccess(entry.provider.name, Date.now() - start);
        this._activeModel = entry.model;
        return result;
      } catch (err) {
        const error = err as Error;
        this.healthTracker.recordFailure(entry.provider.name, error);

        // Non-retryable errors: throw immediately (config problem)
        if (err instanceof ProviderError && !err.retryable) {
          throw err;
        }

        lastError = error;

        // Notify about failover (if there's a next entry to try)
        if (i < chain.length - 1 && this.onFallback) {
          this.onFallback(entry, chain[i + 1], error);
        }
      }
    }

    // All entries exhausted
    throw lastError ?? new ProviderError('All providers failed', this.name);
  }

  // ── Streaming with failover ──────────────────────────────────────────────

  async *createStreamingCompletion(
    request: ChatCompletionRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const chain = this.buildChain();
    let lastError: Error | undefined;

    for (let i = 0; i < chain.length; i++) {
      const entry = chain[i];
      const rewrittenRequest = { ...request, model: entry.model.id };
      const start = Date.now();

      try {
        const gen = entry.provider.createStreamingCompletion(rewrittenRequest, signal);

        // Try to get the first chunk — this is where connection failures surface
        const first = await gen.next();
        this.healthTracker.recordSuccess(entry.provider.name, Date.now() - start);
        this._activeModel = entry.model;

        if (!first.done) {
          yield first.value;

          // Wrap mid-stream yield to catch failures after connection established
          try {
            yield* gen;
          } catch (midStreamErr) {
            // Mid-stream failure — record and attempt fallback with remaining chain
            const msError = midStreamErr as Error;
            this.healthTracker.recordFailure(entry.provider.name, msError);

            if (midStreamErr instanceof ProviderError && !midStreamErr.retryable) {
              throw midStreamErr;
            }

            lastError = msError;

            // Signal the mid-stream failure so the caller can decide
            // We can't restart the stream (already yielded data), so throw
            // with a clear message that partial data was received
            if (i >= chain.length - 1) {
              throw new ProviderError(
                `Stream interrupted after partial response: ${msError.message}`,
                entry.provider.name,
                502,
              );
            }

            // Notify about failover
            if (this.onFallback) {
              this.onFallback(entry, chain[i + 1], msError);
            }
            continue; // Try next provider (caller gets a fresh stream)
          }
        }
        return;
      } catch (err) {
        const error = err as Error;
        this.healthTracker.recordFailure(entry.provider.name, error);

        if (err instanceof ProviderError && !err.retryable) {
          throw err;
        }

        lastError = error;

        if (i < chain.length - 1 && this.onFallback) {
          this.onFallback(entry, chain[i + 1], error);
        }
      }
    }

    throw lastError ?? new ProviderError('All providers failed', this.name);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /**
   * Build the ordered chain of entries to try.
   * Healthy entries first, but always include at least the primary.
   */
  private buildChain(): FallbackEntry[] {
    const all = [this.primary, ...this.fallbacks];
    const healthy = all.filter(e => this.healthTracker.isHealthy(e.provider.name));

    // If no healthy entries (all tripped), still try the primary
    if (healthy.length === 0) return [this.primary];
    return healthy;
  }
}
