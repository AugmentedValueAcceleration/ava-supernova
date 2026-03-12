/**
 * Memory v2 — Structured memory types.
 *
 * Replaces flat markdown with categorized, timestamped entries
 * that support conflict detection, relevance scoring, and smart retrieval.
 */

/** Categories for memory entries — helps with filtering and display. */
export type MemoryCategory =
  | 'pattern'       // Coding patterns, conventions, best practices
  | 'preference'    // User preferences (style, workflow, tools)
  | 'architecture'  // Architectural decisions, project structure
  | 'bug-fix'       // Bug fixes, gotchas, known issues
  | 'convention'    // Naming conventions, code style rules
  | 'tool-config'   // Tool settings, environment setup
  | 'decision'      // Key decisions made during development
  | 'person'        // People, roles, contacts
  | 'general';      // Catch-all for anything that doesn't fit

/** A single structured memory entry. */
export interface MemoryEntry {
  /** Unique identifier (UUID v4 or nanoid). */
  id: string;
  /** What category this memory belongs to. */
  category: MemoryCategory;
  /** The actual memory content (markdown). */
  content: string;
  /** When this memory was first created (ISO 8601). */
  createdAt: string;
  /** When this memory was last updated (ISO 8601). */
  updatedAt: string;
  /** When this memory was last recalled/used (ISO 8601 or null). */
  lastRecalledAt: string | null;
  /** How many times this memory has been recalled. */
  recallCount: number;
  /** Which conversation created this memory (for traceability). */
  sourceConversationId?: string;
  /** Optional tags for additional filtering. */
  tags?: string[];

  // ── Phase 3 fields ────────────────────────────────────────────────────
  /** Whether this entry has been archived (stale, auto-archived). */
  archived?: boolean;
  /** When this entry was archived (ISO 8601 or null). */
  archivedAt?: string | null;
  /** Git branch this memory is scoped to (null = all branches). */
  branch?: string | null;
  /** Directory scope within the project (null = whole project). */
  directoryScope?: string | null;
}

/** The full structured memory store persisted as JSON. */
export interface MemoryStore {
  /** Schema version for future migrations. */
  version: 2;
  /** When this store was last modified (ISO 8601). */
  lastModified: string;
  /** The memory entries. */
  entries: MemoryEntry[];
}

/** Options for saving a memory entry. */
export interface MemorySaveOptions {
  scope: 'global' | 'project';
  content: string;
  category?: MemoryCategory;
  tags?: string[];
  sourceConversationId?: string;
  /** Scope this memory to a specific git branch. */
  branch?: string | null;
  /** Scope this memory to a specific directory within the project. */
  directoryScope?: string | null;
}

/** Options for searching/recalling memories. */
export interface MemoryRecallOptions {
  query: string;
  /** Where to search: "global", "project", "all" (global+current), or "all_projects" (global+every known project). */
  scope?: 'global' | 'project' | 'all' | 'all_projects';
  category?: MemoryCategory;
  limit?: number;
  /** Only return memories scoped to this branch (or unscoped). */
  branch?: string | null;
  /** Include archived entries in results. Default: false. */
  includeArchived?: boolean;
}

/** A recall result with relevance info. */
export interface MemoryRecallResult {
  entry: MemoryEntry;
  /** Scope label — 'global', 'project', or a project name for cross-project results. */
  scope: 'global' | 'project' | string;
  /** How relevant this result is (0–1). Combines TF-IDF, recency, and frequency. */
  relevance: number;
  /** How the match was found. */
  matchType: 'exact' | 'substring' | 'tfidf' | 'semantic';
}

/** A group of related memory entries (for consolidation). */
export interface MemoryConsolidationGroup {
  /** Representative entry (highest recall count). */
  primary: MemoryEntry;
  /** Related entries that could be merged. */
  related: MemoryEntry[];
  /** Average pairwise similarity within the group. */
  avgSimilarity: number;
  /** Suggested consolidated content (null until model generates it). */
  suggestedContent?: string | null;
}

/** Summary of a memory store for display. */
export interface MemoryStoreSummary {
  totalEntries: number;
  byCategory: Record<MemoryCategory, number>;
  oldestEntry: string | null;
  newestEntry: string | null;
  staleCount: number; // entries not recalled in 90+ days
  archivedCount: number; // entries that have been auto-archived
  branchScoped: number; // entries scoped to a specific branch
}

/** All valid categories as an array (for validation). */
export const MEMORY_CATEGORIES: MemoryCategory[] = [
  'pattern', 'preference', 'architecture', 'bug-fix',
  'convention', 'tool-config', 'decision', 'person', 'general',
];

/** Default empty store. */
export function createEmptyStore(): MemoryStore {
  return {
    version: 2,
    lastModified: new Date().toISOString(),
    entries: [],
  };
}
