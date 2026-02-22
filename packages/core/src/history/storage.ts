import { readFile, writeFile, readdir, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { HISTORY_DIR } from '../core/constants.js';
import type { Message } from '../core/types.js';

export interface ConversationRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  messages: Message[];
}

export class HistoryStorage {
  async init(): Promise<void> {
    await mkdir(HISTORY_DIR, { recursive: true });
  }

  async save(record: ConversationRecord): Promise<void> {
    const path = join(HISTORY_DIR, `${record.id}.json`);
    await writeFile(path, JSON.stringify(record, null, 2), 'utf-8');
  }

  async load(id: string): Promise<ConversationRecord | null> {
    const path = join(HISTORY_DIR, `${id}.json`);
    try {
      const raw = await readFile(path, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async list(): Promise<Array<{ id: string; title: string; updatedAt: string }>> {
    await this.init();
    const files = await readdir(HISTORY_DIR);
    const summaries: Array<{ id: string; title: string; updatedAt: string }> = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(HISTORY_DIR, file), 'utf-8');
        const record: ConversationRecord = JSON.parse(raw);
        summaries.push({
          id: record.id,
          title: record.title,
          updatedAt: record.updatedAt,
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
}
