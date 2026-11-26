/**
 * Desktop mode's learned steps: what was tried on this machine for a task and
 * how each step went, so the next similar task starts from the path that
 * worked (and knows what failed).
 *
 * This is know-how about the MACHINE, not about the person, so it is kept out
 * of Ava's memory (memory v4): it never shows on the Memory page or comes up
 * in an ordinary chat. One small file, <avaHome>/desktop/learned-steps.json,
 * searched with the same word search memory uses.
 *
 * On first use it brings across the steps the old memory held (patterns
 * tagged "desktop"), once.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SearchIndex } from '../memory-v4/search-index.js';
import { readIfExists, writeAtomic } from '../memory-v4/files.js';

export interface LearnedSteps {
  id: string;
  /** The task, the steps and how each went (Markdown). */
  content: string;
  /** "desktop" plus the app name. */
  tags: string[];
  added: string;
}

const MAX_KEPT = 500;

export class DesktopLearnedSteps {
  private constructor(
    private readonly file: string,
    private entries: LearnedSteps[],
  ) {
    this.reindex();
  }

  private index = new SearchIndex();

  static async open(avaHome: string): Promise<DesktopLearnedSteps> {
    const file = join(avaHome, 'desktop', 'learned-steps.json');
    let entries: LearnedSteps[];
    const raw = await readIfExists(file);
    if (raw !== null) {
      try { entries = (JSON.parse(raw) as { steps?: LearnedSteps[] }).steps ?? []; } catch { entries = []; }
    } else {
      entries = await fromOldMemory(avaHome);
      await writeAtomic(file, JSON.stringify({ version: 1, steps: entries }, null, 2));
    }
    return new DesktopLearnedSteps(file, entries);
  }

  private reindex(): void {
    this.index = new SearchIndex();
    for (const e of this.entries) this.index.add(e.id, e.content);
  }

  get size(): number {
    return this.entries.length;
  }

  async add(content: string, tags: string[]): Promise<LearnedSteps> {
    const entry: LearnedSteps = {
      id: `steps-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      content: content.trim(),
      tags,
      added: new Date().toISOString(),
    };
    // The same task learned again replaces the older run: the newest is what holds now.
    const task = taskLine(entry.content);
    this.entries = this.entries.filter((e) => !task || taskLine(e.content) !== task);
    this.entries.push(entry);
    if (this.entries.length > MAX_KEPT) this.entries = this.entries.slice(-MAX_KEPT);
    this.reindex();
    await writeAtomic(this.file, JSON.stringify({ version: 1, steps: this.entries }, null, 2));
    return entry;
  }

  /** The learned steps that best match a task, best first. */
  find(task: string, limit = 3): LearnedSteps[] {
    const byId = new Map(this.entries.map((e) => [e.id, e]));
    return this.index.search(task, limit * 3)
      .filter((h) => h.coverage >= 0.3)
      .slice(0, limit)
      .map((h) => byId.get(h.id))
      .filter((e): e is LearnedSteps => !!e);
  }
}

function taskLine(content: string): string {
  const m = content.match(/\*\*Desktop task:\*\*\s*(.+)/);
  return m ? m[1].trim().toLowerCase() : '';
}

/** Is this old-memory entry a learned desktop step? (The import skips these.) */
export function isOldDesktopStep(e: { category?: string; tags?: unknown }): boolean {
  return e.category === 'pattern' && Array.isArray(e.tags) && e.tags.includes('desktop');
}

async function fromOldMemory(avaHome: string): Promise<LearnedSteps[]> {
  const out: LearnedSteps[] = [];
  for (const file of [join(avaHome, 'memory', 'graph.json'), join(avaHome, 'memory.json')]) {
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(await readFile(file, 'utf-8')) as { entries?: unknown; nodes?: unknown };
      const list = [data.entries, data.nodes].flatMap((x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []));
      for (const e of list as Array<{ id?: string; content?: string; category?: string; tags?: string[]; archived?: boolean; createdAt?: string }>) {
        if (!isOldDesktopStep(e) || e.archived || !e.content?.trim()) continue;
        out.push({ id: `steps-old-${e.id ?? out.length}`, content: e.content.trim(), tags: e.tags ?? ['desktop'], added: e.createdAt ?? new Date().toISOString() });
      }
    } catch { /* unreadable: nothing to bring */ }
  }
  return out;
}
