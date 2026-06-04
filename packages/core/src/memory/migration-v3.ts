/**
 * Migration v2 → v3 — convert flat memory.json entries to graph nodes.
 *
 * Auto-detected on first load: if memory.json exists but graph.json
 * doesn't, migration runs automatically. Entries become nodes with
 * confidence 0.5 (migrated), similarity analysis generates `related-to`
 * edges, and contradiction detection flags conflicts.
 *
 * After migration, memory.json is renamed to memory-v2-backup.json
 * and graph.json becomes the sole source of truth.
 */

import { readFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../core/logger.js';
import { MemoryGraph } from './graph-engine.js';
import type { MemoryEntry, MemoryNode } from './types.js';


const V2_FILENAME = 'memory.json';
const V2_BACKUP = 'memory-v2-backup.json';

/**
 * Check if a v2 → v3 migration is needed for the given directory.
 */
export function needsMigration(dir: string): boolean {
  const v2Path = join(dir, V2_FILENAME);
  // The graph lives in the `memory/` subdir (MemoryGraph is constructed with
  // `join(dir, 'memory')`), so graph.json is at `<dir>/memory/graph.json` —
  // NOT `<dir>/graph.json`. Checking the wrong path made this always return
  // true while a memory.json existed, so the migration re-ran on every load
  // and kept renaming memory.json → memory-v2-backup.json (clobbering the
  // backup). Check the real path so migration runs exactly once.
  const v3Path = join(dir, 'memory', 'graph.json');
  return existsSync(v2Path) && !existsSync(v3Path);
}

/**
 * Run the v2 → v3 migration for a single directory (global or project).
 * Returns the number of nodes created.
 */
export async function migrateV2ToV3(dir: string, graph: MemoryGraph): Promise<number> {
  const v2Path = join(dir, V2_FILENAME);

  if (!existsSync(v2Path)) {
    logger.debug(`[migration] No v2 memory.json found at ${dir}`);
    return 0;
  }

  try {
    const raw = await readFile(v2Path, 'utf-8');
    const store = JSON.parse(raw);
    const entries: MemoryEntry[] = Array.isArray(store.entries) ? store.entries : [];

    if (entries.length === 0) {
      logger.debug(`[migration] v2 memory.json at ${dir} is empty — nothing to migrate`);
      return 0;
    }

    logger.info(`[migration] Migrating ${entries.length} v2 entries to v3 graph at ${dir}`);

    // ── Step 1: Convert entries to nodes (FAST — must be synchronous) ────
    // Node creation is cheap (~1ms per entry) and must complete before
    // we save + rename so the agent has its memory available the moment
    // activation finishes. 3,240 entries = ~3 seconds, but that's a
    // one-time cost the user accepts on first run.
    const nodeIds: string[] = [];
    for (const entry of entries) {
      if (!entry.content?.trim()) continue;

      const node = graph.addNode({
        content: entry.content,
        category: entry.category || 'general',
        scope: 'project', // migration context determines scope at caller level
        layer: entry.layer,
        confidence: 0.5,
        confidenceSource: 'migrated',
        source: 'migrated',
        tags: [...(entry.tags || []), 'v2-migrated'],
        branch: entry.branch ?? null,
        directoryScope: entry.directoryScope ?? null,
      });

      // Preserve original timestamps
      if (entry.createdAt) node.createdAt = entry.createdAt;
      if (entry.updatedAt) node.updatedAt = entry.updatedAt;
      if (entry.lastRecalledAt) node.lastRecalledAt = entry.lastRecalledAt;
      if (entry.recallCount) node.recallCount = entry.recallCount;
      if (entry.archived) {
        node.archived = true;
        node.archivedAt = entry.archivedAt ?? null;
        node.archivedReason = 'stale';
      }

      nodeIds.push(node.id);
    }

    // ── Step 2: Save nodes + rename old file (FAST, synchronous) ────────
    // Persist what we've got NOW so the agent's memory is usable as soon
    // as activation returns. Similarity edges enrichment (Step 3) runs
    // in the background after this returns — they're additive and don't
    // affect baseline recall.
    await graph.forceSave();

    try {
      await rename(v2Path, join(dir, V2_BACKUP));
      logger.info(`[migration] Renamed ${V2_FILENAME} → ${V2_BACKUP}`);
    } catch {
      logger.warn(`[migration] Could not rename ${V2_FILENAME} — it will be ignored (graph.json takes precedence)`);
    }

    logger.info(`[migration] v2 → v3 nodes complete: ${nodeIds.length} nodes — similarity edges queued in background`);

    // ── Step 3: Similarity edges (SLOW, deferred to background) ──────────
    // Used to run synchronously here as O(n²) similarity over 200 nodes,
    // ~600K string comparisons that blocked the extension host main
    // thread for ~5 seconds and triggered VS Code's "unresponsive
    // extension" warning + made the sign-in Cancel button look broken.
    //
    // Now fired and forgotten — yields to the event loop every 10 nodes
    // so the host stays responsive while edges form. Edges are additive,
    // so partial completion is safe; the agent can read the graph mid-
    // enrichment without seeing inconsistent state.
    void buildSimilarityEdges(graph, nodeIds);

    return nodeIds.length;
  } catch (err) {
    logger.warn(`[migration] v2 → v3 migration failed: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

/**
 * Build similarity edges between migrated nodes — runs deferred so it
 * doesn't block the extension host on activation.
 *
 * Yields to the event loop every YIELD_EVERY iterations via a 0ms
 * setTimeout. That's enough to let VS Code's responsiveness watchdog
 * tick + queued webview messages (sign-in cancel, etc.) get processed
 * while the comparison runs.
 */
async function buildSimilarityEdges(graph: MemoryGraph, nodeIds: string[]): Promise<void> {
  const YIELD_EVERY = 10;

  // Only do cross-comparison for non-archived, non-trivial nodes
  const activeNodes = nodeIds
    .map(id => graph.getNode(id))
    .filter((n): n is MemoryNode => n !== null && !n.archived && n.content.length > 20);

  // Limit to first 200 nodes for performance (O(n²) comparison)
  const compareSet = activeNodes.slice(0, 200);

  let relatedEdges = 0;
  let contradictions = 0;

  for (let i = 0; i < compareSet.length; i++) {
    if (i > 0 && i % YIELD_EVERY === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    const similar = graph.findSimilar(compareSet[i].content, {
      category: compareSet[i].category,
      minSimilarity: 0.35,
      excludeIds: new Set([compareSet[i].id]),
    });

    for (const { node: target, similarity } of similar.slice(0, 3)) {
      if (similarity >= 0.9) {
        // Near-duplicate: related-to edge (could be merged later)
        graph.addEdge({
          fromNodeId: compareSet[i].id,
          toNodeId: target.id,
          type: 'related-to',
          weight: similarity,
          metadata: { source: 'migration-similarity' },
        });
        relatedEdges++;
      } else if (similarity >= 0.7) {
        // Potential contradiction
        graph.addEdge({
          fromNodeId: compareSet[i].id,
          toNodeId: target.id,
          type: 'contradicts',
          weight: similarity,
          metadata: { source: 'migration-contradiction-candidate', resolved: false },
        });
        contradictions++;
      } else {
        // Weak relation
        graph.addEdge({
          fromNodeId: compareSet[i].id,
          toNodeId: target.id,
          type: 'related-to',
          weight: similarity,
          metadata: { source: 'migration-similarity' },
        });
        relatedEdges++;
      }
    }
  }

  // Persist the new edges. Cheap — only edges added since the Step-2 save.
  try {
    await graph.forceSave();
    logger.info(`[migration] v2 → v3 similarity enrichment complete: ${relatedEdges} related edges, ${contradictions} contradiction candidates`);
  } catch (err) {
    logger.warn(`[migration] Similarity enrichment save failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
