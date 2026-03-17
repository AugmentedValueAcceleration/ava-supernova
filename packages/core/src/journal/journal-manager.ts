import { readFile, writeFile, rename, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { JournalDay, JournalDaySummary, JournalMood } from './types.js';
import { createEmptyJournalDay } from './types.js';

const JOURNAL_DIR = 'journal';

/** Optional platform sync interface. */
export interface PlatformJournalSync {
  pushEntry(day: JournalDay): Promise<void>;
  pullEntries(from?: string, to?: string): Promise<JournalDay[]>;
}

export class JournalManager {
  private readonly globalDir: string;
  private readonly projectDir: string | null;
  private readonly sync?: PlatformJournalSync;
  private readonly localOnly: boolean;

  // LRU cache — recent days (cap at 30)
  private cache = new Map<string, JournalDay>();
  private static readonly CACHE_MAX = 30;

  constructor(opts: { globalDir: string; projectRoot?: string; sync?: PlatformJournalSync; localOnly?: boolean }) {
    this.globalDir = join(opts.globalDir, JOURNAL_DIR);
    this.projectDir = opts.projectRoot ? join(opts.projectRoot, '.ava', JOURNAL_DIR) : null;
    this.sync = opts.sync;
    this.localOnly = opts.localOnly ?? true;
  }

  // ── Public API — Write ─────────────────────────────────────────────────────

  /** Write or update the user's journal entry for a date. */
  async writeUserEntry(date: string, content: string, mood?: JournalMood, tags?: string[]): Promise<JournalDay> {
    const day = await this.loadOrCreate(this.globalDir, date);
    const now = new Date().toISOString();

    if (day.userEntry) {
      day.userEntry.content = content;
      day.userEntry.mood = mood;
      day.userEntry.tags = tags;
      day.userEntry.updatedAt = now;
    } else {
      day.userEntry = { content, mood, tags, createdAt: now, updatedAt: now };
    }

    await this.persistDay(this.globalDir, day);
    this.syncDay(day);
    return day;
  }

  /** Write or update Ava's journal entry for a date. */
  async writeAvaEntry(date: string, content: string, tags?: string[], scope: 'global' | 'project' = 'global'): Promise<JournalDay> {
    const dir = scope === 'project' && this.projectDir ? this.projectDir : this.globalDir;
    const day = await this.loadOrCreate(dir, date);
    const now = new Date().toISOString();

    if (day.avaEntry) {
      day.avaEntry.content = content;
      day.avaEntry.tags = tags;
      day.avaEntry.updatedAt = now;
    } else {
      day.avaEntry = { content, tags, createdAt: now, updatedAt: now };
    }

    await this.persistDay(dir, day);
    this.syncDay(day);
    return day;
  }

  /** Append to Ava's existing entry (for multi-session days). */
  async appendAvaEntry(date: string, content: string, tags?: string[]): Promise<JournalDay> {
    const day = await this.loadOrCreate(this.globalDir, date);
    const now = new Date().toISOString();

    if (day.avaEntry) {
      day.avaEntry.content += '\n\n---\n\n' + content;
      if (tags) {
        day.avaEntry.tags = [...new Set([...(day.avaEntry.tags ?? []), ...tags])];
      }
      day.avaEntry.updatedAt = now;
    } else {
      day.avaEntry = { content, tags, createdAt: now, updatedAt: now };
    }

    await this.persistDay(this.globalDir, day);
    this.syncDay(day);
    return day;
  }

  // ── Public API — Read ──────────────────────────────────────────────────────

  /** Get a single day, merging global + project Ava entries. */
  async getDay(date: string): Promise<JournalDay | null> {
    const globalDay = await this.loadDay(this.globalDir, date);
    const projectDay = this.projectDir ? await this.loadDay(this.projectDir, date) : null;

    if (!globalDay && !projectDay) return null;

    const merged = globalDay ?? createEmptyJournalDay(date);

    // Merge project Ava entry into global day
    if (projectDay?.avaEntry) {
      if (merged.avaEntry) {
        merged.avaEntry.content += '\n\n---\n**Project notes:**\n' + projectDay.avaEntry.content;
      } else {
        merged.avaEntry = projectDay.avaEntry;
      }
    }

    return merged;
  }

  /** Get days in a date range. */
  async getDaysInRange(from: string, to: string): Promise<JournalDay[]> {
    const dates = await this.listDates(this.globalDir);
    const projectDates = this.projectDir ? await this.listDates(this.projectDir) : [];
    const allDates = [...new Set([...dates, ...projectDates])].filter(d => d >= from && d <= to).sort();

    const days: JournalDay[] = [];
    for (const date of allDates) {
      const day = await this.getDay(date);
      if (day) days.push(day);
    }
    return days;
  }

  /** Get the last N days that have entries. */
  async getRecentDays(n: number): Promise<JournalDay[]> {
    const dates = await this.listDates(this.globalDir);
    const projectDates = this.projectDir ? await this.listDates(this.projectDir) : [];
    const allDates = [...new Set([...dates, ...projectDates])].sort().reverse().slice(0, n);

    const days: JournalDay[] = [];
    for (const date of allDates) {
      const day = await this.getDay(date);
      if (day) days.push(day);
    }
    return days.reverse(); // oldest first
  }

  /** Get lightweight summaries for calendar display. */
  async getDaySummaries(from: string, to: string): Promise<JournalDaySummary[]> {
    const days = await this.getDaysInRange(from, to);
    return days.map(d => ({
      date: d.date,
      hasUserEntry: d.userEntry !== null,
      hasAvaEntry: d.avaEntry !== null,
      mood: d.userEntry?.mood,
    }));
  }

  /** Simple substring search across all entries. */
  async search(query: string): Promise<Array<{ date: string; matches: string[] }>> {
    const dates = await this.listDates(this.globalDir);
    const results: Array<{ date: string; matches: string[] }> = [];
    const lower = query.toLowerCase();

    for (const date of dates.reverse().slice(0, 100)) { // cap at 100 most recent
      const day = await this.loadDay(this.globalDir, date);
      if (!day) continue;

      const matches: string[] = [];
      if (day.userEntry?.content.toLowerCase().includes(lower)) {
        const idx = day.userEntry.content.toLowerCase().indexOf(lower);
        const start = Math.max(0, idx - 40);
        const end = Math.min(day.userEntry.content.length, idx + query.length + 40);
        matches.push(`[User] ...${day.userEntry.content.slice(start, end)}...`);
      }
      if (day.avaEntry?.content.toLowerCase().includes(lower)) {
        const idx = day.avaEntry.content.toLowerCase().indexOf(lower);
        const start = Math.max(0, idx - 40);
        const end = Math.min(day.avaEntry.content.length, idx + query.length + 40);
        matches.push(`[Ava] ...${day.avaEntry.content.slice(start, end)}...`);
      }
      if (matches.length > 0) results.push({ date, matches });
    }

    return results;
  }

  // ── Private — File I/O ─────────────────────────────────────────────────────

  private async loadDay(dir: string, date: string): Promise<JournalDay | null> {
    // Check cache
    const cacheKey = `${dir}:${date}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    const filePath = join(dir, `${date}.json`);
    if (!existsSync(filePath)) return null;

    try {
      const raw = await readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as JournalDay;
      if (data.version === 1 && data.date) {
        this.cacheSet(cacheKey, data);
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async loadOrCreate(dir: string, date: string): Promise<JournalDay> {
    return (await this.loadDay(dir, date)) ?? createEmptyJournalDay(date);
  }

  private async persistDay(dir: string, day: JournalDay): Promise<void> {
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${day.date}.json`);
    const content = JSON.stringify(day, null, 2);
    await this.writeSafe(filePath, content);
    this.cacheSet(`${dir}:${day.date}`, day);
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

  private async listDates(dir: string): Promise<string[]> {
    if (!existsSync(dir)) return [];
    try {
      const files = await readdir(dir);
      return files
        .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map(f => f.replace('.json', ''))
        .sort();
    } catch {
      return [];
    }
  }

  private cacheSet(key: string, day: JournalDay): void {
    this.cache.set(key, day);
    // Evict oldest if over limit
    if (this.cache.size > JournalManager.CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
  }

  /** Fire-and-forget platform sync. */
  private syncDay(day: JournalDay): void {
    if (this.localOnly || !this.sync) return;
    this.sync.pushEntry(day).catch(() => {});
  }
}
