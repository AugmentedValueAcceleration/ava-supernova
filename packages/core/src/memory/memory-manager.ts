import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PlatformMemorySync, SemanticMatch } from './platform-sync.js';
import type {
  MemoryEntry,
  MemoryCategory,
  MemoryStore,
  MemorySaveOptions,
  MemoryRecallOptions,
  MemoryRecallResult,
  MemoryStoreSummary,
} from './types.js';
import { MEMORY_CATEGORIES, createEmptyStore } from './types.js';

const MEMORY_FILENAME_V1 = 'memory.md';
const MEMORY_FILENAME_V2 = 'memory.json';

/** Number of days without recall before a memory is considered stale. */
const STALE_THRESHOLD_DAYS = 90;

export class MemoryManager {
  private readonly globalDir: string;
  private readonly projectDir: string | null;
  private readonly sync?: PlatformMemorySync;

  // In-memory caches — loaded lazily, written through on save
  private globalStore: MemoryStore | null = null;
  private projectStore: MemoryStore | null = null;

  constructor(opts: { globalDir: string; projectRoot?: string; sync?: PlatformMemorySync }) {
    this.globalDir = opts.globalDir;
    this.projectDir = opts.projectRoot ? join(opts.projectRoot, '.ava') : null;
    this.sync = opts.sync;
  }

  // ── Public API — Load ──────────────────────────────────────────────────────

  /** Load global memory store, migrating from v1 if needed. */
  async loadGlobalStore(): Promise<MemoryStore> {
    if (this.globalStore) return this.globalStore;
    this.globalStore = await this.loadStore(this.globalDir, 'global');
    return this.globalStore;
  }

  /** Load project memory store, migrating from v1 if needed. */
  async loadProjectStore(): Promise<MemoryStore | null> {
    if (!this.projectDir) return null;
    if (this.projectStore) return this.projectStore;
    this.projectStore = await this.loadStore(this.projectDir, 'project');
    return this.projectStore;
  }

  /** Load both stores and format for system prompt injection. */
  async loadAll(context?: string): Promise<string> {
    const [globalStore, projectStore, episodic] = await Promise.all([
      this.loadGlobalStore(),
      this.loadProjectStore(),
      context ? this.loadRelevantMemories(context) : Promise.resolve([]),
    ]);

    const sections: string[] = [];

    if (globalStore.entries.length > 0) {
      sections.push(`### Global Memory\n${this.formatEntriesForPrompt(globalStore.entries)}`);
    }
    if (projectStore && projectStore.entries.length > 0) {
      sections.push(`### Project Memory\n${this.formatEntriesForPrompt(projectStore.entries)}`);
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
    await this.persistStore(this.globalDir, store);
    this.syncPush('global', 'memory.json', JSON.stringify(store));
  }

  /** Overwrite project memory with raw markdown (v1 compat — used by dashboard). */
  async saveProjectMemory(content: string): Promise<void> {
    if (!this.projectDir) throw new Error('No project root configured.');
    await mkdir(this.projectDir, { recursive: true });
    const store = await this.loadProjectStore() ?? createEmptyStore();
    store.entries = this.markdownToEntries(content);
    store.lastModified = new Date().toISOString();
    this.projectStore = store;
    await this.persistStore(this.projectDir, store);
    this.syncPush('project', 'memory.json', JSON.stringify(store));
  }

  /** Append raw markdown entry (v1 compat). */
  async appendGlobal(entry: string): Promise<void> {
    await this.saveEntry({
      scope: 'global',
      content: entry.replace(/^####\s*\d{4}-\d{2}-\d{2}\n/, ''), // strip v1 date header
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

  /** Save a new memory entry with conflict detection. Returns the saved entry. */
  async saveEntry(opts: MemorySaveOptions): Promise<MemoryEntry> {
    const store = opts.scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore() ?? createEmptyStore();

    if (opts.scope === 'project' && this.projectDir) {
      await mkdir(this.projectDir, { recursive: true });
    }

    // Conflict detection — find existing entry with high similarity
    const conflict = this.findConflict(store, opts.content, opts.category);

    let entry: MemoryEntry;

    if (conflict) {
      // Update existing entry instead of duplicating
      conflict.content = opts.content;
      conflict.updatedAt = new Date().toISOString();
      conflict.category = opts.category ?? conflict.category;
      if (opts.tags) conflict.tags = opts.tags;
      entry = conflict;
    } else {
      // Create new entry
      entry = {
        id: randomUUID(),
        category: opts.category ?? 'general',
        content: opts.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastRecalledAt: null,
        recallCount: 0,
        sourceConversationId: opts.sourceConversationId,
        tags: opts.tags,
      };
      store.entries.push(entry);
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

    this.syncPush(opts.scope, 'memory.json', JSON.stringify(store));
    return entry;
  }

  /** Update an existing memory entry by ID. */
  async updateEntry(scope: 'global' | 'project', id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'category' | 'tags'>>): Promise<MemoryEntry | null> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore();
    if (!store) return null;

    const entry = store.entries.find(e => e.id === id);
    if (!entry) return null;

    if (updates.content !== undefined) entry.content = updates.content;
    if (updates.category !== undefined) entry.category = updates.category;
    if (updates.tags !== undefined) entry.tags = updates.tags;
    entry.updatedAt = new Date().toISOString();
    store.lastModified = new Date().toISOString();

    if (scope === 'global') {
      this.globalStore = store;
      await this.persistStore(this.globalDir, store);
    } else if (this.projectDir) {
      this.projectStore = store;
      await this.persistStore(this.projectDir, store);
    }

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

    if (scope === 'global') {
      this.globalStore = store;
      await this.persistStore(this.globalDir, store);
    } else if (this.projectDir) {
      this.projectStore = store;
      await this.persistStore(this.projectDir, store);
    }

    return true;
  }

  /** Search memories with optional category filter. Updates recallCount. */
  async recall(opts: MemoryRecallOptions): Promise<MemoryRecallResult[]> {
    const results: MemoryRecallResult[] = [];
    const lowerQuery = opts.query.toLowerCase();
    const limit = opts.limit ?? 10;

    const searchStore = async (store: MemoryStore, scope: 'global' | 'project') => {
      for (const entry of store.entries) {
        // Category filter
        if (opts.category && entry.category !== opts.category) continue;

        // Substring match
        if (entry.content.toLowerCase().includes(lowerQuery) ||
            entry.tags?.some(t => t.toLowerCase().includes(lowerQuery))) {
          results.push({ entry, scope, relevance: 1.0, matchType: 'substring' });

          // Update recall stats
          entry.lastRecalledAt = new Date().toISOString();
          entry.recallCount++;
        }
      }
    };

    if (opts.scope !== 'project') {
      const globalStore = await this.loadGlobalStore();
      await searchStore(globalStore, 'global');
    }

    if (opts.scope !== 'global') {
      const projectStore = await this.loadProjectStore();
      if (projectStore) await searchStore(projectStore, 'project');
    }

    // Sort by relevance then recency
    results.sort((a, b) => {
      if (a.relevance !== b.relevance) return b.relevance - a.relevance;
      return new Date(b.entry.updatedAt).getTime() - new Date(a.entry.updatedAt).getTime();
    });

    // If no substring matches, try semantic search via platform
    if (results.length === 0 && this.sync) {
      const semantic = await this.loadRelevantMemories(opts.query, limit);
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

    // Persist updated recall stats
    if (results.some(r => r.matchType === 'substring')) {
      await Promise.all([
        this.globalStore ? this.persistStore(this.globalDir, this.globalStore) : Promise.resolve(),
        this.projectStore && this.projectDir ? this.persistStore(this.projectDir, this.projectStore) : Promise.resolve(),
      ]);
    }

    return results.slice(0, limit);
  }

  /** Get summary statistics for a store. */
  async getSummary(scope: 'global' | 'project'): Promise<MemoryStoreSummary> {
    const store = scope === 'global'
      ? await this.loadGlobalStore()
      : await this.loadProjectStore() ?? createEmptyStore();

    const byCategory = {} as Record<MemoryCategory, number>;
    for (const cat of MEMORY_CATEGORIES) byCategory[cat] = 0;

    const now = Date.now();
    let staleCount = 0;
    let oldest: string | null = null;
    let newest: string | null = null;

    for (const entry of store.entries) {
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;

      if (!oldest || entry.createdAt < oldest) oldest = entry.createdAt;
      if (!newest || entry.createdAt > newest) newest = entry.createdAt;

      const lastActivity = entry.lastRecalledAt ?? entry.updatedAt ?? entry.createdAt;
      const daysSince = (now - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > STALE_THRESHOLD_DAYS) staleCount++;
    }

    return {
      totalEntries: store.entries.length,
      byCategory,
      oldestEntry: oldest,
      newestEntry: newest,
      staleCount,
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

  /** Invalidate cached stores (e.g. after external edit). */
  clearCache(): void {
    this.globalStore = null;
    this.projectStore = null;
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
      if (parsed.version === 2 && Array.isArray(parsed.entries)) {
        return parsed;
      }
    } catch { /* v2 doesn't exist or is corrupt */ }

    // Try migrating from v1
    try {
      const v1Content = await readFile(v1Path, 'utf-8');
      if (v1Content?.trim()) {
        const store = this.migrateFromV1(v1Content);
        // Persist the migrated store
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
          const content = remote.map((m) => m.content).join('\n\n');
          const store = this.migrateFromV1(content);
          await mkdir(dir, { recursive: true });
          await this.persistStore(dir, store);
          return store;
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

    // Also write a human-readable markdown mirror
    const mdPath = join(dir, MEMORY_FILENAME_V1);
    const markdown = this.formatEntriesAsMarkdown(store.entries);
    await this.writeSafe(mdPath, markdown);
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
    const sections = markdown.split(/(?=^####\s)/m);
    const entries: MemoryEntry[] = [];

    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) continue;

      // Try to extract date from #### header
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
      });
    }

    // If no #### sections found, treat the whole thing as one entry
    if (entries.length === 0 && markdown.trim()) {
      entries.push({
        id: randomUUID(),
        category: this.inferCategory(markdown),
        content: markdown.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastRecalledAt: null,
        recallCount: 0,
      });
    }

    return entries;
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

  // ── Private — Conflict Detection ───────────────────────────────────────────

  /** Find an existing entry that conflicts with new content. */
  private findConflict(store: MemoryStore, newContent: string, category?: MemoryCategory): MemoryEntry | null {
    const newLower = newContent.toLowerCase();
    const newWords = new Set(newLower.split(/\s+/).filter(w => w.length > 3));

    for (const entry of store.entries) {
      // Must be same category (or new has no category)
      if (category && entry.category !== category) continue;

      const existingLower = entry.content.toLowerCase();
      const existingWords = new Set(existingLower.split(/\s+/).filter(w => w.length > 3));

      // Calculate Jaccard similarity of significant words
      const intersection = [...newWords].filter(w => existingWords.has(w)).length;
      const union = new Set([...newWords, ...existingWords]).size;
      const similarity = union > 0 ? intersection / union : 0;

      // High overlap = likely the same topic, update instead of duplicate
      if (similarity > 0.6) return entry;

      // Also check if the first line (likely the "title") matches
      const newFirstLine = newLower.split('\n')[0].trim();
      const existingFirstLine = existingLower.split('\n')[0].trim();
      if (newFirstLine.length > 10 && newFirstLine === existingFirstLine) return entry;
    }

    return null;
  }

  // ── Private — Formatting ───────────────────────────────────────────────────

  /** Format entries for system prompt (compact, category-grouped). */
  private formatEntriesForPrompt(entries: MemoryEntry[]): string {
    // Group by category
    const grouped = new Map<MemoryCategory, MemoryEntry[]>();
    for (const entry of entries) {
      const list = grouped.get(entry.category) ?? [];
      list.push(entry);
      grouped.set(entry.category, list);
    }

    const parts: string[] = [];
    for (const [category, categoryEntries] of grouped) {
      const label = category.charAt(0).toUpperCase() + category.slice(1).replace('-', ' ');
      const items = categoryEntries.map(e => {
        const stale = this.isStale(e) ? ' ⚠️ stale' : '';
        return `- ${e.content}${stale}`;
      }).join('\n');
      parts.push(`**${label}:**\n${items}`);
    }

    return parts.join('\n\n');
  }

  /** Format entries as flat markdown (for v1 compat and human-readable mirror). */
  private formatEntriesAsMarkdown(entries: MemoryEntry[]): string {
    return entries.map(e => {
      const date = e.createdAt.split('T')[0];
      return `#### ${date}\n${e.content}`;
    }).join('\n\n');
  }

  /** Check if an entry is stale (not recalled in 90+ days). */
  private isStale(entry: MemoryEntry): boolean {
    const lastActivity = entry.lastRecalledAt ?? entry.updatedAt ?? entry.createdAt;
    const daysSince = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > STALE_THRESHOLD_DAYS;
  }

  // ── Private — File I/O ─────────────────────────────────────────────────────

  /** Atomic write: temp file → rename. */
  private async writeSafe(path: string, content: string): Promise<void> {
    const tmpPath = path + '.tmp';
    await writeFile(tmpPath, content, 'utf-8');
    try {
      await rename(tmpPath, path);
    } catch (err) {
      await unlink(tmpPath).catch(() => {});
      throw err;
    }
  }

  /** Fire-and-forget push to platform. Never throws. */
  private syncPush(scope: 'global' | 'project', key: string, content: string): void {
    if (!this.sync) return;
    this.sync.push(scope, key, content).catch(() => {
      /* platform unavailable — local is source of truth */
    });
  }
}
