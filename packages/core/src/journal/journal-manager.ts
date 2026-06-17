import { readFile, writeFile, rename, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  JournalDay,
  JournalEntry,
  JournalMonthEntry,
  JournalDaySummary,
  JournalKind,
  JournalMood,
  JournalAuthor,
} from './types.js';
import {
  createEmptyJournalDay,
  migrateDay,
  newEntryId,
  BUILTIN_KINDS,
  DEFAULT_USER_KIND,
  DEFAULT_AVA_KIND,
} from './types.js';

const JOURNAL_DIR = 'journal';
const KINDS_FILE = 'kinds.json';

/**
 * Optional platform sync interface. Journal is now local-only — this is kept
 * inert so existing wiring compiles; nothing is pushed to the cloud.
 */
export interface PlatformJournalSync {
  pushEntry(day: JournalDay): Promise<void>;
  pullEntries(from?: string, to?: string): Promise<JournalDay[]>;
}

/** Input for adding a new entry. */
export interface NewEntryInput {
  author: JournalAuthor;
  kind: string;
  content: string;
  title?: string;
  mood?: JournalMood;
  tags?: string[];
}

/** Patch for updating an existing entry. */
export interface EntryPatch {
  kind?: string;
  title?: string;
  content?: string;
  mood?: JournalMood | null;
  tags?: string[];
}

/** Filters for journal search. */
export interface SearchFilters {
  kind?: string;
  author?: JournalAuthor;
  from?: string;
  to?: string;
}

/** A single search hit. */
export interface SearchHit {
  date: string;
  entryId: string;
  author: JournalAuthor;
  kind: string;
  title?: string;
  snippet: string;
}

/**
 * Local-first journal store. A day is a stream of typed entries persisted as
 * `<globalDir>/journal/YYYY-MM-DD.json` (and optionally a project-scoped copy
 * under `<projectRoot>/.ava/journal/`). Custom kinds live in
 * `<globalDir>/journal/kinds.json`. Built-in kinds are code constants merged
 * at read time. Everything stays on the user's machine.
 */
export class JournalManager {
  private readonly globalDir: string;
  private readonly projectDir: string | null;

  // LRU cache — recent days (cap at 30)
  private cache = new Map<string, JournalDay>();
  private static readonly CACHE_MAX = 30;

  // `sync` / `localOnly` are accepted for caller compatibility but ignored —
  // the journal is always local-only now (cloud sync retired).
  constructor(opts: { globalDir: string; projectRoot?: string; sync?: PlatformJournalSync; localOnly?: boolean }) {
    this.globalDir = join(opts.globalDir, JOURNAL_DIR);
    this.projectDir = opts.projectRoot ? join(opts.projectRoot, '.ava', JOURNAL_DIR) : null;
  }

  /** No-op — journal is local-only regardless. Retained for caller compatibility. */
  setLocalOnly(_value: boolean): void {
    /* journal never syncs to the cloud */
  }

  /**
   * Drop cached days so the next read hits disk. Needed when ANOTHER instance
   * (e.g. the agent's JournalManager) wrote to the same files this instance has
   * cached — without this, a long-lived reader (the dashboard) keeps serving a
   * stale day even after Ava's auto-journal landed on disk.
   */
  invalidateCache(date?: string): void {
    if (!date) {
      this.cache.clear();
      return;
    }
    for (const key of [...this.cache.keys()]) {
      if (key.endsWith(`:${date}`)) this.cache.delete(key);
    }
  }

  // ── Public API — Entry CRUD ────────────────────────────────────────────────

  /** Add a new entry to a day. Returns the persisted day and the new entry id. */
  async addEntry(date: string, input: NewEntryInput, scope: 'global' | 'project' = 'global'): Promise<{ day: JournalDay; id: string }> {
    const dir = scope === 'project' && this.projectDir ? this.projectDir : this.globalDir;
    const now = new Date().toISOString();
    const entry: JournalEntry = {
      id: newEntryId(),
      author: input.author,
      kind: input.kind,
      title: input.title?.trim() || undefined,
      content: input.content,
      mood: input.mood,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
    };
    const { day } = await this.mutateDay(dir, date, (d) => {
      d.entries.push(entry);
    });
    return { day, id: entry.id };
  }

  /** Update an existing entry by id (searches global then project scope). */
  async updateEntry(date: string, id: string, patch: EntryPatch): Promise<JournalDay | null> {
    const dir = await this.findEntryDir(date, id);
    if (!dir) return null;
    const { day, result } = await this.mutateDay(dir, date, (d) => {
      const entry = d.entries.find((e) => e.id === id);
      if (!entry) return false;
      if (patch.kind !== undefined) entry.kind = patch.kind;
      if (patch.title !== undefined) entry.title = patch.title.trim() || undefined;
      if (patch.content !== undefined) entry.content = patch.content;
      if (patch.mood !== undefined) entry.mood = patch.mood ?? undefined;
      if (patch.tags !== undefined) entry.tags = patch.tags;
      entry.updatedAt = new Date().toISOString();
      return true;
    });
    return result ? day : null;
  }

  /** Delete an entry by id (searches global then project scope). */
  async deleteEntry(date: string, id: string): Promise<JournalDay | null> {
    const dir = await this.findEntryDir(date, id);
    if (!dir) return null;
    const { day, result } = await this.mutateDay(dir, date, (d) => {
      const before = d.entries.length;
      d.entries = d.entries.filter((e) => e.id !== id);
      return d.entries.length !== before;
    });
    return result ? day : null;
  }

  // ── Public API — Read ──────────────────────────────────────────────────────

  /** Get a single day, merging global + project entries (union by id). */
  async getDay(date: string): Promise<JournalDay | null> {
    const globalDay = await this.loadDay(this.globalDir, date);
    const projectDay = this.projectDir ? await this.loadDay(this.projectDir, date) : null;
    if (!globalDay && !projectDay) return null;

    const byId = new Map<string, JournalEntry>();
    for (const e of globalDay?.entries ?? []) byId.set(e.id, e);
    for (const e of projectDay?.entries ?? []) if (!byId.has(e.id)) byId.set(e.id, e);

    const entries = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { version: 2, date, entries };
  }

  /** All entries for a calendar month (1-12), annotated with their date. */
  async getMonth(year: number, month: number): Promise<JournalMonthEntry[]> {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const dates = (await this.allDates()).filter((d) => d.startsWith(prefix));
    const out: JournalMonthEntry[] = [];
    for (const date of dates) {
      const day = await this.getDay(date);
      if (day) for (const e of day.entries) out.push({ ...e, date });
    }
    return out.sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));
  }

  /** Per-day summaries for a whole year (keyed by date) — drives the heatmap. */
  async getYearSummary(year: number): Promise<Record<string, JournalDaySummary>> {
    const prefix = `${year}-`;
    const dates = (await this.allDates()).filter((d) => d.startsWith(prefix));
    const out: Record<string, JournalDaySummary> = {};
    for (const date of dates) {
      const day = await this.getDay(date);
      if (day && day.entries.length) out[date] = this.summarize(date, day.entries);
    }
    return out;
  }

  /** Days that have entries within a range (oldest first). */
  async getDaysInRange(from: string, to: string): Promise<JournalDay[]> {
    const dates = (await this.allDates()).filter((d) => d >= from && d <= to);
    const days: JournalDay[] = [];
    for (const date of dates) {
      const day = await this.getDay(date);
      if (day && day.entries.length) days.push(day);
    }
    return days;
  }

  /** The last N days that have entries (oldest first). */
  async getRecentDays(n: number): Promise<JournalDay[]> {
    const dates = (await this.allDates()).reverse().slice(0, n);
    const days: JournalDay[] = [];
    for (const date of dates) {
      const day = await this.getDay(date);
      if (day && day.entries.length) days.push(day);
    }
    return days.reverse();
  }

  /** Lightweight summaries for calendar display. */
  async getDaySummaries(from: string, to: string): Promise<JournalDaySummary[]> {
    const days = await this.getDaysInRange(from, to);
    return days.map((d) => this.summarize(d.date, d.entries));
  }

  /** Substring search across entries, with optional filters. */
  async search(query: string, filters?: SearchFilters): Promise<SearchHit[]> {
    const lower = query.toLowerCase();
    const from = filters?.from;
    const to = filters?.to;
    let dates = await this.allDates();
    if (from || to) dates = dates.filter((d) => (!from || d >= from) && (!to || d <= to));
    // Most recent first; cap the scan unless an explicit range was given.
    dates = dates.reverse();
    if (!from && !to) dates = dates.slice(0, 365);

    const hits: SearchHit[] = [];
    for (const date of dates) {
      const day = await this.getDay(date);
      if (!day) continue;
      for (const e of day.entries) {
        if (filters?.kind && e.kind !== filters.kind) continue;
        if (filters?.author && e.author !== filters.author) continue;
        const hay = `${e.title ?? ''}\n${e.content}`.toLowerCase();
        const idx = hay.indexOf(lower);
        if (idx === -1) continue;
        const start = Math.max(0, idx - 40);
        const end = Math.min(hay.length, idx + lower.length + 40);
        hits.push({
          date,
          entryId: e.id,
          author: e.author,
          kind: e.kind,
          title: e.title,
          snippet: `${start > 0 ? '…' : ''}${hay.slice(start, end)}${end < hay.length ? '…' : ''}`,
        });
      }
    }
    return hits;
  }

  // ── Public API — Kinds registry ────────────────────────────────────────────

  /** All kinds: built-ins + user-defined (custom can't shadow a built-in id). */
  async listKinds(): Promise<JournalKind[]> {
    const custom = await this.loadCustomKinds();
    const builtinIds = new Set(BUILTIN_KINDS.map((k) => k.id));
    return [...BUILTIN_KINDS, ...custom.filter((k) => !builtinIds.has(k.id))];
  }

  /** Add a user-defined kind. */
  async addKind(kind: { id: string; label: string; color: string; tracksMood: boolean }): Promise<JournalKind[]> {
    const id = kind.id.trim().toLowerCase().replace(/\s+/g, '-');
    if (!id) throw new Error('Kind id is required');
    if (BUILTIN_KINDS.some((k) => k.id === id)) throw new Error(`"${id}" is a built-in kind`);
    const custom = await this.loadCustomKinds();
    if (custom.some((k) => k.id === id)) throw new Error(`Kind "${id}" already exists`);
    custom.push({ id, label: kind.label.trim() || id, color: kind.color, tracksMood: kind.tracksMood, builtin: false });
    await this.persistCustomKinds(custom);
    return this.listKinds();
  }

  /** Update a user-defined kind (built-ins are read-only). */
  async updateKind(id: string, patch: { label?: string; color?: string; tracksMood?: boolean }): Promise<JournalKind[]> {
    if (BUILTIN_KINDS.some((k) => k.id === id)) throw new Error(`"${id}" is a built-in kind`);
    const custom = await this.loadCustomKinds();
    const k = custom.find((c) => c.id === id);
    if (!k) throw new Error(`Kind "${id}" not found`);
    if (patch.label !== undefined) k.label = patch.label.trim() || k.label;
    if (patch.color !== undefined) k.color = patch.color;
    if (patch.tracksMood !== undefined) k.tracksMood = patch.tracksMood;
    await this.persistCustomKinds(custom);
    return this.listKinds();
  }

  /** Delete a user-defined kind. Existing entries keep their kind id. */
  async deleteKind(id: string): Promise<JournalKind[]> {
    if (BUILTIN_KINDS.some((k) => k.id === id)) throw new Error(`"${id}" is a built-in kind`);
    const custom = (await this.loadCustomKinds()).filter((k) => k.id !== id);
    await this.persistCustomKinds(custom);
    return this.listKinds();
  }

  // ── Back-compat shims ──────────────────────────────────────────────────────
  // Kept so existing callers (Ava's session-end auto-journal in AvaViewProvider
  // and the IDE sidecar, the legacy tool path, the web companion) keep working
  // through the migration. Pruned once every caller uses the entry API.

  /** Upsert a single user Personal entry for the day. */
  async writeUserEntry(date: string, content: string, mood?: JournalMood, tags?: string[]): Promise<JournalDay> {
    const { day } = await this.mutateDay(this.globalDir, date, (d) => {
      const now = new Date().toISOString();
      const existing = d.entries.find((e) => e.author === 'user' && e.kind === DEFAULT_USER_KIND);
      if (existing) {
        existing.content = content;
        existing.mood = mood;
        existing.tags = tags;
        existing.updatedAt = now;
      } else {
        d.entries.push({ id: newEntryId(), author: 'user', kind: DEFAULT_USER_KIND, content, mood, tags, createdAt: now, updatedAt: now });
      }
    });
    return day;
  }

  /** Upsert a single Ava Observation entry for the day. */
  async writeAvaEntry(date: string, content: string, tags?: string[], scope: 'global' | 'project' = 'global'): Promise<JournalDay> {
    const dir = scope === 'project' && this.projectDir ? this.projectDir : this.globalDir;
    const { day } = await this.mutateDay(dir, date, (d) => {
      const now = new Date().toISOString();
      const existing = d.entries.find((e) => e.author === 'ava' && e.kind === DEFAULT_AVA_KIND);
      if (existing) {
        existing.content = content;
        existing.tags = tags;
        existing.updatedAt = now;
      } else {
        d.entries.push({ id: newEntryId(), author: 'ava', kind: DEFAULT_AVA_KIND, content, tags, createdAt: now, updatedAt: now });
      }
    });
    return day;
  }

  /** Append a NEW Ava Observation entry — each session reflection is its own entry. */
  async appendAvaEntry(date: string, content: string, tags?: string[]): Promise<JournalDay> {
    const { day } = await this.addEntry(date, { author: 'ava', kind: DEFAULT_AVA_KIND, content, tags });
    return day;
  }

  /** Remove all of the user's entries for a day. */
  async deleteUserEntry(date: string): Promise<JournalDay> {
    const { day } = await this.mutateDay(this.globalDir, date, (d) => {
      d.entries = d.entries.filter((e) => e.author !== 'user');
    });
    return day;
  }

  /** Remove all of Ava's entries for a day. */
  async deleteAvaEntry(date: string): Promise<JournalDay> {
    const { day } = await this.mutateDay(this.globalDir, date, (d) => {
      d.entries = d.entries.filter((e) => e.author !== 'ava');
    });
    return day;
  }

  /** Journal is local-only — cloud pull is retired. Kept for caller compatibility. */
  async pullLatest(_from?: string, _to?: string): Promise<number> {
    return 0;
  }

  // ── Private — summaries ────────────────────────────────────────────────────

  private summarize(date: string, entries: JournalEntry[]): JournalDaySummary {
    const byKind: Record<string, number> = {};
    const moods: JournalMood[] = [];
    let user = false;
    let ava = false;
    for (const e of entries) {
      byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
      if (e.author === 'user') user = true;
      else ava = true;
      if (e.mood) moods.push(e.mood);
    }
    let dominantMood: JournalMood | undefined;
    let avgMood: number | undefined;
    if (moods.length) {
      const counts = new Map<JournalMood, number>();
      for (const m of moods) counts.set(m, (counts.get(m) ?? 0) + 1);
      dominantMood = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      avgMood = moods.reduce((s, m) => s + m, 0) / moods.length;
    }
    return { date, count: entries.length, byKind, authors: { user, ava }, dominantMood, avgMood };
  }

  // ── Private — File I/O ─────────────────────────────────────────────────────

  private async loadDay(dir: string, date: string): Promise<JournalDay | null> {
    const cacheKey = `${dir}:${date}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    const filePath = join(dir, `${date}.json`);
    if (!existsSync(filePath)) return null;

    try {
      const raw = await readFile(filePath, 'utf-8');
      const day = migrateDay(JSON.parse(raw), date);
      this.cacheSet(cacheKey, day);
      return day;
    } catch {
      return null;
    }
  }

  /** Read a day fresh from disk (bypassing cache), migrated to v2. */
  private async readFresh(dir: string, date: string): Promise<JournalDay> {
    const filePath = join(dir, `${date}.json`);
    if (!existsSync(filePath)) return createEmptyJournalDay(date);
    try {
      return migrateDay(JSON.parse(await readFile(filePath, 'utf-8')), date);
    } catch {
      return createEmptyJournalDay(date);
    }
  }

  /**
   * Read-modify-write a single day atomically under the file lock. The day is
   * re-read FRESH from disk inside the lock so concurrent mutations never lose
   * an entry (lost-update safety). The mutator may return a value (e.g. whether
   * a target entry was found) which is passed back to the caller.
   */
  private async mutateDay<T>(dir: string, date: string, mutate: (day: JournalDay) => T): Promise<{ day: JournalDay; result: T }> {
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${date}.json`);
    const { withLock } = await import('../core/file-lock.js');
    return withLock(filePath, async () => {
      const day = await this.readFresh(dir, date);
      const result = mutate(day);
      const tmpPath = filePath + '.tmp';
      await writeFile(tmpPath, JSON.stringify(day, null, 2), 'utf-8');
      try {
        await rename(tmpPath, filePath);
      } catch (err) {
        await unlink(tmpPath).catch(() => {});
        throw err;
      }
      this.cacheSet(`${dir}:${date}`, day);
      return { day, result };
    });
  }

  /** Which scope dir currently holds an entry id (global preferred), or null. */
  private async findEntryDir(date: string, id: string): Promise<string | null> {
    const g = await this.loadDay(this.globalDir, date);
    if (g?.entries.some((e) => e.id === id)) return this.globalDir;
    if (this.projectDir) {
      const p = await this.loadDay(this.projectDir, date);
      if (p?.entries.some((e) => e.id === id)) return this.projectDir;
    }
    return null;
  }

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

  /** Union of dated journal files across global + project scopes, sorted ascending. */
  private async allDates(): Promise<string[]> {
    const g = await this.listDates(this.globalDir);
    const p = this.projectDir ? await this.listDates(this.projectDir) : [];
    return [...new Set([...g, ...p])].sort();
  }

  private async listDates(dir: string): Promise<string[]> {
    if (!existsSync(dir)) return [];
    try {
      const files = await readdir(dir);
      return files
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map((f) => f.replace('.json', ''))
        .sort();
    } catch {
      return [];
    }
  }

  private async loadCustomKinds(): Promise<JournalKind[]> {
    const filePath = join(this.globalDir, KINDS_FILE);
    if (!existsSync(filePath)) return [];
    try {
      const raw = JSON.parse(await readFile(filePath, 'utf-8')) as { kinds?: JournalKind[] };
      return Array.isArray(raw.kinds) ? raw.kinds.map((k) => ({ ...k, builtin: false })) : [];
    } catch {
      return [];
    }
  }

  private async persistCustomKinds(kinds: JournalKind[]): Promise<void> {
    await mkdir(this.globalDir, { recursive: true });
    const filePath = join(this.globalDir, KINDS_FILE);
    await this.writeSafe(filePath, JSON.stringify({ version: 1, kinds }, null, 2));
  }

  private cacheSet(key: string, day: JournalDay): void {
    this.cache.set(key, day);
    if (this.cache.size > JournalManager.CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
  }
}
