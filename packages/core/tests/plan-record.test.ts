// An accepted plan becomes a decision record.
//
// The Decisions folder is the project's memory of what was settled, and until
// now Ava could only read it. Its own README promises "when Ava records a
// decision, it shows up in the timeline as a normal file edit" — nothing in
// core ever wrote a line. This is that promise kept, and the tests hold it to
// the three limits that keep the folder worth reading: only accepted plans,
// never create the folder, record the choice and not the progress.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writePlanRecord } from '../src/config/project.js';

const PLAN = {
  title: 'Complete Inventory System Implementation',
  goal: 'Finish the inventory system end-to-end.',
  confidence: 'high',
  verification: 'Press Tab, see the item, click to equip.',
  steps: [
    { description: 'Create SC_ItemDefinition DataAssets', files: ['Content/Items/Weapons/'], notes: 'Data layer.' },
    { description: 'Add ItemRegistry auto-population' },
  ],
  alternatives: [
    { label: 'Full implementation', description: 'All eleven tasks at once' },
    { label: 'Minimal First', description: 'Four-task core loop, validate, then expand' },
  ],
};

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ava-record-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A project that has opted in to the Decisions folder. */
async function withDecisions(): Promise<void> {
  await mkdir(join(root, 'Decisions', 'records'), { recursive: true });
}

describe('a project with no Decisions folder', () => {
  it('writes nothing and does not create one', async () => {
    // The folder is opt-in per project and always has been. Accepting a plan
    // is not consent to scaffold it.
    expect(await writePlanRecord(root, PLAN, { selection: 'Minimal First' })).toBeNull();
    expect(existsSync(join(root, 'Decisions'))).toBe(false);
  });

  it('does nothing without a project root', async () => {
    expect(await writePlanRecord(undefined, PLAN)).toBeNull();
  });
});

describe('recording an accepted plan', () => {
  beforeEach(withDecisions);

  it('writes a numbered ADR named after the plan', async () => {
    const path = await writePlanRecord(root, PLAN, { selection: 'Minimal First' });
    expect(path).toBeTruthy();
    expect(await readdir(join(root, 'Decisions', 'records')))
      .toEqual(['0001-complete-inventory-system-implementation.md']);
  });

  it('leads with the decision, not the plan', async () => {
    const path = await writePlanRecord(root, PLAN, {
      selection: 'Minimal First',
      note: 'keep the console command',
    });
    const md = await readFile(path!, 'utf-8');

    expect(md).toContain('# 0001. Complete Inventory System Implementation');
    expect(md).toContain('**Status:** Accepted');
    expect(md).toContain('Chose the **Minimal First** approach.');
    expect(md).toContain('> Four-task core loop, validate, then expand');
    expect(md).toContain('The user added: "keep the console command"');
    // The Decision section comes before the Plan section.
    expect(md.indexOf('## Decision')).toBeLessThan(md.indexOf('## Plan'));
  });

  it('keeps the approaches that were NOT taken', async () => {
    // The most valuable half of an ADR, and the first thing lost when a
    // decision is only remembered rather than written down.
    const md = await readFile((await writePlanRecord(root, PLAN, { selection: 'Minimal First' }))!, 'utf-8');
    expect(md).toContain('- **Full implementation**');
    expect(md).toContain('- **Minimal First** — **chosen**');
    expect(md).not.toMatch(/\*\*Full implementation\*\* — \*\*chosen\*\*/);
  });

  it('records the steps and their files', async () => {
    const md = await readFile((await writePlanRecord(root, PLAN, { selection: 'Minimal First' }))!, 'utf-8');
    expect(md).toContain('1. Create SC_ItemDefinition DataAssets');
    expect(md).toContain('`Content/Items/Weapons/`');
    expect(md).toContain('Press Tab, see the item, click to equip.');
  });

  it('says so plainly when no approaches were offered', async () => {
    const { alternatives, ...single } = PLAN;
    const md = await readFile((await writePlanRecord(root, single, {}))!, 'utf-8');
    expect(md).toContain('Approved as proposed');
    expect(md).not.toContain('## Approaches considered');
  });
});

describe('numbering', () => {
  beforeEach(withDecisions);

  it('continues from the highest record already on disk', async () => {
    // Reads the directory rather than counting, so a hand-numbered or
    // hand-deleted record cannot cause a collision.
    const dir = join(root, 'Decisions', 'records');
    await writeFile(join(dir, '0007-framework.md'), '# 0007', 'utf-8');
    await writeFile(join(dir, 'notes.md'), 'not a record', 'utf-8');
    const path = await writePlanRecord(root, PLAN, {});
    expect(path).toContain('0008-');
  });

  it('does not overwrite a record when the same plan is accepted twice', async () => {
    const first = await writePlanRecord(root, PLAN, { selection: 'Full implementation' });
    const second = await writePlanRecord(root, PLAN, { selection: 'Minimal First' });
    expect(second).not.toBe(first);
    // A revision is a NEW record — the folder shows how the thinking moved.
    expect(await readFile(first!, 'utf-8')).toContain('Full implementation** approach');
    expect(await readFile(second!, 'utf-8')).toContain('Minimal First** approach');
  });

  it('creates records/ when the folder exists without it', async () => {
    await rm(join(root, 'Decisions', 'records'), { recursive: true, force: true });
    expect(await writePlanRecord(root, PLAN, {})).toContain('0001-');
  });
});

describe('titles that are hostile to filenames', () => {
  beforeEach(withDecisions);

  it('strips path separators and punctuation', async () => {
    const path = await writePlanRecord(root, { ...PLAN, title: '../../etc/passwd: "fix" it!' }, {});
    expect(path).toContain('etc-passwd-fix-it');
    expect(path).not.toContain('..');
    // Still inside records/, which is the point.
    expect(path!.startsWith(join(root, 'Decisions', 'records'))).toBe(true);
  });

  it('falls back rather than writing a nameless file', async () => {
    const path = await writePlanRecord(root, { ...PLAN, title: '???' }, {});
    expect(path).toContain('0001-decision.md');
  });
});
