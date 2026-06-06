import type { Provider } from '../providers/types.js';
import { GenericProvider } from '../providers/generic/index.js';
import { logger } from '../core/logger.js';

const DEFAULT_EMBED_MODEL = 'nomic-embed-text';
const DEFAULT_EMBED_BASE_URL = 'http://localhost:11434/v1'; // Ollama (OpenAI-compat)

export interface EmbeddingServiceOptions {
  provider: Provider;
  /** Embedding model id, e.g. 'nomic-embed-text'. */
  model: string;
  /** Per-call timeout (ms). A local embed should be fast; cap it so a hung
   *  endpoint can't stall a background backfill. Default 10s. */
  timeoutMs?: number;
  /** Circuit-breaker cooldown (ms) after a failure — fast-fail to null during
   *  this window so we don't hammer a down Ollama. Default 30s. */
  cooldownMs?: number;
}

/**
 * Thin wrapper over a provider's optional `createEmbedding`. Returns `null` on
 * ANY failure (Ollama down, model missing, provider without embeddings) so
 * callers degrade to TF-IDF — semantic recall is a quality boost, never a hard
 * requirement. A circuit breaker keeps a down endpoint from stalling writes or
 * the backfill: after one failure, subsequent calls fast-fail for `cooldownMs`.
 */
export class EmbeddingService {
  private readonly provider: Provider;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly cooldownMs: number;
  private downUntil = 0; // epoch ms; while Date.now() < downUntil, fast-fail

  constructor(opts: EmbeddingServiceOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
  }

  get embedModel(): string {
    return this.model;
  }

  /** True if the breaker is currently open (endpoint recently failed). Callers
   *  like the backfill can poll this to back off without issuing more calls. */
  get tripped(): boolean {
    return Date.now() < this.downUntil;
  }

  /**
   * Embed a single text. Returns the vector, or `null` if embeddings are
   * unavailable / failed. Never throws.
   */
  async embed(text: string, signal?: AbortSignal): Promise<number[] | null> {
    if (!this.provider.createEmbedding) return null;
    const trimmed = text?.trim();
    if (!trimmed) return null;
    if (Date.now() < this.downUntil) return null; // breaker open — fast-fail

    try {
      const vec = await this.withTimeout(
        this.provider.createEmbedding(trimmed.slice(0, 8000), this.model, signal),
        this.timeoutMs,
      );
      if (!Array.isArray(vec) || vec.length === 0) throw new Error('empty vector');
      return vec;
    } catch (err) {
      // Open the breaker so the next calls fast-fail instead of retrying a
      // down endpoint. Log once per trip, at debug — never user-facing.
      if (!this.tripped) {
        logger.debug(`[embeddings] embed failed, degrading to TF-IDF for ${this.cooldownMs}ms: ${err instanceof Error ? err.message : String(err)}`);
      }
      this.downUntil = Date.now() + this.cooldownMs;
      return null;
    }
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('embed timeout')), ms)),
    ]);
  }
}

/**
 * Build an EmbeddingService from user preferences. Returns undefined when
 * `useLocalEmbeddings` is off (the default) — so recall stays pure TF-IDF with
 * no external dependency. When on, points a GenericProvider at the local
 * Ollama (OpenAI-compatible) `/v1/embeddings` endpoint. Shared by every surface
 * so the wiring is identical (CLI / extension / IDE sidecar).
 */
export function createEmbeddingServiceFromConfig(prefs?: {
  useLocalEmbeddings?: boolean;
  embeddingModel?: string;
  embeddingBaseUrl?: string;
}): EmbeddingService | undefined {
  if (!prefs?.useLocalEmbeddings) return undefined;
  const provider = new GenericProvider({
    apiKey: '',
    baseUrl: prefs.embeddingBaseUrl ?? DEFAULT_EMBED_BASE_URL,
  });
  return new EmbeddingService({
    provider,
    model: prefs.embeddingModel ?? DEFAULT_EMBED_MODEL,
  });
}
