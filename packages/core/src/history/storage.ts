import { readFile, writeFile, rename, readdir, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { HISTORY_DIR } from '../core/constants.js';
import type { Message } from '../core/types.js';

export interface ConversationRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  messages: Message[];
  pinned?: boolean;
  projectPath?: string;
}

/** Default max conversations to keep before pruning oldest. */
const MAX_HISTORY = 100;

export class HistoryStorage {
  async init(): Promise<void> {
    await mkdir(HISTORY_DIR, { recursive: true });
    // Clean up orphaned temp files from interrupted writes
    try {
      const files = await readdir(HISTORY_DIR);
      for (const file of files) {
        if (file.endsWith('.tmp')) {
          await unlink(join(HISTORY_DIR, file)).catch(() => {});
        }
      }
    } catch { /* directory might not exist yet */ }
  }

  async save(record: ConversationRecord): Promise<void> {
    const path = join(HISTORY_DIR, `${record.id}.json`);
    const tmpPath = join(HISTORY_DIR, `.${record.id}.tmp`);
    const data = JSON.stringify(record, null, 2);

    // Atomic write — temp file then rename
    await writeFile(tmpPath, data, 'utf-8');
    try {
      await rename(tmpPath, path);
    } catch (err) {
      // Clean up temp file if rename fails (disk full, permissions, etc.)
      await unlink(tmpPath).catch(() => {});
      throw err;
    }
  }

  /** Validate that parsed JSON has the required ConversationRecord shape. */
  private isValidRecord(value: unknown): value is ConversationRecord {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Record<string, unknown>).id === 'string' &&
      Array.isArray((value as Record<string, unknown>).messages)
    );
  }

  async load(id: string): Promise<ConversationRecord | null> {
    const path = join(HISTORY_DIR, `${id}.json`);
    try {
      const raw = await readFile(path, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!this.isValidRecord(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async list(): Promise<Array<{ id: string; title: string; updatedAt: string; pinned?: boolean; projectPath?: string }>> {
    await this.init();
    const files = await readdir(HISTORY_DIR);
    const summaries: Array<{ id: string; title: string; updatedAt: string; pinned?: boolean; projectPath?: string }> = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(HISTORY_DIR, file), 'utf-8');
        const record = JSON.parse(raw);
        if (!this.isValidRecord(record)) continue;
        summaries.push({
          id: record.id,
          title: record.title,
          updatedAt: record.updatedAt,
          pinned: record.pinned,
          projectPath: record.projectPath,
        });
      } catch {
        // skip corrupt files
      }
    }

    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async delete(id: string): Promise<boolean> {
    const path = join(HISTORY_DIR, `${id}.json`);
    try {
      await unlink(path);
      return true;
    } catch {
      return false;
    }
  }

  /** Remove oldest unpinned conversations when count exceeds maxHistory. */
  async prune(maxHistory: number = MAX_HISTORY): Promise<number> {
    const all = await this.list();
    // Never prune pinned conversations
    const unpinned = all.filter((entry) => !entry.pinned);
    if (unpinned.length <= maxHistory) return 0;

    // list() is sorted newest-first, so slice from maxHistory onwards
    const toDelete = unpinned.slice(maxHistory);
    let deleted = 0;
    for (const entry of toDelete) {
      if (await this.delete(entry.id)) deleted++;
    }
    return deleted;
  }
}
