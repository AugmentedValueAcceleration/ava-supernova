/**
 * Memory v3 — Three-Layer Memory System.
 *
 * Memories are organised into three layers:
 *   Person   — who the user IS (name, role, values, personal context)
 *   Workflow — HOW they work (tools, style, feedback prefs, patterns)
 *   Project  — THIS codebase (architecture, bugs, decisions, conventions)
 *
 * Person + Workflow are always recalled. Project only when relevant.
 * Person and Workflow auto-deduplicate. Project never does.
 */

/** The three memory layers — primary organiser for every memory. */
export type MemoryLayer = 'person' | 'workflow' | 'project';

/** Categories for memory entries — finer granularity within each layer. */
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
  /** Which layer: person (who they are), workflow (how they work), project (this codebase). */
  layer?: MemoryLayer;
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
  /** Schema version — 2 = flat categories, 3 = three-layer system. */
  version: 2 | 3;
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
  /** Which layer. If omitted, inferred from category + scope. */
  layer?: MemoryLayer;
  tags?: string[];
  sourceConversationId?: string;
  /** Scope this memory to a specific git branch. */
  branch?: string | null;
  /** Scope this memory to a specific directory within the project. */
  directoryScope?: string | null;
  /**
   * What triggered this save. Used for the dataset capture layer's
   * memory_save event so we can train on which save sources produce
   * memories that get recalled and used vs. which produce noise.
   * Defaults to 'explicit' (a tool call from the model).
   */
  source?: 'explicit' | 'auto-extract' | 'reflection' | 'consolidation' | 'memory-agent';
}

/** Options for searching/recalling memories. */
export interface MemoryRecallOptions {
  query: string;
  /** Where to search: "global", "project", "all" (global+current), or "all_projects" (global+every known project). */
  scope?: 'global' | 'project' | 'all' | 'all_projects';
  category?: MemoryCategory;
  /** Filter to a specific layer. */
  layer?: MemoryLayer;
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
  /** Which layer this memory belongs to. */
  layer?: MemoryLayer;
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
  byLayer: Record<MemoryLayer, number>;
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

// ═══════════════════════════════════════════════════════════════════════════
// Memory v3 — Graph-Based Memory System
//
// Extends the v2 structured entries with: typed edges between nodes,
// confidence scoring with decay, contradiction detection, procedural
// learning, mode-aware recall, project brain synthesis, ambient capture,
// and principled forgetting. Every node with its edges is simultaneously
// a training example for Ava's future own-model.
// ═══════════════════════════════════════════════════════════════════════════

// ── Edge Types ─────────────────────────────────────────────────────────────

/** Typed directed relationships between memory nodes. */
export type EdgeType =
  | 'because'         // Causal: A because B (chose Tailwind because user prefers it)
  | 'implies'         // Inference: A implies B (prefers Tailwind implies frontend dev)
  | 'resolved-by'     // Bug→fix: A resolved by B
  | 'contradicts'     // Conflict: A contradicts B (flagged for resolution)
  | 'generalised-to'  // Specific→general: A generalises to B (this fix → always check middleware)
  | 'approved-by'     // Decision→approval: A was approved by user message B
  | 'supersedes'      // Replacement: A supersedes B (newer preference replaces older)
  | 'related-to'      // Weak association: A related to B (from v2 consolidation clusters)
  | 'depends-on'      // Prerequisite: A depends on B
  | 'learned-from';   // Procedural: procedure A learned from observations B,C,D

export const EDGE_TYPES: EdgeType[] = [
  'because', 'implies', 'resolved-by', 'contradicts', 'generalised-to',
  'approved-by', 'supersedes', 'related-to', 'depends-on', 'learned-from',
];

// ── Confidence ─────────────────────────────────────────────────────────────

/** How the initial confidence was determined. */
export type ConfidenceSource =
  | 'explicit'    // User explicitly said "remember this" (1.0)
  | 'stated'      // User stated a preference or decision (0.9)
  | 'approved'    // User approved a proposal (0.8)
  | 'llm-extract' // LLM extraction from conversation (0.7)
  | 'ambient'     // Ambient capture candidate scoring (0.6)
  | 'auto-extract' // Regex pattern extraction (0.5)
  | 'compression' // Extracted during context compression (0.4)
  | 'migrated';   // Migrated from v2 (0.5)

/** Initial confidence values per source type. */
export const CONFIDENCE_INITIAL: Record<ConfidenceSource, number> = {
  explicit: 1.0,
  stated: 0.9,
  approved: 0.8,
  'llm-extract': 0.7,
  ambient: 0.6,
  'auto-extract': 0.5,
  compression: 0.4,
  migrated: 0.5,
};

/** Confidence decay rate per day (halves in ~140 days if never reinforced). */
export const CONFIDENCE_DECAY_PER_DAY = 0.005;

/** Minimum confidence before auto-archival. */
export const CONFIDENCE_ARCHIVE_THRESHOLD = 0.1;

/** Maximum confidence (capped). */
export const CONFIDENCE_MAX = 1.0;

/** Reinforcement boost values per event type. */
export const CONFIDENCE_REINFORCEMENT = {
  recalled: 0.05,          // Surfaced in recall result
  briefed: 0.03,           // Included in project brain
  userRecalled: 0.10,      // User explicitly recalled and used
  restated: 0.20,          // User restated the same fact
  confirmed: 0.30,         // User confirmed during contradiction resolution
  edgeAdded: 0.05,         // Another node linked to this one
} as const;

// ── Memory Node (extends MemoryEntry) ──────────────────────────────────────

/** Archive reason for lifecycle tracking. */
export type ArchiveReason = 'decay' | 'contradiction' | 'manual' | 'stale' | 'superseded' | null;

/** Source of the memory node (how it was created). */
export type NodeSource =
  | 'user-explicit'  // User called memory_save or said "remember"
  | 'auto-extract'   // Regex pattern extraction (Layer 1)
  | 'llm-extract'    // LLM reflection extraction (Layer 2)
  | 'compression'    // Extracted during context compression
  | 'procedural'     // Crystallised from tool-use patterns
  | 'ambient'        // Ambient capture promotion
  | 'tool-save'      // Ava called memory_save tool
  | 'migrated';      // Migrated from v2

/**
 * MemoryNode extends MemoryEntry with graph-specific fields.
 * Backwards compatible — all new fields are optional with defaults
 * so v2 entries can be cast to MemoryNode with zero migration.
 */
export interface MemoryNode extends MemoryEntry {
  // ── Confidence system ──────────────────────────────────
  /** Node confidence 0.0–1.0. Decays over time, reinforced on recall/use. */
  confidence?: number;
  /** How the initial confidence was determined. */
  confidenceSource?: ConfidenceSource;
  /** When confidence was last boosted (ISO 8601). Resets decay clock. */
  lastReinforcedAt?: string;
  /** How many times confidence was boosted. */
  reinforcementCount?: number;

  // ── Lifecycle ──────────────────────────────────────────
  /** Why this node was archived. */
  archivedReason?: ArchiveReason;
  /** How this node was created. */
  source?: NodeSource;
  /** Which session created this node. */
  sourceSessionId?: string | null;
}

// ── Memory Edge ────────────────────────────────────────────────────────────

/** A typed directed relationship between two memory nodes. */
export interface MemoryEdge {
  /** Unique identifier (UUID). */
  id: string;
  /** Source node ID. */
  fromNodeId: string;
  /** Target node ID. */
  toNodeId: string;
  /** Relationship type. */
  type: EdgeType;
  /** Strength of the relationship 0.0–1.0. */
  weight: number;
  /** When this edge was created (ISO 8601). */
  createdAt: string;
  /** Edge-type-specific metadata. */
  metadata?: Record<string, unknown>;
}

// ── Graph Store ────────────────────────────────────────────────────────────

/** The full graph stored as JSON on disk. */
export interface MemoryGraphStore {
  /** Schema version — 4 = graph-based. */
  version: 4;
  /** All memory nodes (both active and pending-archive). */
  nodes: MemoryNode[];
  /** All edges between nodes. */
  edges: MemoryEdge[];
  /** When this store was last modified (ISO 8601). */
  lastModified: string;
  /** When confidence decay was last applied (ISO 8601). */
  lastDecayRun: string | null;
  /** When forgetting pass was last run (ISO 8601). */
  lastForgetRun: string | null;
}

/** Create an empty graph store. */
export function createEmptyGraphStore(): MemoryGraphStore {
  return {
    version: 4,
    nodes: [],
    edges: [],
    lastModified: new Date().toISOString(),
    lastDecayRun: null,
    lastForgetRun: null,
  };
}

// ── Procedural Patterns ────────────────────────────────────────────────────

/** A crystallised tool-use sequence learned from observation. */
export interface ProceduralPattern {
  /** Unique identifier. */
  id: string;
  /** Task type label (e.g. "react-component", "bug-fix", "refactor"). */
  taskType: string;
  /** Project root if project-specific, null if global. */
  project: string | null;
  /** The learned tool-call sequence. */
  toolSequence: string[];
  /** Typical argument patterns (file extensions, path patterns). */
  argPatterns: Record<string, string>;
  /** How many times this exact sequence was observed. */
  observationCount: number;
  /** Confidence 0.0–1.0 (increases with observations). */
  confidence: number;
  /** When this pattern was last observed (ISO 8601). */
  lastObservedAt: string;
  /** When this pattern was first created (ISO 8601). */
  createdAt: string;
  /** Memory node IDs this was learned from. */
  linkedNodeIds: string[];
  /** Whether this pattern has been crystallised (observationCount >= 3 + confidence >= 0.6). */
  crystallised: boolean;
}

/** Procedural patterns store. */
export interface ProceduralStore {
  version: 1;
  patterns: ProceduralPattern[];
  lastModified: string;
}

/** Create an empty procedural store. */
export function createEmptyProceduralStore(): ProceduralStore {
  return { version: 1, patterns: [], lastModified: new Date().toISOString() };
}

/** Minimum observations before crystallisation. */
export const PROCEDURAL_MIN_OBSERVATIONS = 3;
/** Minimum confidence before crystallisation. */
export const PROCEDURAL_MIN_CONFIDENCE = 0.6;

// ── Project Brain ──────────────────────────────────────────────────────────

/** Pre-computed synthesis of all project knowledge. */
export interface ProjectBrain {
  /** Which project this brain describes. */
  projectRoot: string;
  /** When this brain was generated (ISO 8601). */
  generatedAt: string;
  /** How many nodes contributed to this brain. */
  nodeCount: number;
  /** The injection text (~200 tokens). */
  brief: string;
  /** Detected/remembered technologies. */
  stack: string[];
  /** Top decisions by confidence. */
  keyDecisions: string[];
  /** Recent session summaries. */
  activeWork: string[];
  /** Top procedural patterns. */
  knownPatterns: string[];
  /** Average confidence across project nodes. */
  confidenceAvg: number;
  /** Date of the last session that touched this project. */
  lastSessionDate: string;
  /** Hash of the graph state when this brain was generated (for staleness check). */
  graphHash: string;
}

// ── Graph Recall ───────────────────────────────────────────────────────────

/** Ava's 6 modes for mode-aware recall weighting. */
export type AvaMode = 'work' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm';

/** Options for graph-based recall (extends v2 RecallOptions). */
export interface GraphRecallOptions {
  /** Search query text. */
  query: string;
  /** Where to search. */
  scope: 'global' | 'project' | 'all' | 'all_projects';
  /** Current mode for category weighting. */
  mode?: AvaMode;
  /** Maximum results to return. */
  limit: number;
  /** Filter by minimum confidence. */
  minConfidence?: number;
  /** Include archived nodes. */
  includeArchived?: boolean;
  /** Filter by git branch. */
  branch?: string | null;
  /** Filter by category. */
  category?: MemoryCategory;
  /** Filter by layer. */
  layer?: MemoryLayer;
  /** Follow edges to find contextually related nodes. */
  edgeTraversal?: boolean;
  /** How deep to follow edges (default 2). */
  traversalDepth?: number;
}

/** A scored recall result with optional chain information. */
export interface ScoredNode {
  /** The memory node. */
  node: MemoryNode;
  /** Composite relevance score 0.0–1.0. */
  score: number;
  /** How the match was found. */
  matchType: 'tfidf' | 'edge' | 'embedding' | 'exact';
  /** Scope label. */
  scope: 'global' | 'project' | string;
  /** If found via edge traversal, the path of nodes. */
  chain?: MemoryNode[];
  /** Edge types in the traversal path. */
  chainEdgeTypes?: EdgeType[];
}

// ── Ambient Capture ────────────────────────────────────────────────────────

/** A candidate memory extracted from a turn, pending scoring. */
export interface CaptureCandidate {
  /** The user's message in this turn. */
  userMessage: string;
  /** Ava's response in this turn. */
  assistantMessage: string;
  /** Tools used in this turn. */
  toolsUsed: string[];
  /** Turn index in the session. */
  turnIndex: number;
  /** Session ID for traceability. */
  sessionId?: string;
}

/** Scoring dimensions for a capture candidate. */
export interface CandidateScore {
  /** How different is this from existing nodes? 0=duplicate, 1=completely novel. */
  novelty: number;
  /** How likely to be useful in future sessions? */
  relevance: number;
  /** How clearly stated/decided is this? */
  confidence: number;
  /** Weighted composite score. */
  composite: number;
}

/** Threshold for promoting a candidate to a real node. */
export const AMBIENT_PROMOTE_THRESHOLD = 0.6;
/** Threshold for holding a candidate (promote if similar appears again). */
export const AMBIENT_HOLD_THRESHOLD = 0.4;

// ── Contradiction ──────────────────────────────────────────────────────────

/** A detected contradiction between two nodes. */
export interface Contradiction {
  /** The existing node. */
  existingNode: MemoryNode;
  /** The new node that contradicts it. */
  newNode: MemoryNode;
  /** Similarity score between the two. */
  similarity: number;
  /** The edge connecting them. */
  edge: MemoryEdge;
  /** Whether this has been resolved. */
  resolved: boolean;
  /** Resolution: which node won, or both kept with context. */
  resolution?: 'newer-wins' | 'older-wins' | 'context-dependent' | 'user-resolved';
}

/** All valid layers as an array. */
export const MEMORY_LAYERS: MemoryLayer[] = ['person', 'workflow', 'project'];

/** Which categories belong to which layer (default mapping). */
export const LAYER_CATEGORY_MAP: Record<MemoryLayer, MemoryCategory[]> = {
  person: ['person', 'general'],
  workflow: ['preference', 'convention', 'tool-config', 'pattern'],
  project: ['architecture', 'bug-fix', 'decision', 'general'],
};

/**
 * Infer layer from category + scope when layer isn't explicitly set.
 * Used for backwards compat with existing memories and LLM fallback.
 */
export function inferLayer(category: MemoryCategory, scope: 'global' | 'project'): MemoryLayer {
  if (scope === 'project') return 'project';
  if (category === 'person') return 'person';
  if (['preference', 'convention', 'tool-config', 'pattern'].includes(category)) return 'workflow';
  return 'workflow'; // safe default for global scope
}

/** Default empty store (v3 — three-layer). */
export function createEmptyStore(): MemoryStore {
  return {
    version: 3,
    lastModified: new Date().toISOString(),
    entries: [],
  };
}
