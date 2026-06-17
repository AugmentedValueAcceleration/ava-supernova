import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JournalWriteTool } from '../src/tools/journal.js';
import { JournalManager } from '../src/journal/journal-manager.js';

let home: string;
let jm: JournalManager;
const tool = new JournalWriteTool();

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'ava-journal-tool-'));
  jm = new JournalManager({ globalDir: home });
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = () => ({ cwd: home, sharedState: { journalManager: jm } }) as any;

describe('JournalWriteTool', () => {
  it('is named journal_write and is safe', () => {
    expect(tool.name).toBe('journal_write');
    expect(tool.riskLevel).toBe('safe');
    expect(tool.schema.parameters.required).toContain('action');
    expect((tool.schema.parameters.properties.action as { enum: string[] }).enum).toContain('add_entry');
  });

  it('reports a missing journal manager', async () => {
    const r = await tool.execute({ action: 'read' }, { cwd: home } as never);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/not available/i);
  });

  it('adds an entry then reads it back', async () => {
    const add = await tool.execute({ action: 'add_entry', author: 'user', kind: 'feeling', content: 'grateful', mood: 5, date: '2026-06-10' }, ctx());
    expect(add.success).toBe(true);
    const read = await tool.execute({ action: 'read', date: '2026-06-10' }, ctx());
    expect(read.output).toContain('grateful');
  });

  it('requires content for add_entry', async () => {
    const r = await tool.execute({ action: 'add_entry', author: 'ava' }, ctx());
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/content/i);
  });

  it('updates and deletes by id', async () => {
    await jm.addEntry('2026-06-11', { author: 'user', kind: 'idea', content: 'rough' });
    const day = await jm.getDay('2026-06-11');
    const id = day!.entries[0].id;
    const upd = await tool.execute({ action: 'update_entry', id, content: 'polished', date: '2026-06-11' }, ctx());
    expect(upd.success).toBe(true);
    const del = await tool.execute({ action: 'delete_entry', id, date: '2026-06-11' }, ctx());
    expect(del.success).toBe(true);
    expect((await jm.getDay('2026-06-11'))!.entries).toHaveLength(0);
  });

  it('searches across entries', async () => {
    await jm.addEntry('2026-06-12', { author: 'ava', kind: 'observation', content: 'the parser is flaky' });
    const r = await tool.execute({ action: 'search', query: 'parser' }, ctx());
    expect(r.success).toBe(true);
    expect(r.output).toMatch(/parser/i);
  });
});
