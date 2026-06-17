/** Mood rating 1-5 (1 = low, 5 = great). */
export type JournalMood = 1 | 2 | 3 | 4 | 5;

/** Who authored an entry. */
export type JournalAuthor = 'user' | 'ava';

/**
 * A single journal entry — one of many on a given day.
 *
 * The journal is a stream of typed entries: a feeling, a plan, a quick idea.
 * `kind` references a JournalKind (built-in or user-defined). `mood` is only
 * meaningful for reflective kinds (those with tracksMood = true).
 */
export interface JournalEntry {
  id: string;
  author: JournalAuthor;
  kind: string; // kind id — builtin or custom
  title?: string;
  content: string; // markdown
  mood?: JournalMood;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

/** One day's journal — a stream of typed entries (v2). */
export interface JournalDay {
  version: 2;
  date: string; // YYYY-MM-DD
  entries: JournalEntry[];
}

/** A journal entry, annotated with the day it belongs to (for month/search views). */
export interface JournalMonthEntry extends JournalEntry {
  date: string; // YYYY-MM-DD
}

/** A journal entry kind — built-in starter set or user-defined. */
export interface JournalKind {
  id: string;
  label: string;
  color: string; // hex; defined once in core, consumed by every surface
  tracksMood: boolean; // reflective kinds show a mood selector
  builtin: boolean;
}

/**
 * Built-in kinds. Defined ONCE here and consumed by both surfaces — never
 * hardcode a divergent palette in the extension or IDE (mirror rule).
 * Reflective kinds (Personal, Feeling) carry mood; capture kinds don't.
 * `observation` is Ava's default for her own entries.
 */
export const BUILTIN_KINDS: JournalKind[] = [
  { id: 'personal', label: 'Personal', color: '#a855f7', tracksMood: true, builtin: true },
  { id: 'feeling', label: 'Feeling', color: '#34d399', tracksMood: true, builtin: true },
  { id: 'idea', label: 'Idea', color: '#f59e0b', tracksMood: false, builtin: true },
  { id: 'business', label: 'Business', color: '#3b82f6', tracksMood: false, builtin: true },
  { id: 'observation', label: 'Observation', color: '#94a3b8', tracksMood: false, builtin: true },
];

export const DEFAULT_USER_KIND = 'personal';
export const DEFAULT_AVA_KIND = 'observation';

/** Look up a kind by id within a registry (built-ins + custom). */
export function kindById(kinds: JournalKind[], id: string): JournalKind | undefined {
  return kinds.find((k) => k.id === id);
}

/** Lightweight per-day summary for calendar dots and the year heatmap. */
export interface JournalDaySummary {
  date: string;
  count: number;
  byKind: Record<string, number>;
  authors: { user: boolean; ava: boolean };
  dominantMood?: JournalMood; // most common mood among reflective entries
  avgMood?: number; // average mood — drives heatmap intensity
}

/** Create an empty journal day (v2). */
export function createEmptyJournalDay(date: string): JournalDay {
  return { version: 2, date, entries: [] };
}

/** Mint a new entry id. `crypto.randomUUID` exists in Node 18+ and webviews. */
export function newEntryId(): string {
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
  return uuid ?? `e-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Migrate a raw on-disk day (legacy v1 or current v2) to v2.
 * Pure, idempotent and lossless. v1 `userEntry`/`avaEntry` become a Personal
 * and an Observation entry respectively, preserving content/mood/tags/timestamps.
 *
 * Migrated entries get DETERMINISTIC ids (`v1-<date>-user` / `v1-<date>-ava`)
 * so they stay stable across reads until the day is next rewritten — this lets
 * the UI edit/delete a migrated entry without an id mismatch on reload.
 */
export function migrateDay(raw: unknown, date: string): JournalDay {
  const r = (raw ?? {}) as {
    version?: number;
    date?: string;
    entries?: JournalEntry[];
    userEntry?: { content?: string; mood?: JournalMood; tags?: string[]; createdAt?: string; updatedAt?: string } | null;
    avaEntry?: { content?: string; tags?: string[]; createdAt?: string; updatedAt?: string } | null;
  };

  if (r.version === 2 && Array.isArray(r.entries)) {
    return { version: 2, date: r.date ?? date, entries: r.entries };
  }

  const d = r.date ?? date;
  const entries: JournalEntry[] = [];

  if (r.userEntry) {
    const u = r.userEntry;
    const created = u.createdAt ?? `${d}T00:00:00.000Z`;
    entries.push({
      id: `v1-${d}-user`,
      author: 'user',
      kind: DEFAULT_USER_KIND,
      content: u.content ?? '',
      mood: u.mood,
      tags: u.tags,
      createdAt: created,
      updatedAt: u.updatedAt ?? created,
    });
  }

  if (r.avaEntry) {
    const a = r.avaEntry;
    const created = a.createdAt ?? `${d}T00:00:01.000Z`;
    entries.push({
      id: `v1-${d}-ava`,
      author: 'ava',
      kind: DEFAULT_AVA_KIND,
      content: a.content ?? '',
      tags: a.tags,
      createdAt: created,
      updatedAt: a.updatedAt ?? created,
    });
  }

  return { version: 2, date: d, entries };
}
