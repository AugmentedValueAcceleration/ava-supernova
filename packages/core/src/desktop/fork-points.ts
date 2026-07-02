// Fork-point learning (Phase 3B) — THE moat, adapted from UI-Voyager's GRSD
// (Tencent Hunyuan, arXiv 2603.24533) to run at RETRIEVAL time instead of
// fine-tuning: we can't train (BYOK, no own model), but we can remember.
//
// A fork-point is a screen where a run went wrong: (screen-key → action →
// failure reason). When a later action VERIFIES on a matching screen with a
// DIFFERENT action, it becomes the recorded correction. Before planning on a
// screen, the host retrieves matching fork-points and injects: "last time
// this screen looked like this, X failed (reason); Z worked instead." Same
// learning signal as GRSD's dense supervision — no training pipeline.
//
// Guardrails (non-negotiable):
//   - A hint is TEXT for the Planner. It never executes anything — every
//     proposed action still passes the full safety gate, so a learned
//     "correction" can never auto-run an irreversible.
//   - Observed-origin actions (screen-prompted; Phase 1) never become
//     corrections — a page must not be able to teach Ava bad habits.
//   - Capped store with confidence decay: stale lessons fade, the store
//     can't grow unbounded.
//
// Pure data-in/data-out: the host owns load/save (it's a JSON file in
// ~/.ava). Fully unit-testable.

import { matchScreen, type ScreenKey } from './screen-key.js';

export interface ForkPointAction {
  kind: string;
  target?: string;
}

export interface ForkPoint {
  id: string;
  key: ScreenKey;
  /** App context when recorded (best-effort, for humans reading the store). */
  app?: string;
  failed: ForkPointAction & { reason: string };
  corrected?: ForkPointAction;
  /** Times this failure was independently observed. */
  failures: number;
  /** Times the correction verified. */
  successes: number;
  /** 0–1; rises with confirmations, decays with staleness. */
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface ForkPointStore {
  version: 1;
  points: ForkPoint[];
}

export const FORK_POINT_CAP = 200;
const DECAY_AFTER_DAYS = 30;
const DECAY_FACTOR = 0.85;

export function createEmptyForkPointStore(): ForkPointStore {
  return { version: 1, points: [] };
}

const sameAction = (a: ForkPointAction, b: ForkPointAction): boolean =>
  a.kind === b.kind && (a.target ?? '') === (b.target ?? '');

function findByKey(store: ForkPointStore, key: ScreenKey): ForkPoint[] {
  // matchScreen wants parallel arrays; map indices back to points.
  const matched: ForkPoint[] = [];
  const keys = store.points.map(p => p.key);
  // Collect ALL matches, not just the best — several fork-points can live on
  // one screen (different failed actions).
  for (let i = 0; i < store.points.length; i++) {
    const m = matchScreen(key, [keys[i]]);
    if (m) matched.push(store.points[i]);
  }
  return matched;
}

/**
 * Record a failed action at a screen. Dedupes: the same failure on a matching
 * screen reinforces the existing fork-point instead of duplicating it.
 * `origin` guard: screen-prompted actions are never recorded (a page must not
 * teach Ava habits). Mutates and returns the affected point, or null.
 */
export function recordFailure(
  store: ForkPointStore,
  key: ScreenKey,
  action: ForkPointAction & { reason: string; origin?: 'user' | 'observed' },
  app?: string,
  now: Date = new Date(),
): ForkPoint | null {
  if (action.origin === 'observed') return null;
  const iso = now.toISOString();
  const existing = findByKey(store, key).find(p => sameAction(p.failed, action));
  if (existing) {
    existing.failures += 1;
    existing.confidence = Math.min(1, existing.confidence + 0.15);
    existing.failed.reason = action.reason.slice(0, 160); // freshest reason wins
    existing.updatedAt = iso;
    return existing;
  }
  const point: ForkPoint = {
    id: `fp-${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    key,
    app,
    failed: { kind: action.kind, target: action.target, reason: action.reason.slice(0, 160) },
    failures: 1,
    successes: 0,
    confidence: 0.35,
    createdAt: iso,
    updatedAt: iso,
  };
  store.points.push(point);
  enforceCap(store);
  return point;
}

/**
 * Record a VERIFIED success at a screen. If a fork-point exists on a matching
 * screen whose failed action differs from this one, this success becomes (or
 * reinforces) its correction — the "here's the right click" half of the pair.
 * Observed-origin successes never become corrections. Returns points updated.
 */
export function recordSuccess(
  store: ForkPointStore,
  key: ScreenKey,
  action: ForkPointAction & { origin?: 'user' | 'observed' },
  now: Date = new Date(),
): ForkPoint[] {
  if (action.origin === 'observed') return [];
  const iso = now.toISOString();
  const updated: ForkPoint[] = [];
  for (const point of findByKey(store, key)) {
    if (sameAction(point.failed, action)) continue; // the failure itself succeeding elsewhere isn't a correction
    if (point.corrected && !sameAction(point.corrected, action)) continue; // a different correction already learned
    point.corrected = { kind: action.kind, target: action.target };
    point.successes += 1;
    point.confidence = Math.min(1, point.confidence + 0.2);
    point.updatedAt = iso;
    updated.push(point);
  }
  return updated;
}

/**
 * Retrieve hint text for the current screen — the lines injected into the
 * Planner's context BEFORE it plans. Highest-confidence matches first.
 */
export function retrieveHints(
  store: ForkPointStore,
  key: ScreenKey,
  limit = 2,
): string | null {
  const matches = findByKey(store, key)
    .filter(p => p.confidence >= 0.3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
  if (matches.length === 0) return null;
  const lines = matches.map(p => {
    const failed = `"${p.failed.kind}${p.failed.target ? ` → ${p.failed.target}` : ''}" failed (${p.failed.reason})`;
    const fixed = p.corrected
      ? `; "${p.corrected.kind}${p.corrected.target ? ` → ${p.corrected.target}` : ''}" worked instead (verified ${p.successes}×)`
      : '; no working alternative recorded yet — try a different approach than that one';
    return `- ${failed}${fixed}`;
  });
  return `[Learned on screens matching this one — hindsight, not orders; every action still passes the safety gate]\n${lines.join('\n')}`;
}

/** Age-based confidence decay. Host calls this once on load. */
export function decayStore(store: ForkPointStore, now: Date = new Date()): void {
  const cutoff = now.getTime() - DECAY_AFTER_DAYS * 24 * 60 * 60 * 1000;
  for (const p of store.points) {
    if (new Date(p.updatedAt).getTime() < cutoff) {
      p.confidence *= DECAY_FACTOR;
    }
  }
  store.points = store.points.filter(p => p.confidence >= 0.1);
}

function enforceCap(store: ForkPointStore): void {
  if (store.points.length <= FORK_POINT_CAP) return;
  // Evict lowest-confidence, oldest first.
  store.points.sort((a, b) => (a.confidence - b.confidence) || (a.updatedAt < b.updatedAt ? -1 : 1));
  store.points = store.points.slice(store.points.length - FORK_POINT_CAP);
}
