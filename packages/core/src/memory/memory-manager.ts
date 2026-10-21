import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TfIdfIndex, cosineDense } from './tfidf.js';
import type { EmbeddingService } from './embedding-service.js';
import { EmbeddingStore } from './embedding-store.js';
import type {
  MemoryEntry,
  MemoryCategory,
  MemoryLayer,
  MemoryStore,
  MemorySaveOptions,
  MemoryRecallOptions,
  MemoryRecallResult,
  MemoryStoreSummary,
  MemoryConsolidationGroup,
  MemoryNode,
  ProjectBrain,
} from './types.js';
import { MEMORY_CATEGORIES, createEmptyStore, inferLayer } from './types.js';
import { MemoryGraph } from './graph-engine.js';
import { needsMigration, migrateV2ToV3 } from './migration-v3.js';
import { ProceduralObserver } from './procedural.js';
import { synthesiseProjectBrain, loadProjectBrain, saveProjectBrain } from './project-brain.js';
import { AmbientCaptureManager } from './ambient-capture.js';
import { logger } from '../core/logger.js';
import { avaEvents } from '../dataset/emitter.js';

const MEMORY_FILENAME_V1 = 'memory.md';
const MEMORY_FILENAME_V2 = 'memory.json';
const PROJECTS_REGISTRY = 'projects.json';

/** Minimum cosine for a node to count as a semantic recall hit. Related text
 *  sits well above this; unrelated text falls below. */
const SEMANTIC_RECALL_THRESHOLD = 0.5;
/** Backfill: flush the store + yield to the event loop every N embeds. */
const EMBED_BACKFILL_BATCH = 50;
/** Backfill: embed this many nodes concurrently (Ollama handles parallel
 *  requests; keeps a 29k backfill to minutes, not tens of minutes). */
const EMBED_BACKFILL_CONCURRENCY = 6;

/**
 * How far a hit from another project is marked down.
 *
 * Weights, not filters. A sibling's memory can still win if it is a much
 * better match than anything here, which is the only reason to look there at
 * all; it simply has to earn it. A declared relation is worth more than a
 * project that merely exists.
 */
const RELATED_PROJECT_WEIGHT = 0.75;
const UNRELATED_PROJECT_WEIGHT = 0.4;

interface ProjectRegistryEntry {
  path: string;
  name: string;
  lastUsed: string;
  /**
   * Absolute paths of projects this one is RELATED to.
   *
   * The scope was `global | project` and nothing in between, so a fact that
   * mattered to two projects had nowhere correct to live: keep it local and
   * the sibling cannot see it, promote it to global and it follows every
   * unrelated project forever. This is the middle.
   *
   * Declared, never inferred silently. A monorepo workspace or a dependency
   * is a good REASON to suggest a link; it is not permission to create one.
   */
  relatedProjects?: string[];
}

import {
  CONFLICT_THRESHOLD as CONFLICT_TFIDF_THRESHOLD,
  RECALL_THRESHOLD as RECALL_TFIDF_THRESHOLD,
  CONSOLIDATION_THRESHOLD,
  STALE_DAYS as STALE_THRESHOLD_DAYS,
  W_TFIDF, W_RECENCY, W_FREQUENCY,
} from './config.js';

export class MemoryManager {
  private readonly globalDir: string;
  private readonly projectDir: string | null;

  // In-memory caches — loaded lazily, written through on save
  private globalStore: MemoryStore | null = null;
  private projectStore: MemoryStore | null = null;

  // TF-IDF indexes — one per scope, rebuilt on load
  private globalIndex: TfIdfIndex = new TfIdfIndex();
  private projectIndex: TfIdfIndex = new TfIdfIndex();

  // ── v3 Graph layer ────────────────────────────────────────────────────────
  // Runs alongside the v2 flat stores during the transition. New operations
  // (recall, project brain, procedural learning, ambient capture) use the
  // graph; existing operations (saveEntry, getEntries) write to both so
  // backwards compat is preserved for dashboard callers.
  private graphGlobal: MemoryGraph | null = null;
  private graphProject: MemoryGraph | null = null;
  private graphInitialized = false;
  // Resolves when initGraph() completes — saveEntry awaits this so it never
  // writes to a not-yet-loaded graph.
  private initGraphPromise: Promise<void> = Promise.resolve();
  private proceduralGlobal: ProceduralObserver | null = null;
  private proceduralProject: ProceduralObserver | null = null;
  private ambientGlobal: AmbientCaptureManager | null = null;
  private ambientProject: AmbientCaptureManager | null = null;
  private projectBrainCache: ProjectBrain | null = null;

  // ── Semantic recall (optional, local Ollama) ──────────────────────────────
  // When an embedding service is injected, memories are embedded on write and
  // recall adds a graph-wide semantic phase. All null/absent → pure TF-IDF, no
  // external dependency. Vectors live in a SEPARATE embeddings.json per scope.
  private embeddingService: EmbeddingService | null = null;
  private embeddingStoreGlobal: EmbeddingStore | null = null;
  private embeddingStoreProject: EmbeddingStore | null = null;

  // Memories are local only — they live on disk under ~/.ava (global) and
  // <project>/.ava (project) and never leave the machine.
  constructor(opts: { globalDir: string; projectRoot?: string; embeddingService?: EmbeddingService }) {
    this.globalDir = opts.globalDir;
    this.projectDir = opts.projectRoot ? join(opts.projectRoot, '.ava') : null;
    this.embeddingService = opts.embeddingService ?? null;

    // Auto-register this project in the global registry (fire-and-forget)
    if (opts.projectRoot) {
      this.registerProject(opts.projectRoot).catch(() => {});
    }

    // Initialize v3 graph layer (async, non-blocking). Keep the promise so
    // saveEntry/recall can await readiness; warn (not debug) on failure so a
    // broken graph init is visible rather than silently dropping memories.
    this.initGraphPromise = this.initGraph().catch(err =>
      logger.warn(`[memory] Graph init failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  /** Resolves once the v3 graph layer has finished initializing. */
  private async ensureGraphReady(): Promise<void> {
    await this.initGraphPromise;
  }

  /**
   * Initialize the v3 graph layer. Creates MemoryGraph instances for
   * global + project scopes, runs auto-migration from v2 if needed,
   * and sets up procedural observers + ambient capture managers.
   */
  private async initGraph(): Promise<void> {
    if (this.graphInitialized) return;

    try {
      // Global graph
      const globalMemDir = join(this.globalDir, 'memory');
      this.graphGlobal = new MemoryGraph(globalMemDir);
      if (needsMigration(this.globalDir)) {
        // v2 memory.json exists but no graph.json — migrate
        await this.graphGlobal.load();
        await migrateV2ToV3(this.globalDir, this.graphGlobal);
      } else {
        await this.graphGlobal.load();
      }
      this.proceduralGlobal = new ProceduralObserver(globalMemDir);
      await this.proceduralGlobal.load();
      this.ambientGlobal = new AmbientCaptureManager(this.graphGlobal);
      if (this.embeddingService) {
        this.embeddingStoreGlobal = new EmbeddingStore(globalMemDir, this.embeddingService.embedModel);
        await this.embeddingStoreGlobal.load();
      }

      // Project graph
      if (this.projectDir) {
        const projectMemDir = join(this.projectDir, 'memory');
        this.graphProject = new MemoryGraph(projectMemDir);
        if (needsMigration(this.projectDir)) {
          await this.graphProject.load();
          await migrateV2ToV3(this.projectDir, this.graphProject);
        } else {
          await this.graphProject.load();
        }
        this.proceduralProject = new ProceduralObserver(projectMemDir);
        await this.proceduralProject.load();
        this.ambientProject = new AmbientCaptureManager(this.graphProject);
        if (this.embeddingService) {
          this.embeddingStoreProject = new EmbeddingStore(projectMemDir, this.embeddingService.embedModel);
          await this.embeddingStoreProject.load();
        }

        // Load or generate project brain
        const brainDir = join(this.projectDir, 'memory');
        const graphHash = this.graphProject.getGraphHash();
        this.projectBrainCache = await loadProjectBrain(brainDir, graphHash);
        if (!this.projectBrainCache && this.graphProject.nodeCount > 0) {
          const procedures = this.proceduralProject?.getAllPatterns() ?? [];
          this.projectBrainCache = synthesiseProjectBrain(this.graphProject, this.projectDir, procedures);
          await saveProjectBrain(brainDir, this.projectBrainCache);
        }
      }

      this.graphInitialized = true;
      logger.debug(`[memory] v3 graph initialized: global=${this.graphGlobal?.nodeCount ?? 0} nodes, project=${this.graphProject?.nodeCount ?? 0} nodes`);

      // Background semantic backfill — embed any nodes missing a vector so
      // recall spans the whole graph. Fire-and-forget; resumable (only fills
      // gaps); fast-no-ops if Ollama is unreachable (breaker trips).
      if (this.embeddingService) {
        void this.runEmbeddingBackfill().catch(() => {});
      }
    } catch (err) {
      logger.warn(`[memory] v3 graph init failed: ${err instanceof Error ? err.message : String(err)}`);
      // Non-fatal — v2 stores still work as fallback
    }
  }

  // ── v3 Public API — Graph-specific operations ─────────────────────────────

  /**
   * Seam facts recorded in the projects this one is linked to.
   *
   * A fact about a join is only worth writing if the person on the OTHER side
   * meets it. Recall reaches across a link already, but recall needs someone
   * to ask — and the defining property of a seam fact is that you do not know
   * it exists until it has cost you an hour. So these are pulled at session
   * start, where they are read before anyone asks anything.
   *
   * Deliberately small: a handful, newest first, each one short. This rides in
   * front of every session in a linked project, and a brief nobody reads
   * because it is long is the same as no brief.
   */
  async getRelatedSeamFacts(limit = 3): Promise<Array<{ project: string; content: string }>> {
    if (!this.projectDir) return [];
    const currentRoot = dirname(this.projectDir);
    const related = await this.getRelatedProjects(currentRoot);
    if (related.length === 0) return [];

    const out: Array<{ project: string; content: string; at: string }> = [];
    for (const path of related) {
      const storePath = join(path, '.ava', MEMORY_FILENAME_V2);
      if (!existsSync(storePath)) continue;
      try {
        const store = JSON.parse(await readFile(storePath, 'utf-8')) as MemoryStore;
        for (const entry of store.entries) {
          if (entry.archived || entry.category !== 'seam') continue;
          out.push({
            project: basename(path),
            content: entry.content,
            at: entry.updatedAt ?? entry.createdAt,
          });
        }
      } catch {
        // A linked project we cannot read is not worth failing a session over.
      }
    }

    out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return out.slice(0, limit).map(({ project, content }) => ({ project, content }));
  }

  /** Get the project brain brief for session-start injection. */
  getProjectBrain(): ProjectBrain | null {
    return this.projectBrainCache;
  }

  /** Get the graph instance for a scope (for direct graph operations). */
  getGraph(scope: 'global' | 'project'): MemoryGraph | null {
    return scope === 'global' ? this.graphGlobal : this.graphProject;
  }

  /** Get the procedural observer for a scope. */
  getProceduralObserver(scope: 'global' | 'project'): ProceduralObserver | null {
    return scope === 'global' ? this.proceduralGlobal : this.proceduralProject;
  }

  /** Get the ambient capture manager for a scope. */
  getAmbientCapture(scope: 'global' | 'project'): AmbientCaptureManager | null {
    return scope === 'global' ? this.ambientGlobal : this.ambientProject;
  }

  // ── Semantic embeddings (optional, local Ollama) ──────────────────────────

  private embeddingStore(scope: 'global' | 'project'): EmbeddingStore | null {
    return scope === 'global' ? this.embeddingStoreGlobal : this.embeddingStoreProject;
  }

  /** Embed a node's content and stash the vector. Background; never throws. */
  private async embedNode(scope: 'global' | 'project', nodeId: string, content: string): Promise<void> {
    const store = this.embeddingStore(scope);
    if (!store || !this.embeddingService) return;
    try {
      const vec = await this.embeddingService.embed(content);
      if (vec) store.set(nodeId, vec);
    } catch { /* never throw on a background embed */ }
  }

  /**
   * Backfill embeddings for active graph nodes missing a vector, so recall can
   * span the whole memory (not just newly-saved entries). Resumable (only
   * fills gaps), batched (flush + yield every N), and bails fast if the
   * endpoint is down (breaker trips → embed returns null). Fire-and-forget on
   * init; also callable from maintenance.
   */
  async runEmbeddingBackfill(signal?: AbortSignal): Promise<void> {
    if (!this.embeddingService) return;
    await this.ensureGraphReady();
    const jobs: Array<{ graph: MemoryGraph; store: EmbeddingStore; scope: string }> = [];
    if (this.graphGlobal && this.embeddingStoreGlobal) jobs.push({ graph: this.graphGlobal, store: this.embeddingStoreGlobal, scope: 'global' });
    if (this.graphProject && this.embeddingStoreProject) jobs.push({ graph: this.graphProject, store: this.embeddingStoreProject, scope: 'project' });

    for (const { graph, store, scope } of jobs) {
      const nodes = graph.getActiveNodes();
      const missing = nodes.filter(n => !store.has(n.id) && n.content?.trim());
      if (missing.length === 0) continue;
      logger.info(`[embeddings] backfill ${scope}: ${missing.length}/${nodes.length} nodes need embedding`);
      let done = 0, embedded = 0, sinceFlush = 0;
      for (let i = 0; i < missing.length; i += EMBED_BACKFILL_CONCURRENCY) {
        if (signal?.aborted) { await store.flush(); return; }
        // Endpoint just failed → stop and resume next session rather than
        // spinning through thousands of fast-fails.
        if (this.embeddingService.tripped) {
          logger.debug(`[embeddings] backfill ${scope}: endpoint unavailable, pausing after ${embedded}`);
          break;
        }
        const batch = missing.slice(i, i + EMBED_BACKFILL_CONCURRENCY);
        const vecs = await Promise.all(batch.map(n => this.embeddingService!.embed(n.content)));
        for (let j = 0; j < batch.length; j++) {
          const vec = vecs[j];
          if (vec) { store.set(batch[j].id, vec); embedded++; }
        }
        done += batch.length;
        sinceFlush += batch.length;
        if (sinceFlush >= EMBED_BACKFILL_BATCH) {
          sinceFlush = 0;
          await store.flush();
          await new Promise(r => setTimeout(r, 0)); // yield
          logger.debug(`[embeddings] backfill ${scope}: ${done}/${missing.length}`);
        }
      }
      await store.flush();
      logger.info(`[embeddings] backfill ${scope} done: ${embedded} embedded`);
    }
  }

  /** Run confidence decay + forgetting pass on both graphs. Called on session end. */
  async runMaintenance(): Promise<void> {
    if (this.graphGlobal) {
      this.graphGlobal.applyDecay();
      this.graphGlobal.runForgettingPass();
      await this.graphGlobal.save();
    }
    if (this.graphProject) {
      this.graphProject.applyDecay();
      this.graphProject.runForgettingPass();
      await this.graphProject.save();

      // Regenerate project brain after maintenance
      if (this.projectDir && this.graphProject.nodeCount > 0) {
        const procedures = this.proceduralProject?.getAllPatterns() ?? [];
        this.projectBrainCache = synthesiseProjectBrain(this.graphProject, this.projectDir, procedures);
        await saveProjectBrain(join(this.projectDir, 'memory'), this.projectBrainCache);
      }
    }
    if (this.proceduralGlobal) await this.proceduralGlobal.save();
    if (this.proceduralProject) await this.proceduralProject.save();
  }

  /** Save all graph state to disk (called at end of session). */
  async saveGraphs(): Promise<void> {
    if (this.graphGlobal) await this.graphGlobal.save();
    if (this.graphProject) await this.graphProject.save();
    if (this.proceduralGlobal) await this.proceduralGlobal.save();
    if (this.proceduralProject) await this.proceduralProject.save();
  }

  // ── Public API — Load ──────────────────────────────────────────────────────

  /** Load global memory store, migrating from v1 if needed. */
  async loadGlobalStore(): Promise<MemoryStore> {
    if (this.globalStore) return this.globalStore;
    this.globalStore = await this.loadStore(this.globalDir, 'global');
    this.rebuildIndex(this.globalStore, this.globalIndex);
    return this.globalStore;
  }

  /** Load project memory store, migrating from v1 if needed. */
  async loadProjectStore(): Promise<MemoryStore | null> {
    if (!this.projectDir) return null;
    if (this.projectStore) return this.projectStore;
    this.projectStore = await this.loadStore(this.projectDir, 'project');
    this.rebuildIndex(this.projectStore, this.projectIndex);
    return this.projectStore;
  }

  /** Load both stores and format for system prompt injection. */
  async loadAll(context?: string, branch?: string): Promise<string> {
    void context;
    const [globalStore, projectStore] = await Promise.all([
      this.loadGlobalStore(),
      this.loadProjectStore(),
    ]);

    const sections: string[] = [];

    // Filter to active (non-archived) entries, respecting branch scope
    const globalEntries = this.filterActive(globalStore.entries, branch);
    const projectEntries = projectStore ? this.filterActive(projectStore.entries, branch) : [];

    if (globalEntries.length > 0) {
      sections.push(`### Global Memory\n${this.formatEntriesForPrompt(globalEntries)}`);
    }
    if (projectEntries.length > 0) {
      sections.push(`### Project Memory\n${this.formatEntriesForPrompt(projectEntries)}`);
    }

    return sections.join('\n\n');
  }

  // ── Backwards compat — v1 string accessors ─────────────────────────────────

  /** Load global memory as markdown string (v1 compat). */
  async loadGlobalMemory(): Promise<string | null> {
    const store = await this.loadGlobalStore();
    if (store.entries.length === 0) return null;
    return this.formatEntriesAsMarkdown(store.entries);
  }

  /** Load project memory as markdown string (v1 compat). */
  async loadProjectMemory(): Promise<string | null> {
    const store = await this.loadProjectStore();
    if (!store || store.entries.length === 0) return null;
    return this.formatEntriesAsMarkdown(store.entries);
  }

  /** Overwrite global memory with raw markdown (v1 compat — used by dashboard). */
  async saveGlobalMemory(content: string): Promise<void> {
    const store = await this.loadGlobalStore();
    store.entries = this.markdownToEntries(content);
    store.lastModified = new Date().toISOString();
    this.globalStore = store;
    this.rebuildIndex(store, this.globalIndex);
    await this.persistStore(this.globalDir, store);
  }

  /** Overwrite project memory with raw markdown (v1 compat — used by dashboard). */
  async saveProjectMemory(content: string): Promise<void> {
    if (!this.projectDir) throw new Error('No project root configured.');
    await mkdir(this.projectDir, { recursive: true });
    const store = await this.loadProjectStore() ?? createEmptyStore();
    store.entries = this.markdownToEntries(content);
    store.lastModified = new Date().toISOString();
    this.projectStore = store;
    this.rebuildIndex(store, this.projectIndex);
    await this.persistStore(this.projectDir, store);
  }

  /** Append raw markdown entry (v1 compat). */
  async appendGlobal(entry: string): Promise<void> {
    await this.saveEntry({
      scope: 'global',
      content: entry.replace(/^####\s*\d{4}-\d{2}-\d{2}\n/, ''),
      category: 'general',
    });
  }

  /** Append raw markdown entry (v1 compat). */
  async appendProject(entry: string): Promise<void> {
    await this.saveEntry({
      scope: 'project',
      content: entry.replace(/^####\s*\d{4}-\d{2}-\d{2}\n/, ''),
      category: 'general',
    });
  }

  // ── Public API — v2 Structured Operations ──────────────────────────────────

  /** Save a new memory entry with TF-IDF conflict detection. Returns the saved entry. */
  async saveEntry(opts: MemorySaveOptions): Promise<MemoryEntry> {
    // If saving to project scope but no project is open, fall back to global
    // rather than silently losing the memory in a temporary in-memory store
    const effectiveScope = (opts.scope === 'project' && !this.projectDir) ? 'global' : opts.scope;

    const store = effectiveScope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore() ?? createEmptyStore();

    if (effectiveScope === 'project' && this.projectDir) {
      await mkdir(this.projectDir, { recursive: true });
    }

    const index = effectiveScope === 'global' ? this.globalIndex : this.projectIndex;

    // Determine layer
    const category = opts.category ?? 'general';
    const layer: MemoryLayer = opts.layer ?? inferLayer(category, opts.scope);

    // Conflict detection — project memories use stricter threshold to avoid over-merging
    const conflict = this.findConflict(store, index, opts.content, opts.category, layer === 'project' ? 0.6 : undefined);

    let entry: MemoryEntry;

    if (conflict) {
      // Update existing entry instead of duplicating
      conflict.content = opts.content;
      conflict.updatedAt = new Date().toISOString();
      conflict.category = opts.category ?? conflict.category;
      conflict.layer = layer;
      if (opts.tags) conflict.tags = opts.tags;
      if (opts.branch !== undefined) conflict.branch = opts.branch;
      if (opts.directoryScope !== undefined) conflict.directoryScope = opts.directoryScope;
      // Unarchive if it was archived
      conflict.archived = false;
      conflict.archivedAt = null;
      entry = conflict;
      // Update index
      index.addDocument(entry.id, entry.content);
    } else {
      // Create new entry
      entry = {
        id: randomUUID(),
        category,
        layer,
        content: opts.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastRecalledAt: null,
        recallCount: 0,
        sourceConversationId: opts.sourceConversationId,
        tags: opts.tags,
        archived: false,
        branch: opts.branch ?? null,
        directoryScope: opts.directoryScope ?? null,
      };
      store.entries.push(entry);
      // Add to index
      index.addDocument(entry.id, entry.content);
    }

    // Cap at 500 entries per scope — archive oldest non-archived entries
    const MAX_ENTRIES = 500;
    const active = store.entries.filter(e => !e.archived);
    if (active.length > MAX_ENTRIES) {
      const sorted = active.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      const toArchive = sorted.slice(0, active.length - MAX_ENTRIES);
      for (const e of toArchive) {
        e.archived = true;
      }
    }

    store.lastModified = new Date().toISOString();

    // Update cache and persist
    if (effectiveScope === 'global') {
      this.globalStore = store;
      await this.persistStore(this.globalDir, store);
    } else {
      this.projectStore = store;
      if (this.projectDir) await this.persistStore(this.projectDir, store);
    }


    // ── v3 graph write ──────────────────────────────────────────────────
    // The v2 store above is the legacy layer; getEntries() and the dashboard
    // read from the GRAPH. Without this mirror, new memories saved here never
    // appeared in the Memory panel ("nothing being logged"). Reinforces a
    // near-duplicate node or adds a new one. Non-fatal on failure — the v2
    // write already succeeded.
    try {
      await this.ensureGraphReady();
      const graph = this.getGraph(effectiveScope);
      if (graph) {
        const node = graph.upsertNode({
          content: entry.content,
          category: entry.category,
          scope: effectiveScope,
          layer: entry.layer,
          tags: entry.tags,
          branch: entry.branch,
          directoryScope: entry.directoryScope,
          confidenceSource: 'explicit',
        });
        await graph.save();
        logger.debug(`[memory] saved to ${effectiveScope} graph: "${entry.content.slice(0, 48)}"`);
        // Semantic: embed the node's content in the background (never blocks
        // the write). No-op if embeddings disabled / Ollama unreachable.
        if (this.embeddingService) {
          void this.embedNode(effectiveScope, node.id, node.content);
        }
      } else {
        logger.warn(`[memory] saveEntry: ${effectiveScope} graph unavailable — saved to v2 store only`);
      }
    } catch (err) {
      logger.warn(`[memory] saveEntry graph write failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── Dataset event ──────────────────────────────────────────────────
    avaEvents.emit('memory_save', {
      scope: effectiveScope,
      layer,
      category: entry.category,
      source: opts.source ?? 'explicit',
      // content_signature is the category — never the raw content.
      content_signature: entry.category,
    });

    return entry;
  }

  /** Update an existing memory entry by ID. */
  /**
   * Exact ID, or a UNIQUE prefix of one. memory_save and memory_update tell
   * the model "ID: 0c79801b" — the first eight characters — and the model
   * hands that back to memory_update, which looked for the full ID and
   * answered "No memory entry found". The tools speak in prefixes, so the
   * store accepts them; an ambiguous prefix is still a miss.
   */
  private findById(entries: MemoryEntry[], id: string): MemoryEntry | undefined {
    const exact = entries.find(e => e.id === id);
    if (exact) return exact;
    if (id.length < 6) return undefined;
    const hits = entries.filter(e => e.id.startsWith(id));
    return hits.length === 1 ? hits[0] : undefined;
  }

  async updateEntry(scope: 'global' | 'project', id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'category' | 'tags' | 'branch' | 'directoryScope'>>): Promise<MemoryEntry | null> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    if (!store) return null;

    const entry = this.findById(store.entries, id);
    if (!entry) return null;
    id = entry.id;

    if (updates.content !== undefined) entry.content = updates.content;
    if (updates.category !== undefined) entry.category = updates.category;
    if (updates.tags !== undefined) entry.tags = updates.tags;
    if (updates.branch !== undefined) entry.branch = updates.branch;
    if (updates.directoryScope !== undefined) entry.directoryScope = updates.directoryScope;
    entry.updatedAt = new Date().toISOString();
    store.lastModified = new Date().toISOString();

    // Update TF-IDF index if content changed
    if (updates.content !== undefined) {
      const index = scope === 'global' ? this.globalIndex : this.projectIndex;
      index.addDocument(id, entry.content);
    }

    if (scope === 'global') {
      this.globalStore = store;
      await this.persistStore(this.globalDir, store);
    } else if (this.projectDir) {
      this.projectStore = store;
      await this.persistStore(this.projectDir, store);
    }


    // ── Dataset event ──────────────────────────────────────────────────
    // what_changed reports the first explicit change; covers the common
    // case where a single field is updated. Multi-field updates fire one
    // event with the highest-signal field reported.
    const changedField: 'content' | 'tags' | 'metadata' =
      updates.content !== undefined ? 'content'
      : updates.tags !== undefined ? 'tags'
      : 'metadata';
    avaEvents.emit('memory_update', {
      scope,
      what_changed: changedField,
      reason: 'updateEntry',
    });

    return entry;
  }

  /** Delete a memory entry by ID. */
  async deleteEntry(scope: 'global' | 'project', id: string): Promise<boolean> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    if (!store) return false;

    const hit = this.findById(store.entries, id);
    const idx = hit ? store.entries.indexOf(hit) : -1;
    if (idx === -1) return false;
    id = store.entries[idx].id;

    store.entries.splice(idx, 1);
    store.lastModified = new Date().toISOString();

    // Remove from TF-IDF index
    const index = scope === 'global' ? this.globalIndex : this.projectIndex;
    index.removeDocument(id);

    if (scope === 'global') {
      this.globalStore = store;
      await this.persistStore(this.globalDir, store);
    } else if (this.projectDir) {
      this.projectStore = store;
      await this.persistStore(this.projectDir, store);
    }

    return true;
  }

  /**
   * Delete ALL entries from a scope. Permanent.
   */
  async clearAll(scope: 'global' | 'project'): Promise<void> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    if (!store) return;

    store.entries = [];
    store.lastModified = new Date().toISOString();

    const index = scope === 'global' ? this.globalIndex : this.projectIndex;
    index.clear();

    if (scope === 'global') {
      this.globalStore = store;
      await this.persistStore(this.globalDir, store);
    } else if (this.projectDir) {
      this.projectStore = store;
      await this.persistStore(this.projectDir, store);
    }

  }

  /**
   * Delete ALL entries from ALL scopes — global + current project + all known projects.
   * Reads the project registry to find every project memory file.
   */
  async clearEverything(): Promise<void> {
    // Reset in-memory caches
    this.globalStore = null as unknown as MemoryStore;
    this.projectStore = null;

    // Clear global
    await this.clearAll('global');

    // Clear current project
    await this.clearAll('project');

    // Clear all known projects from registry
    try {
      const registryPath = join(this.globalDir, PROJECTS_REGISTRY);
      const data = await readFile(registryPath, 'utf-8');
      const registry: ProjectRegistryEntry[] = JSON.parse(data);

      for (const project of registry) {
        try {
          const projectMemoryPath = join(project.path, '.ava', MEMORY_FILENAME_V2);
          const raw = await readFile(projectMemoryPath, 'utf-8');
          const store: MemoryStore = JSON.parse(raw);
          store.entries = [];
          store.lastModified = new Date().toISOString();
          await this.writeSafe(projectMemoryPath, JSON.stringify(store, null, 2));
        } catch { /* project dir may not exist anymore */ }
      }
    } catch { /* no registry or corrupt */ }

    // Clear legacy memory.md
    try {
      const mdPath = join(this.globalDir, 'memory.md');
      await this.writeSafe(mdPath, '');
    } catch { /* best effort */ }
  }

  /**
   * Search memories with TF-IDF ranking + temporal relevance scoring.
   * Falls back to substring for exact matches (plus local semantic recall when an embedding service is set).
   */
  async recall(opts: MemoryRecallOptions): Promise<MemoryRecallResult[]> {
    const results: MemoryRecallResult[] = [];
    const lowerQuery = opts.query.toLowerCase();
    const limit = opts.limit ?? 10;
    const includeArchived = opts.includeArchived ?? false;

    const searchStore = (store: MemoryStore, scope: string, index: TfIdfIndex) => {
      // Phase 1: Exact substring matches (highest priority)
      const substringMatches = new Set<string>();
      for (const entry of store.entries) {
        if (!includeArchived && entry.archived) continue;
        if (opts.category && entry.category !== opts.category) continue;
        if (opts.branch && entry.branch && entry.branch !== opts.branch) continue;

        if (entry.content.toLowerCase().includes(lowerQuery) ||
            entry.tags?.some(t => t.toLowerCase().includes(lowerQuery))) {
          const relevance = this.computeRelevance(1.0, entry);
          results.push({ entry, scope, relevance, matchType: 'substring' });
          substringMatches.add(entry.id);

          // Update recall stats
          entry.lastRecalledAt = new Date().toISOString();
          entry.recallCount++;
        }
      }

      // Phase 2: TF-IDF search for semantic-ish matches
      const tfidfResults = index.search(opts.query, limit * 2);
      for (const { id, score } of tfidfResults) {
        if (substringMatches.has(id)) continue; // already found via substring
        if (score < RECALL_TFIDF_THRESHOLD) continue;

        const entry = store.entries.find(e => e.id === id);
        if (!entry) continue;
        if (!includeArchived && entry.archived) continue;
        if (opts.category && entry.category !== opts.category) continue;
        if (opts.branch && entry.branch && entry.branch !== opts.branch) continue;

        const relevance = this.computeRelevance(score, entry);
        results.push({ entry, scope, relevance, matchType: 'tfidf' });

        // Update recall stats
        entry.lastRecalledAt = new Date().toISOString();
        entry.recallCount++;
      }
    };

    if (opts.scope !== 'project') {
      const globalStore = await this.loadGlobalStore();
      searchStore(globalStore, 'global', this.globalIndex);
    }

    if (opts.scope !== 'global') {
      const projectStore = await this.loadProjectStore();
      if (projectStore) searchStore(projectStore, 'project', this.projectIndex);
    }

    // Home first, then outward. The local store must be loaded before the
    // cross-project walk below, or a cold manager answers a 'related' query
    // with the sibling's hits and none of its own — which reads as this
    // project having nothing to say on its own subject.
    // ── Other projects ──────────────────────────────────────────────────
    //
    // Two scopes reach outside the current project, and the difference is the
    // point. 'all_projects' is the net: everything ever opened, which is right
    // when hunting for a half-remembered solution. 'related' is the line: only
    // what this project was DECLARED to be connected to.
    //
    // Related hits are weighted DOWN rather than filtered, so a strong match
    // in a sibling can still beat a weak one at home — which is the whole
    // reason to look next door. Unrelated projects under 'all_projects' are
    // weighted down harder still: useful, but it should take a good match to
    // outrank the project you are actually in.
    if (opts.scope === 'all_projects' || opts.scope === 'related') {
      const registry = await this.loadProjectRegistry();
      const currentRoot = this.projectDir ? dirname(this.projectDir) : null;
      const related = currentRoot
        ? new Set(registry.find(p => p.path === currentRoot)?.relatedProjects ?? [])
        : new Set<string>();

      const candidates = opts.scope === 'related'
        ? registry.filter(p => related.has(p.path))
        : registry;

      const skipped: string[] = [];
      for (const proj of candidates) {
        const projAvaDir = join(proj.path, '.ava');
        // The current project is searched by the 'project' branch below.
        if (this.projectDir && projAvaDir === this.projectDir) continue;

        const storePath = join(projAvaDir, MEMORY_FILENAME_V2);
        if (!existsSync(storePath)) {
          // A registered project with no store is usually one that was moved
          // or deleted. Noted rather than passed over in silence: a search
          // that quietly covers less ground than it claims is the worst kind,
          // because finding nothing is indistinguishable from there being
          // nothing to find.
          skipped.push(proj.name);
          continue;
        }

        try {
          const storeData = await readFile(storePath, 'utf-8');
          const store = JSON.parse(storeData) as MemoryStore;
          const tempIndex = new TfIdfIndex();
          this.rebuildIndex(store, tempIndex);

          const before = results.length;
          searchStore(store, `project:${proj.name}`, tempIndex);
          const weight = related.has(proj.path)
            ? RELATED_PROJECT_WEIGHT
            : UNRELATED_PROJECT_WEIGHT;
          for (let i = before; i < results.length; i++) {
            results[i].relevance *= weight;
          }
        } catch (err) {
          skipped.push(proj.name);
          logger.debug(`[memory] could not read store for ${proj.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (skipped.length > 0) {
        logger.debug(`[memory] cross-project recall skipped ${skipped.length} project(s): ${skipped.join(', ')}`);
      }
    }


    // Sort by composite relevance score
    results.sort((a, b) => b.relevance - a.relevance);

    // ── Local semantic phase (graph-wide, optional) ────────────────────────
    // Embed the query and cosine against the graph's stored vectors. Unlike the
    // keyword phases above (which see only the ≤500 v2 store), this spans the
    // FULL graph — surfacing memories that are semantically related but share
    // no keywords. Additive + graceful: no embeddings / endpoint down → skipped
    // entirely, leaving the keyword results exactly as they are today.
    if (this.embeddingService) {
      const qVec = await this.embeddingService.embed(opts.query);
      if (qVec) {
        await this.ensureGraphReady();
        const seen = new Set(results.map(r => r.entry.id));
        const addSemantic = (graph: MemoryGraph | null, store: EmbeddingStore | null, scope: string) => {
          if (!graph || !store) return;
          const hits: Array<{ node: MemoryNode; sim: number }> = [];
          for (const node of graph.getActiveNodes()) {
            if (seen.has(node.id)) continue;
            if (opts.category && node.category !== opts.category) continue;
            if (opts.branch && node.branch && node.branch !== opts.branch) continue;
            const vec = store.get(node.id);
            if (!vec) continue;
            const sim = cosineDense(qVec, vec);
            if (sim >= SEMANTIC_RECALL_THRESHOLD) hits.push({ node, sim });
          }
          hits.sort((a, b) => b.sim - a.sim);
          for (const { node, sim } of hits.slice(0, limit)) {
            seen.add(node.id);
            results.push({ entry: node, scope, relevance: this.computeRelevance(sim, node), matchType: 'semantic' });
          }
        };
        if (opts.scope !== 'project') addSemantic(this.graphGlobal, this.embeddingStoreGlobal, 'global');
        if (opts.scope !== 'global') addSemantic(this.graphProject, this.embeddingStoreProject, 'project');
        results.sort((a, b) => b.relevance - a.relevance);
      }
    }

    // Persist updated recall stats
    if (results.some(r => r.matchType === 'substring' || r.matchType === 'tfidf')) {
      await Promise.all([
        this.globalStore ? this.persistStore(this.globalDir, this.globalStore) : Promise.resolve(),
        this.projectStore && this.projectDir ? this.persistStore(this.projectDir, this.projectStore) : Promise.resolve(),
      ]);
    }

    const final = results.slice(0, limit);

    // ── Dataset event ──────────────────────────────────────────────────
    // query_signature is a coarse length category (single-word /
    // short-phrase / long-query). Never the raw query. results_used_count
    // is set to 0 here because we don't know at recall time which entries
    // will end up in the response — the join happens at training time
    // via trajectory_id correlation with subsequent assistant turns.
    const wordCount = opts.query.trim().split(/\s+/).filter(Boolean).length;
    const querySignature: string =
      wordCount <= 1 ? 'single-word'
      : wordCount <= 5 ? 'short-phrase'
      : 'long-query';
    avaEvents.emit('memory_recall', {
      query_signature: querySignature,
      results_count: final.length,
      results_used_count: 0,
    });

    return final;
  }

  // ── Public API — Phase 3: Temporal & Scope ──────────────────────────────────

  /**
   * Archive stale entries (not recalled in 90+ days).
   * Returns the number of entries archived.
   */
  async archiveStaleEntries(scope: 'global' | 'project'): Promise<number> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    if (!store) return 0;

    let count = 0;
    const now = new Date().toISOString();

    for (const entry of store.entries) {
      if (entry.archived) continue;
      if (this.isStale(entry)) {
        entry.archived = true;
        entry.archivedAt = now;
        count++;
      }
    }

    if (count > 0) {
      store.lastModified = now;
      if (scope === 'global') {
        await this.persistStore(this.globalDir, store);
      } else if (this.projectDir) {
        await this.persistStore(this.projectDir, store);
      }
    }

    return count;
  }

  /**
   * Restore an archived entry back to active status.
   */
  async restoreEntry(scope: 'global' | 'project', id: string): Promise<boolean> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    if (!store) return false;

    const entry = store.entries.find(e => e.id === id);
    if (!entry || !entry.archived) return false;

    entry.archived = false;
    entry.archivedAt = null;
    entry.updatedAt = new Date().toISOString();
    store.lastModified = new Date().toISOString();

    if (scope === 'global') {
      await this.persistStore(this.globalDir, store);
    } else if (this.projectDir) {
      await this.persistStore(this.projectDir, store);
    }

    return true;
  }

  /**
   * Archive a single entry by ID.
   */
  async archiveEntry(scope: 'global' | 'project', id: string): Promise<boolean> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    if (!store) return false;

    const entry = store.entries.find(e => e.id === id);
    if (!entry || entry.archived) return false;

    entry.archived = true;
    entry.archivedAt = new Date().toISOString();
    entry.updatedAt = new Date().toISOString();
    store.lastModified = new Date().toISOString();

    if (scope === 'global') {
      await this.persistStore(this.globalDir, store);
    } else if (this.projectDir) {
      await this.persistStore(this.projectDir, store);
    }

    return true;
  }

  /**
   * Find groups of related entries that could be consolidated.
   * Uses TF-IDF similarity to cluster entries within the same category.
   * Returns groups sorted by number of related entries (largest first).
   */
  findConsolidationGroups(scope: 'global' | 'project'): MemoryConsolidationGroup[] {
    const store = scope === 'global' ? this.globalStore : this.projectStore;
    if (!store || store.entries.length < 2) return [];

    const index = scope === 'global' ? this.globalIndex : this.projectIndex;
    const activeEntries = store.entries.filter(e => !e.archived);

    // Group by category first — only consolidate within same category
    const byCategory = new Map<MemoryCategory, MemoryEntry[]>();
    for (const entry of activeEntries) {
      const list = byCategory.get(entry.category) ?? [];
      list.push(entry);
      byCategory.set(entry.category, list);
    }

    const groups: MemoryConsolidationGroup[] = [];
    const claimed = new Set<string>(); // entries already in a group

    for (const [, categoryEntries] of byCategory) {
      if (categoryEntries.length < 2) continue;

      for (const entry of categoryEntries) {
        if (claimed.has(entry.id)) continue;

        // Find similar entries using TF-IDF
        const similar = index.findSimilar(entry.id, CONSOLIDATION_THRESHOLD)
          .filter(s => {
            if (claimed.has(s.id)) return false;
            const other = categoryEntries.find(e => e.id === s.id);
            return other && !other.archived;
          });

        if (similar.length === 0) continue;

        const related = similar.map(s => categoryEntries.find(e => e.id === s.id)!);
        const avgSimilarity = similar.reduce((sum, s) => sum + s.score, 0) / similar.length;

        // Primary = entry with highest recall count
        const allInGroup = [entry, ...related];
        allInGroup.sort((a, b) => b.recallCount - a.recallCount);

        groups.push({
          primary: allInGroup[0],
          related: allInGroup.slice(1),
          avgSimilarity,
        });

        for (const e of allInGroup) claimed.add(e.id);
      }
    }

    // Sort by group size (most consolidation potential first)
    groups.sort((a, b) => b.related.length - a.related.length);
    return groups;
  }

  /**
   * Get stale entries for a scope (for dashboard review).
   */
  async getStaleEntries(scope: 'global' | 'project'): Promise<MemoryEntry[]> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    if (!store) return [];

    return store.entries.filter(e => !e.archived && this.isStale(e));
  }

  /**
   * Get archived entries for a scope.
   */
  async getArchivedEntries(scope: 'global' | 'project'): Promise<MemoryEntry[]> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    if (!store) return [];

    return store.entries.filter(e => e.archived);
  }

  /** Get summary statistics for a store. */
  async getSummary(scope: 'global' | 'project'): Promise<MemoryStoreSummary> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore() ?? createEmptyStore();

    const byCategory = {} as Record<MemoryCategory, number>;
    for (const cat of MEMORY_CATEGORIES) byCategory[cat] = 0;
    const byLayer = { person: 0, workflow: 0, project: 0 } as Record<MemoryLayer, number>;

    const now = Date.now();
    let staleCount = 0;
    let archivedCount = 0;
    let branchScoped = 0;
    let oldest: string | null = null;
    let newest: string | null = null;

    for (const entry of store.entries) {
      if (entry.archived) {
        archivedCount++;
        continue; // don't count archived in category/stale stats
      }

      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
      const layer = entry.layer ?? inferLayer(entry.category, scope);
      byLayer[layer] = (byLayer[layer] ?? 0) + 1;

      if (!oldest || entry.createdAt < oldest) oldest = entry.createdAt;
      if (!newest || entry.createdAt > newest) newest = entry.createdAt;

      if (entry.branch) branchScoped++;

      const lastActivity = entry.lastRecalledAt ?? entry.updatedAt ?? entry.createdAt;
      const daysSince = (now - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > STALE_THRESHOLD_DAYS) staleCount++;
    }

    return {
      totalEntries: store.entries.filter(e => !e.archived).length,
      byCategory,
      byLayer,
      oldestEntry: oldest,
      newestEntry: newest,
      staleCount,
      archivedCount,
      branchScoped,
    };
  }

  /** Get all entries for a scope (for dashboard display). */
  async getEntries(scope: 'global' | 'project'): Promise<MemoryEntry[]> {
    // Wait for the v3 graph to finish its async init before reading — otherwise
    // a caller right after construction (e.g. the dashboard's get_memories) hits
    // a null graph and silently falls back to the stale v2 store / empty list.
    // recall() already guards this way; getEntries must too so the dashboard
    // always sees the authoritative graph.
    await this.ensureGraphReady();
    // v3: prefer graph nodes when available (MemoryNode extends MemoryEntry
    // so the return type is compatible). Falls back to v2 store if graph
    // isn't initialized yet.
    const graph = scope === 'global' ? this.graphGlobal : this.graphProject;
    if (graph) {
      return graph.getAllNodes();
    }
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    return store?.entries ?? [];
  }

  /** Get graph stats for the dashboard (v3). */
  getGraphStats(scope: 'global' | 'project'): {
    activeNodes: number;
    archivedNodes: number;
    edges: number;
    avgConfidence: number;
    categories: Record<string, number>;
    contradictions: number;
    proceduralPatterns: number;
    crystallisedPatterns: number;
  } | null {
    const graph = scope === 'global' ? this.graphGlobal : this.graphProject;
    if (!graph) return null;
    const stats = graph.getStats();
    const contradictions = graph.getAllEdges().filter(e => e.type === 'contradicts').length;
    const observer = scope === 'global' ? this.proceduralGlobal : this.proceduralProject;
    const allPatterns = observer?.getAllPatterns() ?? [];
    return {
      ...stats,
      contradictions,
      proceduralPatterns: allPatterns.length,
      crystallisedPatterns: allPatterns.filter(p => p.crystallised).length,
    };
  }

  /** Get contradictions for the dashboard resolution UI (v3). */
  getContradictions(scope: 'global' | 'project'): Array<{
    nodeA: MemoryEntry;
    nodeB: MemoryEntry;
    similarity: number;
    edgeId: string;
  }> {
    const graph = scope === 'global' ? this.graphGlobal : this.graphProject;
    if (!graph) return [];
    const contradictEdges = graph.getAllEdges().filter(e => e.type === 'contradicts');
    const results: Array<{ nodeA: MemoryEntry; nodeB: MemoryEntry; similarity: number; edgeId: string }> = [];
    for (const edge of contradictEdges) {
      const nodeA = graph.getNode(edge.fromNodeId);
      const nodeB = graph.getNode(edge.toNodeId);
      if (nodeA && nodeB && !nodeA.archived && !nodeB.archived) {
        results.push({ nodeA, nodeB, similarity: edge.weight, edgeId: edge.id });
      }
    }
    return results;
  }

  /** Get procedural patterns for the dashboard (v3). */
  getProceduralPatterns(scope: 'global' | 'project'): import('./types.js').ProceduralPattern[] {
    const observer = scope === 'global' ? this.proceduralGlobal : this.proceduralProject;
    return observer?.getAllPatterns() ?? [];
  }

  /** Get file path for a scope (for display). */
  getPath(scope: 'global' | 'project'): string | null {
    if (scope === 'global') return join(this.globalDir, MEMORY_FILENAME_V2);
    return this.projectDir ? join(this.projectDir, MEMORY_FILENAME_V2) : null;
  }

  /** Invalidate cached stores and TF-IDF indexes. */
  clearCache(): void {
    this.globalStore = null;
    this.projectStore = null;
    this.globalIndex.clear();
    this.projectIndex.clear();
  }

  // ── Private — Storage ──────────────────────────────────────────────────────

  private async loadStore(dir: string, scope: 'global' | 'project'): Promise<MemoryStore> {
    // Clean up orphaned .tmp files from interrupted writes
    try {
      const { readdir, unlink: unlinkFile } = await import('node:fs/promises');
      const files = await readdir(dir).catch(() => [] as string[]);
      for (const file of files) {
        if (file.endsWith('.tmp')) {
          await unlinkFile(join(dir, file)).catch(() => {});
        }
      }
    } catch { /* non-critical cleanup */ }

    const v2Path = join(dir, MEMORY_FILENAME_V2);
    const v1Path = join(dir, MEMORY_FILENAME_V1);

    // Try v2 first
    try {
      const raw = await readFile(v2Path, 'utf-8');
      const parsed = JSON.parse(raw) as MemoryStore;
      if ((parsed.version === 2 || parsed.version === 3) && Array.isArray(parsed.entries)) {
        // Fix corrupt entries whose content is a JSON store blob
        const cleaned = this.cleanBlobEntries(parsed);
        if (cleaned) {
          await this.persistStore(dir, parsed);
        }
        // Auto-migrate v2 → v3: assign layer to entries that don't have one
        if (parsed.version === 2 || parsed.entries.some(e => !e.layer)) {
          for (const entry of parsed.entries) {
            if (!entry.layer) {
              entry.layer = inferLayer(entry.category, scope);
            }
          }
          parsed.version = 3;
          await this.persistStore(dir, parsed);
        }
        return parsed;
      }
    } catch { /* v2 doesn't exist or is corrupt */ }

    // Try migrating from v1
    try {
      const v1Content = await readFile(v1Path, 'utf-8');
      if (v1Content?.trim()) {
        const store = this.migrateFromV1(v1Content);
        await mkdir(dir, { recursive: true });
        await this.persistStore(dir, store);
        return store;
      }
    } catch { /* v1 doesn't exist either */ }

    return createEmptyStore();
  }

  private async persistStore(dir: string, store: MemoryStore): Promise<void> {
    await mkdir(dir, { recursive: true });
    const path = join(dir, MEMORY_FILENAME_V2);
    const content = JSON.stringify(store, null, 2);
    await this.writeSafe(path, content);

    // Also write a human-readable markdown mirror (active entries only)
    const mdPath = join(dir, MEMORY_FILENAME_V1);
    const activeEntries = store.entries.filter(e => !e.archived);
    const markdown = this.formatEntriesAsMarkdown(activeEntries);
    await this.writeSafe(mdPath, markdown);
  }

  // ── Private — TF-IDF Index ─────────────────────────────────────────────────

  /** Rebuild TF-IDF index from a store's entries. */
  private rebuildIndex(store: MemoryStore, index: TfIdfIndex): void {
    index.clear();
    for (const entry of store.entries) {
      if (!entry.archived) {
        index.addDocument(entry.id, entry.content);
      }
    }
  }

  // ── Private — Relevance Scoring ────────────────────────────────────────────

  /**
   * Compute composite relevance score combining TF-IDF match quality,
   * recency, and recall frequency. Returns 0–1.
   */
  private computeRelevance(tfidfScore: number, entry: MemoryEntry): number {
    // Recency score: exponential decay, half-life of 30 days
    const lastActivity = entry.lastRecalledAt ?? entry.updatedAt ?? entry.createdAt;
    const daysSince = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.exp(-daysSince / 30);

    // Frequency score: logarithmic — diminishing returns after many recalls
    const frequencyScore = entry.recallCount > 0
      ? Math.min(1, Math.log(1 + entry.recallCount) / Math.log(20))
      : 0;

    return (tfidfScore * W_TFIDF) + (recencyScore * W_RECENCY) + (frequencyScore * W_FREQUENCY);
  }

  // ── Private — Migration ────────────────────────────────────────────────────

  /** Convert v1 markdown to v2 structured store. */
  private migrateFromV1(markdown: string): MemoryStore {
    const entries = this.markdownToEntries(markdown);
    return {
      version: 2,
      lastModified: new Date().toISOString(),
      entries,
    };
  }

  /** Parse markdown content into structured entries. */
  private markdownToEntries(markdown: string): MemoryEntry[] {
    const trimmedInput = markdown.trim();
    if (!trimmedInput) return [];

    // Detect JSON input — if it's a v2 store blob, extract entries directly
    if (trimmedInput.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmedInput);
        if ((parsed.version === 2 || parsed.version === 3) && Array.isArray(parsed.entries)) {
          // It's a full MemoryStore — return the entries as-is
          return parsed.entries;
        }
      } catch { /* not valid JSON — fall through to markdown parsing */ }
    }

    const sections = trimmedInput.split(/(?=^####\s)/m);
    const entries: MemoryEntry[] = [];

    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) continue;

      const dateMatch = trimmed.match(/^####\s*(\d{4}-\d{2}-\d{2})\s*\n([\s\S]*)$/);
      const createdAt = dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString();
      const content = dateMatch ? dateMatch[2].trim() : trimmed;

      if (!content) continue;

      entries.push({
        id: randomUUID(),
        category: this.inferCategory(content),
        content,
        createdAt,
        updatedAt: createdAt,
        lastRecalledAt: null,
        recallCount: 0,
        archived: false,
      });
    }

    // If no #### sections found, treat the whole thing as one entry
    if (entries.length === 0 && trimmedInput) {
      entries.push({
        id: randomUUID(),
        category: this.inferCategory(trimmedInput),
        content: trimmedInput,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastRecalledAt: null,
        recallCount: 0,
        archived: false,
      });
    }

    return entries;
  }

  /**
   * Fix corrupt entries where content is a JSON store blob.
   * Replaces them with the actual entries from inside the blob.
   * Returns true if any entries were fixed.
   */
  private cleanBlobEntries(store: MemoryStore): boolean {
    let changed = false;
    const toRemove: number[] = [];
    const toAdd: MemoryEntry[] = [];

    for (let i = 0; i < store.entries.length; i++) {
      const entry = store.entries[i];
      if (entry.content.startsWith('{"version":')) {
        try {
          const blob = JSON.parse(entry.content);
          if ((blob.version === 2 || blob.version === 3) && Array.isArray(blob.entries)) {
            toRemove.push(i);
            // Extract real entries, skip duplicates already in store
            const existingIds = new Set(store.entries.map(e => e.id));
            for (const blobEntry of blob.entries as MemoryEntry[]) {
              if (!existingIds.has(blobEntry.id)) {
                toAdd.push(blobEntry);
                existingIds.add(blobEntry.id);
              }
            }
            changed = true;
          }
        } catch { /* not JSON — leave it */ }
      }
    }

    // Remove corrupt entries (reverse order to preserve indices)
    for (const idx of toRemove.reverse()) {
      store.entries.splice(idx, 1);
    }
    // Add extracted entries
    store.entries.push(...toAdd);

    if (changed) {
      store.lastModified = new Date().toISOString();
    }
    return changed;
  }

  /** Infer a category from content using keyword heuristics. */
  private inferCategory(content: string): MemoryCategory {
    const lower = content.toLowerCase();
    if (/\b(bug|fix|error|crash|issue|broken|regression)\b/.test(lower)) return 'bug-fix';
    if (/\b(prefer|always use|never use|style|workflow)\b/.test(lower)) return 'preference';
    if (/\b(architecture|structure|design|pattern|layout|monorepo)\b/.test(lower)) return 'architecture';
    if (/\b(convention|naming|format|lint|rule)\b/.test(lower)) return 'convention';
    if (/\b(config|setup|install|environment|tool|setting)\b/.test(lower)) return 'tool-config';
    if (/\b(decided|decision|chose|agreed|went with)\b/.test(lower)) return 'decision';
    if (/\b(pattern|approach|technique|method|strategy)\b/.test(lower)) return 'pattern';
    return 'general';
  }

  // ── Private — Conflict Detection (TF-IDF enhanced) ─────────────────────────

  /** Find an existing entry that conflicts with new content using TF-IDF similarity. */
  private findConflict(store: MemoryStore, index: TfIdfIndex, newContent: string, category?: MemoryCategory, customThreshold?: number): MemoryEntry | null {
    const threshold = customThreshold ?? CONFLICT_TFIDF_THRESHOLD;
    // Only check active entries in the same category
    for (const entry of store.entries) {
      if (entry.archived) continue;
      if (category && entry.category !== category) continue;

      // TF-IDF similarity check
      const similarity = index.similarityToText(entry.id, newContent);
      if (similarity > threshold) return entry;

      // First-line exact match fallback (catches renamed/reformatted entries)
      const newFirstLine = newContent.toLowerCase().split('\n')[0].trim();
      const existingFirstLine = entry.content.toLowerCase().split('\n')[0].trim();
      if (newFirstLine.length > 10 && newFirstLine === existingFirstLine) return entry;
    }

    return null;
  }

  // ── Private — Filtering ────────────────────────────────────────────────────

  /** Filter entries to active (non-archived), optionally respecting branch scope. */
  private filterActive(entries: MemoryEntry[], branch?: string): MemoryEntry[] {
    return entries.filter(e => {
      if (e.archived) return false;
      // If entry is branch-scoped, only include if branch matches
      if (e.branch && branch && e.branch !== branch) return false;
      return true;
    });
  }

  // ── Private — Formatting ───────────────────────────────────────────────────

  /** Format entries for system prompt (compact, category-grouped). */
  private formatEntriesForPrompt(entries: MemoryEntry[]): string {
    const layerLabels: Record<string, string> = {
      person: 'About You',
      workflow: 'How You Work',
      project: 'This Project',
    };

    // Group by layer first, then category within each layer
    const byLayer = new Map<string, MemoryEntry[]>();
    for (const entry of entries) {
      const layer = entry.layer ?? 'workflow';
      const list = byLayer.get(layer) ?? [];
      list.push(entry);
      byLayer.set(layer, list);
    }

    const parts: string[] = [];
    for (const layerKey of ['person', 'workflow', 'project']) {
      const layerEntries = byLayer.get(layerKey);
      if (!layerEntries || layerEntries.length === 0) continue;

      const items = layerEntries.map(e => {
        const stale = this.isStale(e) ? ' (stale)' : '';
        const branchTag = e.branch ? ` [${e.branch}]` : '';
        return `- [${e.category}] ${e.content}${branchTag}${stale}`;
      }).join('\n');
      parts.push(`**${layerLabels[layerKey] || layerKey}:**\n${items}`);
    }

    return parts.join('\n\n');
  }

  /** Format entries as flat markdown (for v1 compat and human-readable mirror). */
  private formatEntriesAsMarkdown(entries: MemoryEntry[]): string {
    return entries.map(e => {
      const date = e.createdAt.split('T')[0];
      const branchTag = e.branch ? ` [branch: ${e.branch}]` : '';
      return `#### ${date}${branchTag}\n${e.content}`;
    }).join('\n\n');
  }

  /** Check if an entry is stale (not recalled in 90+ days). */
  private isStale(entry: MemoryEntry): boolean {
    const lastActivity = entry.lastRecalledAt ?? entry.updatedAt ?? entry.createdAt;
    const daysSince = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > STALE_THRESHOLD_DAYS;
  }

  // ── Private — File I/O ─────────────────────────────────────────────────────

  /** Atomic write with lock: acquire lock → temp file → rename → release. */
  private async writeSafe(path: string, content: string): Promise<void> {
    const { withLock } = await import('../core/file-lock.js');
    await withLock(path, async () => {
      const tmpPath = path + '.tmp';
      await writeFile(tmpPath, content, 'utf-8');
      try {
        await rename(tmpPath, path);
      } catch (err) {
        await unlink(tmpPath).catch(() => {});
        throw err;
      }
    });
  }

  // ── Project Registry ────────────────────────────────────────────────────────

  /** Register the current project in the global project registry. */
  private async registerProject(projectRoot: string): Promise<void> {
    const registryPath = join(this.globalDir, PROJECTS_REGISTRY);
    let registry: ProjectRegistryEntry[] = [];

    try {
      const data = await readFile(registryPath, 'utf-8');
      registry = JSON.parse(data);
    } catch {
      // No registry yet or corrupt — start fresh
    }

    const existing = registry.findIndex(p => p.path === projectRoot);
    const entry: ProjectRegistryEntry = {
      path: projectRoot,
      name: basename(projectRoot),
      lastUsed: new Date().toISOString(),
      // Opening a project must not forget who it is related to. This rebuilds
      // the entry wholesale on every load, so the links have to be carried
      // across explicitly or they would last exactly one session.
      ...(existing >= 0 && registry[existing].relatedProjects?.length
        ? { relatedProjects: registry[existing].relatedProjects }
        : {}),
    };

    if (existing >= 0) {
      registry[existing] = entry;
    } else {
      registry.push(entry);
    }

    await mkdir(this.globalDir, { recursive: true });
    await this.writeSafe(registryPath, JSON.stringify(registry, null, 2));
  }

  /**
   * Link two projects, so a search in one can reach the other.
   *
   * Symmetric on purpose. "web depends on core" is the fact a person states,
   * but the useful question runs both ways: working in core, you want to know
   * what breaks in web. A one-way edge would answer half of it and look
   * broken for the other half.
   *
   * Idempotent, and it refuses to link a project to itself.
   */
  async linkProjects(a: string, b: string): Promise<void> {
    if (a === b) return;
    const registry = await this.loadProjectRegistry();

    const ensure = (path: string): ProjectRegistryEntry => {
      let entry = registry.find(p => p.path === path);
      if (!entry) {
        entry = { path, name: basename(path), lastUsed: new Date().toISOString() };
        registry.push(entry);
      }
      return entry;
    };

    const ea = ensure(a);
    const eb = ensure(b);
    ea.relatedProjects = [...new Set([...(ea.relatedProjects ?? []), b])];
    eb.relatedProjects = [...new Set([...(eb.relatedProjects ?? []), a])];

    await mkdir(this.globalDir, { recursive: true });
    await this.writeSafe(join(this.globalDir, PROJECTS_REGISTRY), JSON.stringify(registry, null, 2));
    logger.debug(`[memory] linked projects: ${basename(a)} <-> ${basename(b)}`);
  }

  /** Remove the link both ways. Silent when there was none. */
  async unlinkProjects(a: string, b: string): Promise<void> {
    const registry = await this.loadProjectRegistry();
    for (const [x, y] of [[a, b], [b, a]]) {
      const entry = registry.find(p => p.path === x);
      if (entry?.relatedProjects) {
        entry.relatedProjects = entry.relatedProjects.filter(p => p !== y);
        if (entry.relatedProjects.length === 0) delete entry.relatedProjects;
      }
    }
    await this.writeSafe(join(this.globalDir, PROJECTS_REGISTRY), JSON.stringify(registry, null, 2));
  }

  /** The projects this one is linked to, as absolute paths. */
  async getRelatedProjects(projectRoot: string): Promise<string[]> {
    const registry = await this.loadProjectRegistry();
    return registry.find(p => p.path === projectRoot)?.relatedProjects ?? [];
  }

  /** Load the project registry — all known project paths. */
  private async loadProjectRegistry(): Promise<ProjectRegistryEntry[]> {
    try {
      const data = await readFile(join(this.globalDir, PROJECTS_REGISTRY), 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
}
