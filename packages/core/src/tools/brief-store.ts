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
import type { ToolExecutionContext } from './types.js';
import { appendMaking, avaContext, beforeChange, type MakingTool } from './making-record.js';

export interface BriefRecord {
  name: string;
  reasoning: string;
  status: 'proposed' | 'agreed';
  proposedAt: string;
  agreedAt?: string;
  /** Set when the person edited it on the card — Ava sees what he changed. */
  editedByPerson?: boolean;
}

export function briefStore<B extends BriefRecord>(root: () => string, fieldKeys: () => string[], tool: MakingTool) {
  const path = (slug: string) => join(root(), slug, 'brief.json');
  const fieldsOf = (brief: B) => {
    const record = brief as unknown as Record<string, unknown>;
    return Object.fromEntries(['name', ...fieldKeys(), 'reasoning'].map((k) => [k, record[k]]));
  };

  /** Her proposal, for the making record: the whole brief as she put it. */
  async function propose(slug: string, brief: B, context?: ToolExecutionContext): Promise<void> {
    const dir = join(root(), slug);
    await beforeChange(dir, tool);
    await write(slug, brief);
    const who = avaContext(context);
    await appendMaking(dir, { event: 'brief_proposed', by: 'ava', ai: who.ai, ask: who.ask, tool, brief: fieldsOf(brief) });
  }

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
    await beforeChange(join(root(), slug), tool);
    await appendMaking(join(root(), slug), { event: 'brief_agreed', by: 'person', tool });
    return brief;
  }

  /** His edits on the card. Saving keeps it agreed only if nothing moved. */
  async function saveEdits(slug: string, fields: Record<string, string | undefined>): Promise<B | null> {
    const brief = await read(slug);
    if (!brief) return null;
    const record = brief as unknown as Record<string, unknown>;
    const changed: Record<string, { from: unknown; to: string }> = {};
    for (const k of fieldKeys()) {
      const v = typeof fields[k] === 'string' ? fields[k]!.trim() : undefined;
      if (v !== undefined && v !== record[k]) { changed[k] = { from: record[k], to: v }; record[k] = v; }
    }
    if (Object.keys(changed).length) {
      brief.editedByPerson = true;
      brief.status = 'proposed';
      delete brief.agreedAt;
      await write(slug, brief);
      await beforeChange(join(root(), slug), tool);
      await appendMaking(join(root(), slug), { event: 'brief_edited', by: 'person', tool, changed });
    }
    return brief;
  }

  return { path, read, write, propose, agree, saveEdits };
}
