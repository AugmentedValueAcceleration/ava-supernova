/**
 * ══════════════════════════════════════════════════════════════════════
 * Memory Consolidation — Layer 5 (4-Phase Cycle)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Structured consolidation that keeps Ava's memory sharp, not noisy.
 *
 * Phase 1: ORIENT  — scan recent sessions, understand what happened
 * Phase 2: GATHER  — pull relevant patterns, decisions, corrections
 * Phase 3: CONSOLIDATE — merge duplicates, resolve contradictions
 * Phase 4: PRUNE   — remove noise, enforce 25KB cap per scope
 *
 * Triggers after 24 hours AND at least 5 sessions — doesn't waste
 * cycles on a quick one-off interaction.
 *
 * A certain well-funded AI lab had a similar system called "autoDream"
 * hidden behind a feature flag in code they accidentally published to
 * npm. Ours ships in the open. No flags. No accidents. Just memory
 * that actually works. Thanks for the validation, lads. 🫡
 *
 * ══════════════════════════════════════════════════════════════════════
 */

import type { MemoryManager } from './memory-manager.js';
import type { MemoryEntry, MemoryCategory } from './types.js';
import { TfIdfIndex } from './tfidf.js';
import { logger } from '../core/logger.js';

// ── Configuration ─────────────────────────────────────────────────────

import {
  MAX_STORE_SIZE_BYTES as MAX_MEMORY_SIZE_BYTES,
  CONSOLIDATION_INTERVAL_HOURS, CONSOLIDATION_MIN_SESSIONS as MIN_SESSIONS_SINCE_LAST,
  MERGE_THRESHOLD as MERGE_SIMILARITY_THRESHOLD,
  STALE_DAYS, AUTO_ARCHIVE_DAYS,
} from './config.js';

const MIN_CONSOLIDATION_INTERVAL_MS = CONSOLIDATION_INTERVAL_HOURS * 60 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────

export interface ConsolidationReport {
  phase: 'orient' | 'gather' | 'consolidate' | 'prune' | 'complete' | 'skipped';
  merged: number;
  contradictionsRemoved: number;
  staleTagged: number;
  pruned: number;
  totalProcessed: number;
  memorySizeBefore: number;
  memorySizeAfter: number;
  runAt: string;
  reason?: string;
}

export interface ConsolidationState {
  lastRunAt: string | null;
  sessionsSinceLastRun: number;
}

// ── Contradiction Patterns ────────────────────────────────────────────

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

// ── State Management ──────────────────────────────────────────────────

const STATE_FILE = 'consolidation-state.json';

async function loadState(globalDir: string): Promise<ConsolidationState> {
  try {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const raw = await readFile(join(globalDir, STATE_FILE), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { lastRunAt: null, sessionsSinceLastRun: 0 };
  }
}

async function saveState(globalDir: string, state: ConsolidationState): Promise<void> {
  try {
    const { writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    await writeFile(join(globalDir, STATE_FILE), JSON.stringify(state, null, 2), 'utf-8');
  } catch { /* non-critical */ }
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Record a session — call this at the end of each meaningful interaction.
 * The consolidation cycle triggers based on session count + time.
 */
export async function recordSession(globalDir: string): Promise<void> {
  const state = await loadState(globalDir);
  state.sessionsSinceLastRun++;
  await saveState(globalDir, state);
}

/**
 * Check if consolidation should run based on dual trigger:
 * - At least 24 hours since last run
 * - At least 5 sessions since last run
 */
export async function shouldConsolidate(globalDir: string): Promise<boolean> {
  const state = await loadState(globalDir);

  // Never run before — always consolidate
  if (!state.lastRunAt) return state.sessionsSinceLastRun >= MIN_SESSIONS_SINCE_LAST;

  const timeSince = Date.now() - new Date(state.lastRunAt).getTime();
  return timeSince >= MIN_CONSOLIDATION_INTERVAL_MS && state.sessionsSinceLastRun >= MIN_SESSIONS_SINCE_LAST;
}

/**
 * Run the full 4-phase consolidation cycle.
 *
 * Phase 1: ORIENT  — load and assess current memory state
 * Phase 2: GATHER  — identify merge candidates, contradictions, stale entries
 * Phase 3: CONSOLIDATE — execute merges and contradiction resolution
 * Phase 4: PRUNE   — enforce 25KB cap, archive old stale entries
 */
export async function runConsolidation(
  memoryManager: MemoryManager,
  globalDir?: string,
): Promise<ConsolidationReport> {
  const report: ConsolidationReport = {
    phase: 'orient',
    merged: 0,
    contradictionsRemoved: 0,
    staleTagged: 0,
    pruned: 0,
    totalProcessed: 0,
    memorySizeBefore: 0,
    memorySizeAfter: 0,
    runAt: new Date().toISOString(),
  };

  try {
    for (const scope of ['global', 'project'] as const) {
      const entries = await memoryManager.getEntries(scope);
      const active = entries.filter(e => !e.archived);

      if (active.length < 2) continue;

      report.totalProcessed += active.length;
      report.memorySizeBefore += measureSize(active);

      // ── Phase 1: ORIENT ───────────────────────────────────────
      report.phase = 'orient';
      logger.debug(`[consolidation] Phase 1 ORIENT: ${active.length} active memories in ${scope} (${formatBytes(measureSize(active))})`);

      const index = new TfIdfIndex();
      for (const entry of active) {
        index.addDocument(entry.id, entry.content);
      }

      const byCategory = new Map<MemoryCategory, MemoryEntry[]>();
      for (const entry of active) {
        const list = byCategory.get(entry.category) ?? [];
        list.push(entry);
        byCategory.set(entry.category, list);
      }

      // ── Phase 2: GATHER ───────────────────────────────────────
      report.phase = 'gather';
      logger.debug(`[consolidation] Phase 2 GATHER: scanning ${byCategory.size} categories for duplicates and contradictions`);

      // Identify merge candidates
      const mergePairs: Array<[MemoryEntry, MemoryEntry]> = [];
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
            mergePairs.push([entry, other]);
            merged.add(similarId);
          }
        }
      }

      // ── Phase 3: CONSOLIDATE ──────────────────────────────────
      report.phase = 'consolidate';
      logger.debug(`[consolidation] Phase 3 CONSOLIDATE: ${mergePairs.length} merge pairs, checking contradictions`);

      // Execute merges
      for (const [a, b] of mergePairs) {
        const aTime = new Date(a.updatedAt).getTime();
        const bTime = new Date(b.updatedAt).getTime();
        const [keeper, older] = aTime >= bTime ? [a, b] : [b, a];

        const mergedContent = mergeMemoryContent(keeper.content, older.content);
        if (mergedContent !== keeper.content) {
          await memoryManager.updateEntry(scope, keeper.id, { content: mergedContent });
        }
        await memoryManager.deleteEntry(scope, older.id);
        report.merged++;
      }

      // Resolve contradictions
      const postMerge = (await memoryManager.getEntries(scope)).filter(e => !e.archived);
      report.contradictionsRemoved += await resolveContradictions(postMerge, memoryManager, scope);

      // Tag stale
      const postContradiction = (await memoryManager.getEntries(scope)).filter(e => !e.archived);
      report.staleTagged += await tagStaleMemories(postContradiction, memoryManager, scope);

      // ── Phase 4: PRUNE ────────────────────────────────────────
      report.phase = 'prune';
      const postConsolidate = (await memoryManager.getEntries(scope)).filter(e => !e.archived);
      const currentSize = measureSize(postConsolidate);
      logger.debug(`[consolidation] Phase 4 PRUNE: ${postConsolidate.length} memories, ${formatBytes(currentSize)} (cap: ${formatBytes(MAX_MEMORY_SIZE_BYTES)})`);

      // Auto-archive very old stale memories
      for (const entry of postConsolidate) {
        if (!entry.tags?.includes('stale')) continue;
        const lastActivity = entry.lastRecalledAt ?? entry.updatedAt ?? entry.createdAt;
        const daysSince = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > AUTO_ARCHIVE_DAYS) {
          await memoryManager.archiveEntry(scope, entry.id);
          report.pruned++;
        }
      }

      // If still over 25KB, prune least-recalled entries
      if (currentSize > MAX_MEMORY_SIZE_BYTES) {
        const remaining = (await memoryManager.getEntries(scope)).filter(e => !e.archived);
        const sorted = [...remaining].sort((a, b) => {
          const aScore = (a.recallCount ?? 0) + (a.lastRecalledAt ? 1 : 0);
          const bScore = (b.recallCount ?? 0) + (b.lastRecalledAt ? 1 : 0);
          return aScore - bScore; // Least recalled first
        });

        let size = measureSize(sorted);
        while (size > MAX_MEMORY_SIZE_BYTES && sorted.length > 5) {
          const victim = sorted.shift()!;
          await memoryManager.archiveEntry(scope, victim.id);
          size -= victim.content.length;
          report.pruned++;
        }
      }

      // Measure final size
      const final = (await memoryManager.getEntries(scope)).filter(e => !e.archived);
      report.memorySizeAfter += measureSize(final);
    }

    report.phase = 'complete';

    if (report.merged > 0 || report.contradictionsRemoved > 0 || report.pruned > 0) {
      logger.info(
        `[consolidation] Complete: merged ${report.merged}, contradictions ${report.contradictionsRemoved}, ` +
        `stale ${report.staleTagged}, pruned ${report.pruned} | ` +
        `${formatBytes(report.memorySizeBefore)} → ${formatBytes(report.memorySizeAfter)}`
      );
    }

    // Update state
    if (globalDir) {
      await saveState(globalDir, { lastRunAt: report.runAt, sessionsSinceLastRun: 0 });
    }

    return report;
  } catch (err) {
    logger.debug(`[consolidation] Failed at phase ${report.phase}: ${err}`);
    return report;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function measureSize(entries: MemoryEntry[]): number {
  return entries.reduce((sum, e) => sum + e.content.length, 0);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

function mergeMemoryContent(primary: string, secondary: string): string {
  if (secondary.length < 10 || primary.toLowerCase().includes(secondary.toLowerCase())) {
    return primary;
  }
  if (secondary.toLowerCase().includes(primary.toLowerCase())) {
    return secondary;
  }
  const primaryWords = new Set(primary.toLowerCase().split(/\s+/));
  const secondaryWords = secondary.split(/\s+/);
  const uniqueWords = secondaryWords.filter(w => !primaryWords.has(w.toLowerCase()));
  if (uniqueWords.length < secondaryWords.length * 0.2) {
    return primary;
  }
  const supplement = secondary.length > 150 ? secondary.slice(0, 150) + '...' : secondary;
  return `${primary} (also: ${supplement})`;
}

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
        const aTime = new Date(a.updatedAt).getTime();
        const bTime = new Date(b.updatedAt).getTime();
        const [, loser] = aTime >= bTime ? [a, b] : [b, a];
        await memoryManager.deleteEntry(scope, loser.id);
        loser.archived = true;
        removed++;
        logger.debug(`[consolidation] Contradiction resolved: removed "${loser.content.slice(0, 60)}..."`);
      }
    }
  }
  return removed;
}

async function tagStaleMemories(
  entries: MemoryEntry[],
  memoryManager: MemoryManager,
  scope: 'global' | 'project',
): Promise<number> {
  const now = Date.now();
  let tagged = 0;
  for (const entry of entries) {
    if (entry.archived || entry.tags?.includes('stale')) continue;
    const lastActivity = entry.lastRecalledAt ?? entry.updatedAt ?? entry.createdAt;
    const daysSince = (now - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > STALE_DAYS) {
      const existingTags = entry.tags ?? [];
      await memoryManager.updateEntry(scope, entry.id, {
        tags: [...existingTags, 'stale'],
      });
      tagged++;
    }
  }
  return tagged;
}
