/**
 * The brief file both making rooms share: brief.json in the work's own folder.
 *
 * Blender and GIMP ask different questions, but the rules are one rule: Ava
 * proposes, the person edits and agrees, and nothing is built before that.
 * Only `agree` makes a brief agreed, and the surfaces call it from his button.
 * A change by him puts it back to proposed: a changed brief is a new agreement.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface BriefRecord {
  name: string;
  reasoning: string;
  status: 'proposed' | 'agreed';
  proposedAt: string;
  agreedAt?: string;
  /** Set when the person edited it on the card — Ava sees what he changed. */
  editedByPerson?: boolean;
}

export function briefStore<B extends BriefRecord>(root: () => string, fieldKeys: () => string[]) {
  const path = (slug: string) => join(root(), slug, 'brief.json');

  async function read(slug: string): Promise<B | null> {
    try { return JSON.parse(await readFile(path(slug), 'utf-8')) as B; } catch { return null; }
  }

  async function write(slug: string, brief: B): Promise<void> {
    await mkdir(join(root(), slug), { recursive: true });
    await writeFile(path(slug), JSON.stringify(brief, null, 2), 'utf-8');
  }

  /** His button on the card. The ONLY way a brief becomes agreed. */
  async function agree(slug: string): Promise<B | null> {
    const brief = await read(slug);
    if (!brief) return null;
    brief.status = 'agreed';
    brief.agreedAt = new Date().toISOString();
    await write(slug, brief);
    return brief;
  }

  /** His edits on the card. Saving keeps it agreed only if nothing moved. */
  async function saveEdits(slug: string, fields: Record<string, string | undefined>): Promise<B | null> {
    const brief = await read(slug);
    if (!brief) return null;
    const record = brief as unknown as Record<string, unknown>;
    let changed = false;
    for (const k of fieldKeys()) {
      const v = typeof fields[k] === 'string' ? fields[k]!.trim() : undefined;
      if (v !== undefined && v !== record[k]) { record[k] = v; changed = true; }
    }
    if (changed) {
      brief.editedByPerson = true;
      brief.status = 'proposed';
      delete brief.agreedAt;
      await write(slug, brief);
    }
    return brief;
  }

  return { path, read, write, agree, saveEdits };
}
