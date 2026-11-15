/**
 * A per-folder cache of parsed fact files.
 *
 * Without it, every save re-read every fact to check for a repeat (200 ms per
 * save at 600 facts). With it, a folder is only re-read when it changed, and
 * then only the files that changed.
 *
 * Seeing changes from the other apps: every write in this store is a rename
 * into the folder, which updates the folder's own modified time, so an
 * unchanged folder time means nothing was added, removed or rewritten by any
 * app. A file edited by hand in an editor changes only the file, so a full
 * check of every file's time also runs whenever the last one is a few seconds
 * old. Hand edits therefore show up within seconds; app writes at once.
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Fact, FactState } from './types.js';
import { parseFact } from './fact-file.js';
import { readIfExists } from './files.js';

const FULL_CHECK_MS = 3000;

interface Entry {
  mtimeMs: number;
  fact: Fact | null;
}

export class FactFolderCache {
  private entries = new Map<string, Entry>();
  private folderMtime = -1;
  private lastFullCheck = 0;
  /** Goes up whenever the cached facts change; the search index watches it. */
  version = 0;

  constructor(private readonly dir: string, private readonly state: FactState) {}

  /** Force a check on the next read. */
  invalidate(): void {
    this.folderMtime = -1;
  }

  /**
   * Record this process's own write without rescanning. Called while holding
   * the store lock, so no other app can have written in between, and the
   * folder's new time can be taken as "everything we know about".
   */
  async noteWrite(fact: Fact): Promise<void> {
    await this.note(`${fact.id}.md`, fact);
  }

  async noteRemove(id: string): Promise<void> {
    await this.note(`${id}.md`, null);
  }

  private async note(name: string, fact: Fact | null): Promise<void> {
    const wasCurrent = this.folderMtime !== -1;
    if (fact) {
      try {
        this.entries.set(name, { mtimeMs: (await stat(join(this.dir, name))).mtimeMs, fact });
      } catch {
        this.entries.delete(name);
      }
    } else {
      this.entries.delete(name);
    }
    this.version++;
    // Only trust the new folder time if the cache was current before this write.
    if (wasCurrent) {
      try {
        this.folderMtime = (await stat(this.dir)).mtimeMs;
      } catch {
        this.folderMtime = -1;
      }
    }
  }

  async facts(): Promise<Fact[]> {
    let folderMtime: number;
    try {
      folderMtime = (await stat(this.dir)).mtimeMs;
    } catch {
      if (this.entries.size > 0) { this.entries.clear(); this.version++; }
      this.folderMtime = -1;
      return [];
    }
    const fresh = Date.now() - this.lastFullCheck < FULL_CHECK_MS;
    if (folderMtime !== this.folderMtime || !fresh) await this.rescan(folderMtime);
    const out: Fact[] = [];
    for (const e of this.entries.values()) if (e.fact) out.push(e.fact);
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  private async rescan(folderMtime: number): Promise<void> {
    let names: string[];
    try {
      names = (await readdir(this.dir)).filter((n) => n.endsWith('.md'));
    } catch {
      names = [];
    }
    let changed = false;
    const seen = new Set(names);
    for (const name of [...this.entries.keys()]) {
      if (!seen.has(name)) { this.entries.delete(name); changed = true; }
    }
    await Promise.all(names.map(async (name) => {
      const path = join(this.dir, name);
      let mtimeMs: number;
      try {
        mtimeMs = (await stat(path)).mtimeMs;
      } catch {
        if (this.entries.delete(name)) changed = true;
        return;
      }
      const cached = this.entries.get(name);
      if (cached && cached.mtimeMs === mtimeMs) return;
      const raw = await readIfExists(path);
      this.entries.set(name, { mtimeMs, fact: raw ? parseFact(name.slice(0, -3), raw, this.state) : null });
      changed = true;
    }));
    this.folderMtime = folderMtime;
    this.lastFullCheck = Date.now();
    if (changed) this.version++;
  }
}
