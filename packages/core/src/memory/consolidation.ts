/**
 * Memory Consolidation — Layer 5
 *
 * Periodically reviews all memories and:
 * 1. Merges related/overlapping memories into richer entries
 * 2. Removes contradicted memories (newer wins)
 * 3. Summarizes verbose memories into concise forms
 * 4. Tags stale memories for review
 *
 * Designed to run weekly or on-demand. Can be triggered from:
 * - The briefing engine (weekly check)
 * - A manual command
 * - The event detector (when memory count exceeds a threshold)
 */

import type { MemoryManager } from './memory-manager.js';
import type { MemoryEntry, MemoryCategory } from './types.js';
import { TfIdfIndex } from './tfidf.js';
import { logger } from '../core/logger.js';

/** Report returned by the consolidation process. */
export interface ConsolidationReport {
  /** Number of memory pairs that were merged. */
  merged: number;
  /** Number of contradicting memories removed (older one removed). */
  contradictionsRemoved: number;
  /** Number of stale memories tagged for review. */
  staleTagged: number;
  /** Total memories processed. */
  totalProcessed: number;
  /** Timestamp of consolidation run. */
  runAt: string;
}

/** TF-IDF similarity threshold for merging related memories. */
const MERGE_SIMILARITY_THRESHOLD = 0.7;

/** Number of days without recall before a memory is considered stale. */
const STALE_DAYS = 90;

/**
 * Known contradiction pairs — if two memories match these opposing patterns,
 * they contradict each other. The most recent one wins.
 */
const CONTRADICTION_PAIRS: Array<[RegExp, RegExp]> = [
  [/\bprefers?\s+tabs\b/i, /\bprefers?\s+spaces\b/i],
  [/\bprefers?\s+single\s+quotes\b/i, /\bprefers?\s+double\s+quotes\b/i],
  [/\bprefers?\s+semicolons\b/i, /\bno\s+semicolons\b/i],
  [/\bprefers?\s+camelCase\b/i, /\bprefers?\s+snake_case\b/i],
  [/\bprefers?\s+const\b/i, /\bprefers?\s+let\b/i],
  [/\bprefers?\s+arrow\s+functions?\b/i, /\bprefers?\s+regular\s+functions?\b/i],
  [/\bprefers?\s+async\/await\b/i, /\bprefers?\s+promises\b/i],
  [/\bprefers?\s+type\b/i, /\bprefers?\s+interface\b/i],
  [/\buse\s+npm\b/i, /\buse\s+(?:pnpm|yarn)\b/i],
];

/**
 * Run memory consolidation across all active memories.
 *
 * Steps:
 * 1. Load all memories from both scopes
 * 2. Group by category
 * 3. Within each category, find high-similarity pairs and merge them
 * 4. Detect and remove contradictions (newer wins)
 * 5. Tag stale memories (90+ days without recall)
 *
 * @param memoryManager - The memory manager instance
 * @returns A report of what was consolidated
 */
export async function runConsolidation(
  memoryManager: MemoryManager,
): Promise<ConsolidationReport> {
  const report: ConsolidationReport = {
    merged: 0,
    contradictionsRemoved: 0,
    staleTagged: 0,
    totalProcessed: 0,
    runAt: new Date().toISOString(),
  };

  try {
    // Process both scopes
    for (const scope of ['global', 'project'] as const) {
      const entries = await memoryManager.getEntries(scope);
      const activeEntries = entries.filter(e => !e.archived);

      if (activeEntries.length < 2) continue;

      report.totalProcessed += activeEntries.length;

      // Step 1: Build TF-IDF index for this scope
      const index = new TfIdfIndex();
      for (const entry of activeEntries) {
        index.addDocument(entry.id, entry.content);
      }

      // Step 2: Group by category
      const byCategory = new Map<MemoryCategory, MemoryEntry[]>();
      for (const entry of activeEntries) {
        const list = byCategory.get(entry.category) ?? [];
        list.push(entry);
        byCategory.set(entry.category, list);
      }

      // Step 3: Find and merge similar pairs within each category
      const merged = new Set<string>();
      for (const [, categoryEntries] of byCategory) {
        if (categoryEntries.length < 2) continue;

        for (let i = 0; i < categoryEntries.length; i++) {
          const entry = categoryEntries[i];
          if (merged.has(entry.id)) continue;

          const similar = index.findSimilar(entry.id, MERGE_SIMILARITY_THRESHOLD);

          for (const { id: similarId } of similar) {
            if (merged.has(similarId)) continue;

            const other = categoryEntries.find(e => e.id === similarId);
            if (!other) continue;

            // Determine which is newer
            const entryTime = new Date(entry.updatedAt).getTime();
            const otherTime = new Date(other.updatedAt).getTime();

            const [keeper, older] = entryTime >= otherTime
              ? [entry, other]
              : [other, entry];

            // Merge: keep the newer one, incorporate any unique info from the older
            const mergedContent = mergeMemoryContent(keeper.content, older.content);

            if (mergedContent !== keeper.content) {
              await memoryManager.updateEntry(scope, keeper.id, {
                content: mergedContent,
              });
            }

            // Delete the older duplicate
            await memoryManager.deleteEntry(scope, older.id);
            merged.add(older.id);
            report.merged++;

            logger.debug(`[consolidation] Merged: "${older.content.slice(0, 40)}..." into "${keeper.content.slice(0, 40)}..."`);
          }
        }
      }

      // Step 4: Detect and remove contradictions
      const remainingEntries = (await memoryManager.getEntries(scope)).filter(e => !e.archived);
      const contradictionsRemoved = await resolveContradictions(remainingEntries, memoryManager, scope);
      report.contradictionsRemoved += contradictionsRemoved;

      // Step 5: Tag stale memories
      const staleTagged = await tagStaleMemories(remainingEntries, memoryManager, scope);
      report.staleTagged += staleTagged;
    }

    if (report.merged > 0 || report.contradictionsRemoved > 0 || report.staleTagged > 0) {
      logger.info(
        `[consolidation] Complete: merged ${report.merged}, removed ${report.contradictionsRemoved} contradictions, tagged ${report.staleTagged} stale`
      );
    }

    return report;
  } catch (err) {
    logger.debug(`[consolidation] Failed: ${err}`);
    return report;
  }
}

/**
 * Merge two memory contents. Keeps the primary content and appends
 * any unique information from the secondary that isn't already covered.
 */
function mergeMemoryContent(primary: string, secondary: string): string {
  // If the secondary is very short or a substring of primary, nothing to merge
  if (secondary.length < 10 || primary.toLowerCase().includes(secondary.toLowerCase())) {
    return primary;
  }

  // If primary is a substring of secondary, the secondary is richer
  if (secondary.toLowerCase().includes(primary.toLowerCase())) {
    return secondary;
  }

  // Extract words from both — find words in secondary not in primary
  const primaryWords = new Set(primary.toLowerCase().split(/\s+/));
  const secondaryWords = secondary.split(/\s+/);
  const uniqueWords = secondaryWords.filter(w => !primaryWords.has(w.toLowerCase()));

  // If less than 20% of secondary words are unique, the primary covers it
  if (uniqueWords.length < secondaryWords.length * 0.2) {
    return primary;
  }

  // Append a concise note from the secondary
  const supplement = secondary.length > 150 ? secondary.slice(0, 150) + '...' : secondary;
  return `${primary} (also: ${supplement})`;
}

/**
 * Find contradicting memories and remove the older one.
 * Uses known contradiction patterns (e.g., "prefers tabs" vs "prefers spaces").
 */
async function resolveContradictions(
  entries: MemoryEntry[],
  memoryManager: MemoryManager,
  scope: 'global' | 'project',
): Promise<number> {
  let removed = 0;

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];

      if (a.archived || b.archived) continue;

      const contradicts = CONTRADICTION_PAIRS.some(([patA, patB]) =>
        (patA.test(a.content) && patB.test(b.content)) ||
        (patB.test(a.content) && patA.test(b.content))
      );

      if (contradicts) {
        // Newer wins
        const aTime = new Date(a.updatedAt).getTime();
        const bTime = new Date(b.updatedAt).getTime();
        const [, loser] = aTime >= bTime ? [a, b] : [b, a];

        await memoryManager.deleteEntry(scope, loser.id);
        loser.archived = true; // Mark in local array to avoid re-processing
        removed++;

        logger.debug(`[consolidation] Contradiction resolved: removed "${loser.content.slice(0, 60)}..."`);
      }
    }
  }

  return removed;
}

/**
 * Tag memories older than 90 days without recall as 'stale'.
 * Adds a 'stale' tag rather than archiving — gives the user a chance to review.
 */
async function tagStaleMemories(
  entries: MemoryEntry[],
  memoryManager: MemoryManager,
  scope: 'global' | 'project',
): Promise<number> {
  const now = Date.now();
  let tagged = 0;

  for (const entry of entries) {
    if (entry.archived) continue;
    if (entry.tags?.includes('stale')) continue; // Already tagged

    const lastActivity = entry.lastRecalledAt ?? entry.updatedAt ?? entry.createdAt;
    const daysSince = (now - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince > STALE_DAYS) {
      const existingTags = entry.tags ?? [];
      if (!existingTags.includes('stale')) {
        await memoryManager.updateEntry(scope, entry.id, {
          tags: [...existingTags, 'stale'],
        });
        tagged++;

        logger.debug(`[consolidation] Tagged stale: "${entry.content.slice(0, 60)}..."`);
      }
    }
  }

  return tagged;
}
