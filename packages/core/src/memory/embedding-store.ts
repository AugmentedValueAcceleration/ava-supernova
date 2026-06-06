import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../core/logger.js';

interface EmbeddingStoreData {
  version: number;
  /** Which embed model produced these vectors. If it changes, the old vectors
   *  are incomparable and get dropped (rebuilt by the backfill). */
  model: string;
  /** Vector dimension (0 until the first vector is stored). */
  dim: number;
  /** nodeId → embedding vector. */
  vectors: Record<string, number[]>;
}

const STORE_VERSION = 1;
const SAVE_DEBOUNCE_MS = 2000;

/**
 * Per-scope embedding store, persisted to `embeddings.json` ALONGSIDE (not
 * inside) `graph.json`. Keeping vectors out of the graph means the 32MB graph
 * isn't bloated to ~74MB and its frequent saves stay fast. Vectors are
 * regenerable (the backfill rebuilds on corruption / model change), so a plain
 * atomic write is enough — no locking.
 */
export class EmbeddingStore {
  private readonly filePath: string;
  private readonly tmpPath: string;
  private readonly model: string;
  private data: EmbeddingStoreData = { version: STORE_VERSION, model: '', dim: 0, vectors: {} };
  private loaded = false;
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(memDir: string, model: string) {
    this.filePath = join(memDir, 'embeddings.json');
    this.tmpPath = `${this.filePath}.tmp`;
    this.model = model;
    this.data.model = model;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as EmbeddingStoreData;
      if (parsed?.model === this.model && parsed.vectors) {
        this.data = { version: STORE_VERSION, model: this.model, dim: parsed.dim ?? 0, vectors: parsed.vectors };
      } else {
        // Model changed (or unreadable shape) — start fresh; backfill rebuilds.
        logger.debug(`[embeddings] store model mismatch (${parsed?.model} ≠ ${this.model}) — resetting`);
      }
    } catch {
      // No file yet, or corrupt — start empty. Backfill will populate.
    }
  }

  has(nodeId: string): boolean {
    return Array.isArray(this.data.vectors[nodeId]);
  }

  get(nodeId: string): number[] | undefined {
    return this.data.vectors[nodeId];
  }

  set(nodeId: string, vec: number[]): void {
    if (this.data.dim === 0) this.data.dim = vec.length;
    this.data.vectors[nodeId] = vec;
    this.dirty = true;
    this.scheduleSave();
  }

  delete(nodeId: string): void {
    if (this.data.vectors[nodeId]) {
      delete this.data.vectors[nodeId];
      this.dirty = true;
      this.scheduleSave();
    }
  }

  /** Set of node ids that already have a vector — the backfill diffs against this. */
  embeddedIds(): Set<string> {
    return new Set(Object.keys(this.data.vectors));
  }

  get size(): number {
    return Object.keys(this.data.vectors).length;
  }

  get dim(): number {
    return this.data.dim;
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, SAVE_DEBOUNCE_MS);
    // Don't keep the process alive just for a debounced embedding save; clean
    // shutdown paths call flush().
    this.saveTimer.unref?.();
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await writeFile(this.tmpPath, JSON.stringify(this.data));
      await rename(this.tmpPath, this.filePath); // atomic swap
    } catch (err) {
      logger.debug(`[embeddings] store save failed (will retry): ${err instanceof Error ? err.message : String(err)}`);
      this.dirty = true; // keep dirty so a later set()/flush() retries
    }
  }

  /** Flush any pending debounced write immediately (backfill batches, shutdown). */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.save();
  }
}
