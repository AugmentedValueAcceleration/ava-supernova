import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TfIdfIndex } from './tfidf.js';
import type { PlatformMemorySync, SemanticMatch } from './platform-sync.js';
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
} from './types.js';
import { MEMORY_CATEGORIES, createEmptyStore, inferLayer } from './types.js';

const MEMORY_FILENAME_V1 = 'memory.md';
const MEMORY_FILENAME_V2 = 'memory.json';
const PROJECTS_REGISTRY = 'projects.json';

interface ProjectRegistryEntry {
  path: string;
  name: string;
  lastUsed: string;
}

/** Number of days without recall before a memory is considered stale. */
const STALE_THRESHOLD_DAYS = 90;

/** TF-IDF similarity threshold for conflict detection (higher = stricter). */
const CONFLICT_TFIDF_THRESHOLD = 0.45;

/** TF-IDF similarity threshold for consolidation grouping. */
const CONSOLIDATION_THRESHOLD = 0.35;

/** Minimum TF-IDF score to include in recall results.
 *  0.25 filters out weak noise while keeping valid semantic matches. */
const RECALL_TFIDF_THRESHOLD = 0.25;

// ── Relevance scoring weights ────────────────────────────────────────────────
const W_TFIDF = 0.55;     // TF-IDF match quality
const W_RECENCY = 0.25;   // How recently updated/recalled
const W_FREQUENCY = 0.20; // How often recalled

export class MemoryManager {
  private readonly globalDir: string;
  private readonly projectDir: string | null;
  private sync?: PlatformMemorySync;

  // In-memory caches — loaded lazily, written through on save
  private globalStore: MemoryStore | null = null;
  private projectStore: MemoryStore | null = null;

  // TF-IDF indexes — one per scope, rebuilt on load
  private globalIndex: TfIdfIndex = new TfIdfIndex();
  private projectIndex: TfIdfIndex = new TfIdfIndex();

  /** When true, skip all platform sync — memories stay on disk only. Default: true (local-first). */
  private localOnly = true;

  constructor(opts: { globalDir: string; projectRoot?: string; sync?: PlatformMemorySync; localOnly?: boolean }) {
    this.globalDir = opts.globalDir;
    this.projectDir = opts.projectRoot ? join(opts.projectRoot, '.ava') : null;
    this.sync = opts.sync;
    this.localOnly = opts.localOnly ?? true;

    // Auto-register this project in the global registry (fire-and-forget)
    if (opts.projectRoot) {
      this.registerProject(opts.projectRoot).catch(() => {});
    }
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
    const [globalStore, projectStore, episodic] = await Promise.all([
      this.loadGlobalStore(),
      this.loadProjectStore(),
      context ? this.loadRelevantMemories(context) : Promise.resolve([]),
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
    if (episodic.length > 0) {
      const items = episodic
        .map((m) => `- **${m.key}** (${m.scope}, ${Math.round(m.similarity * 100)}% match): ${m.content}`)
        .join('\n');
      sections.push(`### Relevant Memories\n${items}`);
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
    this.syncEntries('global', store.entries);
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
    this.syncEntries('project', store.entries);
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
    const store = opts.scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore() ?? createEmptyStore();

    if (opts.scope === 'project' && this.projectDir) {
      await mkdir(this.projectDir, { recursive: true });
    }

    const index = opts.scope === 'global' ? this.globalIndex : this.projectIndex;

    // Determine layer
    const category = opts.category ?? 'general';
    const layer: MemoryLayer = opts.layer ?? inferLayer(category, opts.scope);

    // Conflict detection — skip for project layer (never auto-dedup project memories)
    const conflict = layer === 'project'
      ? null
      : this.findConflict(store, index, opts.content, opts.category);

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

    store.lastModified = new Date().toISOString();

    // Update cache and persist
    if (opts.scope === 'global') {
      this.globalStore = store;
      await this.persistStore(this.globalDir, store);
    } else {
      this.projectStore = store;
      if (this.projectDir) await this.persistStore(this.projectDir, store);
    }

    this.syncEntries(opts.scope, store.entries);
    return entry;
  }

  /** Update an existing memory entry by ID. */
  async updateEntry(scope: 'global' | 'project', id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'category' | 'tags' | 'branch' | 'directoryScope'>>): Promise<MemoryEntry | null> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    if (!store) return null;

    const entry = store.entries.find(e => e.id === id);
    if (!entry) return null;

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

    this.syncEntries(scope, store.entries);
    return entry;
  }

  /** Delete a memory entry by ID. */
  async deleteEntry(scope: 'global' | 'project', id: string): Promise<boolean> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    if (!store) return false;

    const idx = store.entries.findIndex(e => e.id === id);
    if (idx === -1) return false;

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

    this.syncEntries(scope, store.entries);
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

    this.syncEntries(scope, []);
  }

  /**
   * Delete ALL entries from ALL scopes — global + current project + all known projects.
   * Reads the project registry to find every project memory file.
   */
  async clearEverything(): Promise<void> {
    // Disable sync to prevent re-upload of cached entries
    this.sync = undefined;
    this.localOnly = true;

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
   * Falls back to substring for exact matches, then semantic via platform.
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

    if (opts.scope === 'all_projects') {
      // Search every known project (including current)
      const projects = await this.loadProjectRegistry();
      for (const proj of projects) {
        const projAvaDir = join(proj.path, '.ava');
        // Skip the current project — it's searched via 'project' scope below
        if (this.projectDir && projAvaDir === this.projectDir) continue;
        // Only search projects that still exist on disk
        if (!existsSync(join(projAvaDir, MEMORY_FILENAME_V2))) continue;

        try {
          const storeData = await readFile(join(projAvaDir, MEMORY_FILENAME_V2), 'utf-8');
          const store = JSON.parse(storeData) as MemoryStore;
          const tempIndex = new TfIdfIndex();
          this.rebuildIndex(store, tempIndex);
          searchStore(store, `project:${proj.name}`, tempIndex);
        } catch {
          // Skip unreadable project stores
        }
      }
    }

    if (opts.scope !== 'global') {
      const projectStore = await this.loadProjectStore();
      if (projectStore) searchStore(projectStore, 'project', this.projectIndex);
    }

    // Sort by composite relevance score
    results.sort((a, b) => b.relevance - a.relevance);

    // If no local matches, try semantic search via platform
    if (results.length === 0 && this.sync) {
      const semantic = opts.scope === 'all_projects'
        ? await this.sync.semanticSearch(opts.query, { allProjects: true, threshold: 0.65, limit }).catch(() => [] as SemanticMatch[])
        : await this.loadRelevantMemories(opts.query, limit);
      for (const m of semantic) {
        results.push({
          entry: {
            id: m.id,
            category: 'general',
            content: m.content,
            createdAt: '',
            updatedAt: '',
            lastRecalledAt: new Date().toISOString(),
            recallCount: 0,
          },
          scope: m.scope,
          relevance: m.similarity,
          matchType: 'semantic',
        });
      }
    }

    // Persist updated recall stats and sync
    if (results.some(r => r.matchType === 'substring' || r.matchType === 'tfidf')) {
      await Promise.all([
        this.globalStore ? this.persistStore(this.globalDir, this.globalStore) : Promise.resolve(),
        this.projectStore && this.projectDir ? this.persistStore(this.projectDir, this.projectStore) : Promise.resolve(),
      ]);
      // Don't sync on recall — only sync when explicitly saving/updating
      // Recall just updates lastRecalledAt counters, not content
    }

    return results.slice(0, limit);
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
      this.syncEntries(scope, store.entries);
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

    this.syncEntries(scope, store.entries);
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

    this.syncEntries(scope, store.entries);
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
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    return store?.entries ?? [];
  }

  /** Get file path for a scope (for display). */
  getPath(scope: 'global' | 'project'): string | null {
    if (scope === 'global') return join(this.globalDir, MEMORY_FILENAME_V2);
    return this.projectDir ? join(this.projectDir, MEMORY_FILENAME_V2) : null;
  }

  /**
   * Pull latest memories from the platform and merge into local store.
   * Remote entries win conflicts (by updatedAt). Returns count of new/updated entries.
   */
  async pullLatest(scope: 'global' | 'project'): Promise<number> {
    if (!this.sync || this.localOnly) return 0;

    try {
      const remote = await this.sync.pull(scope);
      if (remote.length === 0) return 0;

      const store = scope === 'global'
        ? await this.loadGlobalStore()
        : await this.loadProjectStore() ?? { version: 2 as const, lastModified: new Date().toISOString(), entries: [] };

      let updated = 0;
      for (const r of remote) {
        if (r.key === 'memory.json') continue; // Skip legacy blob records
        const existing = store.entries.find(e => e.id === r.key);
        if (existing) {
          // Remote wins if newer
          if (r.updated_at > existing.updatedAt) {
            existing.content = r.content;
            existing.updatedAt = r.updated_at;
            existing.category = this.inferCategory(r.content);
            updated++;
          }
        } else {
          // New entry from remote
          store.entries.push({
            id: r.key,
            category: this.inferCategory(r.content),
            content: r.content,
            createdAt: r.updated_at,
            updatedAt: r.updated_at,
            lastRecalledAt: null,
            recallCount: 0,
            archived: false,
          });
          updated++;
        }
      }

      if (updated > 0) {
        store.lastModified = new Date().toISOString();
        const dir = scope === 'global' ? this.globalDir : this.projectDir;
        if (dir) {
          await this.persistStore(dir, store);
          this.clearCache();
        }
      }

      return updated;
    } catch {
      return 0;
    }
  }

  /** Invalidate cached stores and TF-IDF indexes. */
  clearCache(): void {
    this.globalStore = null;
    this.projectStore = null;
    this.globalIndex.clear();
    this.projectIndex.clear();
  }

  // ── Semantic search (platform) ─────────────────────────────────────────────

  async loadRelevantMemories(context: string, limit = 5): Promise<SemanticMatch[]> {
    if (!this.sync) return [];
    try {
      return await this.sync.semanticSearch(context, { threshold: 0.65, limit });
    } catch {
      return [];
    }
  }

  // ── Private — Storage ──────────────────────────────────────────────────────

  private async loadStore(dir: string, scope: 'global' | 'project'): Promise<MemoryStore> {
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

    // Try bootstrapping from platform
    if (this.sync) {
      try {
        const remote = await this.sync.pull(scope);
        if (remote.length > 0) {
          // Build store from individual remote entries
          const entries: MemoryEntry[] = remote
            .filter((m) => m.key !== 'memory.json') // Skip legacy blob records
            .map((m) => ({
              id: m.key, // Local entry ID was used as the key
              category: this.inferCategory(m.content),
              content: m.content,
              createdAt: m.updated_at,
              updatedAt: m.updated_at,
              lastRecalledAt: null,
              recallCount: 0,
              archived: false,
            }));

          if (entries.length > 0) {
            const store: MemoryStore = {
              version: 2,
              lastModified: new Date().toISOString(),
              entries,
            };
            await mkdir(dir, { recursive: true });
            await this.persistStore(dir, store);
            return store;
          }

          // Fallback: if only legacy blob records exist, migrate them
          const legacyContent = remote.map((m) => m.content).join('\n\n');
          if (legacyContent.trim()) {
            const store = this.migrateFromV1(legacyContent);
            await mkdir(dir, { recursive: true });
            await this.persistStore(dir, store);
            return store;
          }
        }
      } catch { /* platform unavailable */ }
    }

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
  private findConflict(store: MemoryStore, index: TfIdfIndex, newContent: string, category?: MemoryCategory): MemoryEntry | null {
    // Only check active entries in the same category
    for (const entry of store.entries) {
      if (entry.archived) continue;
      if (category && entry.category !== category) continue;

      // TF-IDF similarity check
      const similarity = index.similarityToText(entry.id, newContent);
      if (similarity > CONFLICT_TFIDF_THRESHOLD) return entry;

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

  /** Set the localOnly flag at runtime (e.g. when user toggles the setting). */
  setLocalOnly(value: boolean): void {
    this.localOnly = value;
  }

  /** Fire-and-forget sync entries to platform. Never throws. */
  private syncEntries(scope: 'global' | 'project', entries: MemoryEntry[]): void {
    if (!this.sync || this.localOnly) return;
    this.sync.pushEntries(
      scope,
      entries.map((e) => ({
        id: e.id,
        content: e.content,
        category: e.category,
        tags: e.tags,
        archived: e.archived,
      })),
    ).catch(() => {
      /* platform unavailable — local is source of truth */
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
    };

    if (existing >= 0) {
      registry[existing] = entry;
    } else {
      registry.push(entry);
    }

    await mkdir(this.globalDir, { recursive: true });
    await this.writeSafe(registryPath, JSON.stringify(registry, null, 2));
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
