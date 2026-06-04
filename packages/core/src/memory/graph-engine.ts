/**
 * MemoryGraph — the core graph engine for Memory v3.
 *
 * Manages a directed graph of MemoryNodes connected by typed MemoryEdges.
 * Every operation (add, update, recall, decay, forget) goes through this
 * class. It owns persistence to disk (graph.json) and exposes a clean API
 * that MemoryManager wraps for backwards compatibility.
 *
 * Design principles:
 *   - Local-first: reads/writes disk, never requires network
 *   - Lazy decay: confidence decay is calculated on read, persisted on save
 *   - Edge-aware recall: follows typed edges to find contextually related nodes
 *   - Self-pruning: principled forgetting keeps the graph lean
 *   - Training-ready: every node+edge is a potential training example
 */

import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { logger } from '../core/logger.js';
import { TfIdfIndex, tokenize, cosineSimilarity, buildTermVector } from './tfidf.js';
import type {
  MemoryNode,
  MemoryEdge,
  EdgeType,
  MemoryGraphStore,
  GraphRecallOptions,
  ScoredNode,
  MemoryCategory,

  ConfidenceSource,
  ArchiveReason,
  NodeSource,
} from './types.js';
import {
  createEmptyGraphStore,
  CONFIDENCE_INITIAL,
  CONFIDENCE_DECAY_PER_DAY,
  CONFIDENCE_ARCHIVE_THRESHOLD,
  CONFIDENCE_MAX,
  CONFIDENCE_REINFORCEMENT,
} from './types.js';
import { MODE_CATEGORY_WEIGHTS } from './mode-recall.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const GRAPH_FILENAME = 'graph.json';
// Cold storage paths — reserved for Phase 2 (archive management UI)
// const COLD_DIR = 'cold';
// const COLD_FILENAME = 'archive.json';

/** Similarity threshold for "related" edge suggestion. */
const RELATED_THRESHOLD = 0.35;
/** Similarity threshold for contradiction detection. */
const CONTRADICTION_THRESHOLD = 0.7;
/** Similarity threshold for merge (near-duplicate). */
const MERGE_THRESHOLD = 0.9;
/** Days without recall before a node is considered stale (for forgetting). */
const STALE_DAYS = 90;
/** Default edge traversal depth for recall. */
const DEFAULT_TRAVERSAL_DEPTH = 2;

// ─── MemoryGraph ────────────────────────────────────────────────────────────

export class MemoryGraph {
  private store: MemoryGraphStore;
  private tfidfIndex: TfIdfIndex | null = null;
  private dirty = false;
  private readonly graphPath: string;
  // private readonly coldPath: string;

  constructor(readonly baseDir: string) {
    this.graphPath = join(baseDir, GRAPH_FILENAME);
    // this.coldPath = join(baseDir, COLD_DIR, COLD_FILENAME);
    this.store = createEmptyGraphStore();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Persistence
  // ═══════════════════════════════════════════════════════════════════════════

  async load(): Promise<void> {
    if (!existsSync(this.graphPath)) {
      this.store = createEmptyGraphStore();
      return;
    }
    try {
      const raw = await readFile(this.graphPath, 'utf-8');
      const parsed = JSON.parse(raw) as MemoryGraphStore;
      if (parsed.version !== 4) {
        logger.warn(`[graph] Unexpected graph version ${parsed.version}, loading anyway`);
      }
      this.store = parsed;
      this.rebuildTfIdfIndex();
      logger.debug(`[graph] Loaded ${this.store.nodes.length} nodes, ${this.store.edges.length} edges from ${this.graphPath}`);
    } catch (err) {
      logger.warn(`[graph] Failed to load graph: ${err instanceof Error ? err.message : String(err)}`);
      this.store = createEmptyGraphStore();
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    try {
      this.store.lastModified = new Date().toISOString();
      await mkdir(dirname(this.graphPath), { recursive: true });
      await writeFile(this.graphPath, JSON.stringify(this.store, null, 2), 'utf-8');
      this.dirty = false;
      logger.debug(`[graph] Saved ${this.store.nodes.length} nodes, ${this.store.edges.length} edges`);
    } catch (err) {
      logger.warn(`[graph] Failed to save graph: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Force save even if not dirty (e.g., after migration). */
  async forceSave(): Promise<void> {
    this.dirty = true;
    await this.save();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Node Operations
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get all active (non-archived) nodes. */
  getActiveNodes(): MemoryNode[] {
    return this.store.nodes.filter(n => !n.archived);
  }

  /** Get all nodes including archived. */
  getAllNodes(): MemoryNode[] {
    return [...this.store.nodes];
  }

  /** Get a node by ID. */
  getNode(id: string): MemoryNode | null {
    return this.store.nodes.find(n => n.id === id) ?? null;
  }

  /** Add a new node to the graph. Returns the created node. */
  addNode(opts: {
    content: string;
    category: MemoryCategory;
    scope: 'global' | 'project';
    layer?: string;
    confidence?: number;
    confidenceSource?: ConfidenceSource;
    source?: NodeSource;
    tags?: string[];
    branch?: string | null;
    directoryScope?: string | null;
    sourceSessionId?: string | null;
  }): MemoryNode {
    const now = new Date().toISOString();
    const conf = opts.confidence ?? CONFIDENCE_INITIAL[opts.confidenceSource ?? 'auto-extract'];

    const node: MemoryNode = {
      id: randomUUID(),
      content: opts.content,
      category: opts.category,
      layer: (opts.layer as MemoryNode['layer']) ?? undefined,
      createdAt: now,
      updatedAt: now,
      lastRecalledAt: null,
      recallCount: 0,
      tags: opts.tags ?? [],
      archived: false,
      archivedAt: null,
      archivedReason: null,
      branch: opts.branch ?? null,
      directoryScope: opts.directoryScope ?? null,
      // v3 graph fields
      confidence: Math.min(conf, CONFIDENCE_MAX),
      confidenceSource: opts.confidenceSource ?? 'auto-extract',
      lastReinforcedAt: now,
      reinforcementCount: 0,
      source: opts.source ?? 'auto-extract',
      sourceSessionId: opts.sourceSessionId ?? null,
    };

    this.store.nodes.push(node);
    this.dirty = true;
    this.invalidateTfIdf();

    return node;
  }

  /**
   * Insert a memory, or reinforce the closest near-duplicate in place. This is
   * what MemoryManager.saveEntry calls so explicit + auto-extracted saves land
   * in the GRAPH — the source of truth getEntries()/the dashboard read from —
   * not only the legacy v2 store. Near-identical content (>=0.92 similarity,
   * same category) updates the existing node instead of creating a duplicate.
   */
  upsertNode(opts: {
    content: string;
    category: MemoryCategory;
    scope: 'global' | 'project';
    layer?: string;
    tags?: string[];
    branch?: string | null;
    directoryScope?: string | null;
    confidenceSource?: ConfidenceSource;
    source?: NodeSource;
  }): MemoryNode {
    const similar = this.findSimilar(opts.content, { category: opts.category, minSimilarity: 0.92 });
    const top = similar[0];
    if (top && top.similarity >= 0.92) {
      const node = top.node;
      const now = new Date().toISOString();
      node.content = opts.content;
      node.category = opts.category;
      if (opts.layer) node.layer = opts.layer as MemoryNode['layer'];
      if (opts.tags) node.tags = opts.tags;
      if (opts.branch !== undefined) node.branch = opts.branch ?? null;
      if (opts.directoryScope !== undefined) node.directoryScope = opts.directoryScope ?? null;
      node.updatedAt = now;
      node.lastReinforcedAt = now;
      node.reinforcementCount = (node.reinforcementCount ?? 0) + 1;
      node.archived = false;
      node.archivedAt = null;
      node.archivedReason = null;
      this.dirty = true;
      this.invalidateTfIdf();
      return node;
    }
    return this.addNode(opts);
  }

  /** Update fields on an existing node. */
  updateNode(id: string, patch: Partial<MemoryNode>): MemoryNode | null {
    const node = this.store.nodes.find(n => n.id === id);
    if (!node) return null;

    Object.assign(node, patch, { updatedAt: new Date().toISOString() });
    this.dirty = true;
    if ('content' in patch) this.invalidateTfIdf();

    return node;
  }

  /** Archive a node (move to cold storage conceptually). */
  archiveNode(id: string, reason: ArchiveReason): boolean {
    const node = this.store.nodes.find(n => n.id === id);
    if (!node || node.archived) return false;

    node.archived = true;
    node.archivedAt = new Date().toISOString();
    node.archivedReason = reason;
    this.dirty = true;
    this.invalidateTfIdf();

    logger.debug(`[graph] Archived node ${id} (reason: ${reason})`);
    return true;
  }

  /** Restore an archived node. */
  restoreNode(id: string): boolean {
    const node = this.store.nodes.find(n => n.id === id);
    if (!node || !node.archived) return false;

    node.archived = false;
    node.archivedAt = null;
    node.archivedReason = null;
    this.dirty = true;
    this.invalidateTfIdf();

    return true;
  }

  /** Hard-delete a node and all its edges. */
  deleteNode(id: string): boolean {
    const idx = this.store.nodes.findIndex(n => n.id === id);
    if (idx === -1) return false;

    this.store.nodes.splice(idx, 1);
    this.store.edges = this.store.edges.filter(
      e => e.fromNodeId !== id && e.toNodeId !== id,
    );
    this.dirty = true;
    this.invalidateTfIdf();

    return true;
  }

  /** Total active node count. */
  get nodeCount(): number {
    return this.store.nodes.filter(n => !n.archived).length;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge Operations
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get all edges. */
  getAllEdges(): MemoryEdge[] {
    return [...this.store.edges];
  }

  /** Get edges originating from a node. */
  getEdgesFrom(nodeId: string, type?: EdgeType): MemoryEdge[] {
    return this.store.edges.filter(
      e => e.fromNodeId === nodeId && (!type || e.type === type),
    );
  }

  /** Get edges pointing to a node. */
  getEdgesTo(nodeId: string, type?: EdgeType): MemoryEdge[] {
    return this.store.edges.filter(
      e => e.toNodeId === nodeId && (!type || e.type === type),
    );
  }

  /** Add an edge between two nodes. */
  addEdge(opts: {
    fromNodeId: string;
    toNodeId: string;
    type: EdgeType;
    weight?: number;
    metadata?: Record<string, unknown>;
  }): MemoryEdge | null {
    // Validate both nodes exist
    if (!this.getNode(opts.fromNodeId) || !this.getNode(opts.toNodeId)) {
      logger.warn(`[graph] Cannot add edge: one or both nodes not found`);
      return null;
    }
    // Prevent duplicate edges of the same type between the same pair
    const existing = this.store.edges.find(
      e => e.fromNodeId === opts.fromNodeId &&
           e.toNodeId === opts.toNodeId &&
           e.type === opts.type,
    );
    if (existing) return existing;

    const edge: MemoryEdge = {
      id: randomUUID(),
      fromNodeId: opts.fromNodeId,
      toNodeId: opts.toNodeId,
      type: opts.type,
      weight: opts.weight ?? 1.0,
      createdAt: new Date().toISOString(),
      metadata: opts.metadata,
    };

    this.store.edges.push(edge);
    this.dirty = true;

    // Reinforce both connected nodes (they got more connected, more valuable)
    this.reinforceNode(opts.fromNodeId, 'edgeAdded');
    this.reinforceNode(opts.toNodeId, 'edgeAdded');

    return edge;
  }

  /** Remove an edge by ID. */
  removeEdge(id: string): boolean {
    const idx = this.store.edges.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this.store.edges.splice(idx, 1);
    this.dirty = true;
    return true;
  }

  /** Get all nodes connected to a given node (any edge direction), up to depth. */
  getConnectedNodes(nodeId: string, maxDepth = 1): MemoryNode[] {
    const visited = new Set<string>([nodeId]);
    const result: MemoryNode[] = [];
    let frontier = [nodeId];

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const nextFrontier: string[] = [];
      for (const nid of frontier) {
        const outEdges = this.getEdgesFrom(nid);
        const inEdges = this.getEdgesTo(nid);
        const neighborIds = [
          ...outEdges.map(e => e.toNodeId),
          ...inEdges.map(e => e.fromNodeId),
        ];
        for (const neighbor of neighborIds) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            const node = this.getNode(neighbor);
            if (node && !node.archived) {
              result.push(node);
              nextFrontier.push(neighbor);
            }
          }
        }
      }
      frontier = nextFrontier;
    }

    return result;
  }

  /** Traverse a chain of edges of a specific type starting from a node. */
  traverseChain(startNodeId: string, edgeType: EdgeType, maxDepth = 5): MemoryNode[] {
    const chain: MemoryNode[] = [];
    let current = startNodeId;

    for (let i = 0; i < maxDepth; i++) {
      const edges = this.getEdgesFrom(current, edgeType);
      if (edges.length === 0) break;
      const next = this.getNode(edges[0].toNodeId);
      if (!next || chain.some(n => n.id === next.id)) break; // cycle guard
      chain.push(next);
      current = next.id;
    }

    return chain;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Confidence
  // ═══════════════════════════════════════════════════════════════════════════

  /** Reinforce a node's confidence (called on recall, confirmation, edge addition, etc). */
  reinforceNode(nodeId: string, event: keyof typeof CONFIDENCE_REINFORCEMENT): void {
    const node = this.store.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const boost = CONFIDENCE_REINFORCEMENT[event];
    const newConf = Math.min((node.confidence ?? 0.5) + boost, CONFIDENCE_MAX);

    node.confidence = newConf;
    node.lastReinforcedAt = new Date().toISOString();
    node.reinforcementCount = (node.reinforcementCount ?? 0) + 1;
    this.dirty = true;
  }

  /** Calculate current confidence after decay (lazy — computed on read). */
  getEffectiveConfidence(node: MemoryNode): number {
    const base = node.confidence ?? 0.5;
    const lastReinforced = node.lastReinforcedAt ?? node.createdAt;
    const daysSince = (Date.now() - new Date(lastReinforced).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, base - daysSince * CONFIDENCE_DECAY_PER_DAY);
  }

  /** Apply confidence decay to all nodes. Returns count of decayed + archived. */
  applyDecay(): { decayed: number; archived: number } {
    const now = new Date().toISOString();
    let decayed = 0;
    let archived = 0;

    for (const node of this.store.nodes) {
      if (node.archived) continue;
      const effective = this.getEffectiveConfidence(node);
      if (effective < node.confidence!) {
        node.confidence = effective;
        decayed++;
      }
      if (effective < CONFIDENCE_ARCHIVE_THRESHOLD) {
        this.archiveNode(node.id, 'decay');
        archived++;
      }
    }

    this.store.lastDecayRun = now;
    if (decayed > 0 || archived > 0) this.dirty = true;

    logger.debug(`[graph] Decay pass: ${decayed} decayed, ${archived} archived`);
    return { decayed, archived };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Recall (graph-based search)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Graph-based recall with TF-IDF + confidence + recency + mode weighting. */
  recall(opts: GraphRecallOptions): ScoredNode[] {
    this.ensureTfIdfIndex();

    // Gather candidate nodes based on scope + filters
    let candidates = opts.includeArchived
      ? [...this.store.nodes]
      : this.store.nodes.filter(n => !n.archived);

    if (opts.category) candidates = candidates.filter(n => n.category === opts.category);
    if (opts.layer) candidates = candidates.filter(n => n.layer === opts.layer);
    if (opts.branch) candidates = candidates.filter(n => !n.branch || n.branch === opts.branch);
    if (opts.minConfidence) {
      candidates = candidates.filter(n => this.getEffectiveConfidence(n) >= opts.minConfidence!);
    }

    if (candidates.length === 0) return [];

    // TF-IDF scoring
    const queryTokens = tokenize(opts.query);
    const queryVector = buildTermVector(queryTokens);

    const scored: ScoredNode[] = candidates.map(node => {
      const nodeTokens = tokenize(node.content);
      const nodeVector = buildTermVector(nodeTokens);
      const tfidfScore = cosineSimilarity(queryVector, nodeVector);

      // Confidence score (with decay)
      const confScore = this.getEffectiveConfidence(node);

      // Recency score (30-day half-life)
      const lastActive = node.lastRecalledAt ?? node.updatedAt;
      const daysSince = (Date.now() - new Date(lastActive).getTime()) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.exp(-daysSince * (Math.LN2 / 30));

      // Mode weighting
      const modeWeight = opts.mode
        ? (MODE_CATEGORY_WEIGHTS[opts.mode]?.[node.category] ?? 1.0) / 2.0 // normalise to ~0–1
        : 0.5;

      // Composite score: TF-IDF 40% + confidence 25% + recency 20% + mode 15%
      const score = (tfidfScore * 0.40) + (confScore * 0.25) + (recencyScore * 0.20) + (modeWeight * 0.15);

      return {
        node,
        score,
        matchType: 'tfidf' as const,
        scope: 'project', // caller sets this based on which graph was searched
      };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Take top N
    let results = scored.slice(0, opts.limit);

    // Edge traversal: for the top results, also include connected nodes
    if (opts.edgeTraversal) {
      const depth = opts.traversalDepth ?? DEFAULT_TRAVERSAL_DEPTH;
      const edgeResults: ScoredNode[] = [];
      const seenIds = new Set(results.map(r => r.node.id));

      for (const result of results.slice(0, 5)) { // traverse from top 5 only
        const connected = this.getConnectedNodes(result.node.id, depth);
        for (const connNode of connected) {
          if (seenIds.has(connNode.id)) continue;
          seenIds.add(connNode.id);

          // Score connected nodes lower (they're contextual, not direct matches)
          const connScore = result.score * 0.6;
          edgeResults.push({
            node: connNode,
            score: connScore,
            matchType: 'edge',
            scope: 'project',
            chain: [result.node, connNode],
            chainEdgeTypes: this.getEdgesFrom(result.node.id)
              .filter(e => e.toNodeId === connNode.id)
              .map(e => e.type),
          });
        }
      }

      // Merge edge results in, maintaining sort order
      results = [...results, ...edgeResults].sort((a, b) => b.score - a.score).slice(0, opts.limit);
    }

    // Reinforce recalled nodes (they were useful)
    for (const result of results) {
      if (result.score > 0.3) { // only reinforce genuinely relevant results
        this.reinforceNode(result.node.id, 'recalled');
        const node = this.getNode(result.node.id);
        if (node) {
          node.lastRecalledAt = new Date().toISOString();
          node.recallCount = (node.recallCount ?? 0) + 1;
        }
      }
    }
    if (results.length > 0) this.dirty = true;

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Similarity & Contradiction Detection
  // ═══════════════════════════════════════════════════════════════════════════

  /** Find nodes similar to the given content. Used for dedup + contradiction. */
  findSimilar(content: string, opts?: {
    category?: MemoryCategory;
    minSimilarity?: number;
    excludeIds?: Set<string>;
  }): Array<{ node: MemoryNode; similarity: number }> {
    this.ensureTfIdfIndex();

    const queryTokens = tokenize(content);
    const queryVector = buildTermVector(queryTokens);
    const threshold = opts?.minSimilarity ?? RELATED_THRESHOLD;

    const results: Array<{ node: MemoryNode; similarity: number }> = [];

    for (const node of this.store.nodes) {
      if (node.archived) continue;
      if (opts?.excludeIds?.has(node.id)) continue;
      if (opts?.category && node.category !== opts.category) continue;

      const nodeTokens = tokenize(node.content);
      const nodeVector = buildTermVector(nodeTokens);
      const sim = cosineSimilarity(queryVector, nodeVector);

      if (sim >= threshold) {
        results.push({ node, similarity: sim });
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /** Check if adding this content would contradict an existing node.
   *  Returns the contradicting node if found, null otherwise. */
  detectContradiction(content: string, category: MemoryCategory): MemoryNode | null {
    const similar = this.findSimilar(content, {
      category,
      minSimilarity: CONTRADICTION_THRESHOLD,
    });

    if (similar.length === 0) return null;

    // High similarity + same category = potential contradiction OR duplicate
    const top = similar[0];
    if (top.similarity >= MERGE_THRESHOLD) {
      // Near-duplicate — not a contradiction, just a restatement
      return null;
    }

    // Between CONTRADICTION_THRESHOLD and MERGE_THRESHOLD: likely a contradiction
    // (similar topic, different content)
    return top.node;
  }

  /** Check if content is a near-duplicate of an existing node. */
  detectDuplicate(content: string, category: MemoryCategory): MemoryNode | null {
    const similar = this.findSimilar(content, {
      category,
      minSimilarity: MERGE_THRESHOLD,
    });
    return similar.length > 0 ? similar[0].node : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Forgetting (principled archival)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Run the forgetting pass. Archives nodes that meet any forgetting criteria. */
  runForgettingPass(): { archived: number; reasons: Record<string, number> } {
    const now = Date.now();
    const reasons: Record<string, number> = {};
    let archived = 0;

    for (const node of this.store.nodes) {
      if (node.archived) continue;

      // Rule 1: Confidence below threshold (after decay)
      const effective = this.getEffectiveConfidence(node);
      if (effective < CONFIDENCE_ARCHIVE_THRESHOLD) {
        this.archiveNode(node.id, 'decay');
        reasons['decay'] = (reasons['decay'] ?? 0) + 1;
        archived++;
        continue;
      }

      // Rule 2: Not recalled in 90 days AND has no active edges
      const lastActive = node.lastRecalledAt ?? node.updatedAt;
      const daysSinceActive = (now - new Date(lastActive).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceActive > STALE_DAYS) {
        const hasActiveEdges = this.store.edges.some(
          e => (e.fromNodeId === node.id || e.toNodeId === node.id) &&
               !this.store.nodes.find(n => n.id === (e.fromNodeId === node.id ? e.toNodeId : e.fromNodeId))?.archived,
        );
        if (!hasActiveEdges) {
          this.archiveNode(node.id, 'stale');
          reasons['stale'] = (reasons['stale'] ?? 0) + 1;
          archived++;
          continue;
        }
      }

      // Rule 3: Superseded by a higher-confidence node
      const supersededByEdges = this.getEdgesTo(node.id, 'supersedes');
      if (supersededByEdges.length > 0) {
        const superseder = this.getNode(supersededByEdges[0].fromNodeId);
        if (superseder && !superseder.archived && (superseder.confidence ?? 0) > 0.7) {
          this.archiveNode(node.id, 'superseded');
          reasons['superseded'] = (reasons['superseded'] ?? 0) + 1;
          archived++;
          continue;
        }
      }
    }

    if (archived > 0) {
      this.store.lastForgetRun = new Date().toISOString();
      this.dirty = true;
    }

    logger.debug(`[graph] Forgetting pass: ${archived} archived (${JSON.stringify(reasons)})`);
    return { archived, reasons };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get a hash of the current graph state (for project brain staleness check). */
  getGraphHash(): string {
    // Simple hash: node count + edge count + last modified
    return `${this.store.nodes.length}-${this.store.edges.length}-${this.store.lastModified}`;
  }

  /** Get store stats. */
  getStats(): {
    activeNodes: number;
    archivedNodes: number;
    edges: number;
    avgConfidence: number;
    categories: Record<string, number>;
  } {
    const active = this.store.nodes.filter(n => !n.archived);
    const avgConf = active.length > 0
      ? active.reduce((sum, n) => sum + this.getEffectiveConfidence(n), 0) / active.length
      : 0;

    const categories: Record<string, number> = {};
    for (const node of active) {
      categories[node.category] = (categories[node.category] ?? 0) + 1;
    }

    return {
      activeNodes: active.length,
      archivedNodes: this.store.nodes.length - active.length,
      edges: this.store.edges.length,
      avgConfidence: Math.round(avgConf * 100) / 100,
      categories,
    };
  }

  /** Get the raw store (for migration, export, etc). */
  getRawStore(): MemoryGraphStore {
    return this.store;
  }

  /** Set the raw store (for migration). */
  setRawStore(store: MemoryGraphStore): void {
    this.store = store;
    this.dirty = true;
    this.invalidateTfIdf();
  }

  // ── TF-IDF index management ────────────────────────────────────────────

  private ensureTfIdfIndex(): void {
    if (this.tfidfIndex) return;
    this.rebuildTfIdfIndex();
  }

  private rebuildTfIdfIndex(): void {
    // The TfIdfIndex from v2 operates on documents. We feed it node contents.
    // For now we use the raw tokenize + buildTermVector + cosineSimilarity
    // functions directly in recall() and findSimilar() rather than the index
    // class — the per-query computation is fast enough for <10K nodes.
    this.tfidfIndex = new TfIdfIndex();
    for (const node of this.store.nodes) {
      if (!node.archived) {
        this.tfidfIndex.addDocument(node.id, node.content);
      }
    }
  }

  private invalidateTfIdf(): void {
    this.tfidfIndex = null;
  }
}
