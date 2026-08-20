// A project's plans load with the project.
//
// A decision record written and never read again is just a file. The sidebar
// reads these back so the plans belong to the project rather than to the
// session — the operator's point: "the plans would be connected to a project
// and should load in the right sidebar when we reopen".
//
// The list is deliberately shallow. loadDecisionsContext already injects record
// FILENAMES into the prompt and leaves the bodies on disk; this makes the same
// bargain for the UI, reading the heading and the metadata lines rather than
// holding fifty plans in memory.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listPlanRecords, writePlanRecord, readPlanRecord } from '../src/config/project.js';

let root: string;
const recordsDir = () => join(root, 'Decisions', 'records');

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ava-list-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('a project with nothing to list', () => {
  it('returns empty rather than failing when there is no Decisions folder', async () => {
    // Absence of the folder is a normal state — it is opt-in per project.
    expect(await listPlanRecords(root)).toEqual([]);
  });

  it('returns empty without a project root', async () => {
    expect(await listPlanRecords(undefined)).toEqual([]);
  });

  it('returns empty for a Decisions folder with no records yet', async () => {
    await mkdir(join(root, 'Decisions'), { recursive: true });
    expect(await listPlanRecords(root)).toEqual([]);
  });
});

describe('listing what was recorded', () => {
  beforeEach(async () => { await mkdir(recordsDir(), { recursive: true }); });

  it('round-trips a record it just wrote', async () => {
    // The two halves of the feature, tested together — a write the reader
    // cannot parse would pass both of their own unit tests and still be broken.
    await writePlanRecord(root, {
      title: 'Complete Inventory System',
      goal: 'Finish it.',
      confidence: 'high',
      steps: [{ description: 'one' }, { description: 'two' }, { description: 'three' }],
      alternatives: [
        { label: 'Full implementation', description: 'everything at once' },
        { label: 'Minimal First', description: 'core loop first' },
      ],
    }, { selection: 'Minimal First', note: 'keep the console command' });

    const [rec] = await listPlanRecords(root);
    expect(rec.number).toBe(1);
    expect(rec.title).toBe('Complete Inventory System');
    expect(rec.status).toBe('Accepted');
    expect(rec.chosen).toBe('Minimal First');
    expect(rec.stepCount).toBe(3);
    // The step TEXT travels with the list, so the sidebar can show the plan
    // without opening the file.
    expect(rec.steps).toEqual(['one', 'two', 'three']);
    expect(rec.relPath).toBe('Decisions/records/0001-complete-inventory-system.md');
    expect(rec.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('puts the newest first', async () => {
    for (const title of ['First thing', 'Second thing', 'Third thing']) {
      await writePlanRecord(root, { title, steps: [] }, {});
    }
    expect((await listPlanRecords(root)).map(r => r.title))
      .toEqual(['Third thing', 'Second thing', 'First thing']);
  });

  it('lists a record a human wrote by hand', async () => {
    // Anything in records/ is a decision someone made. A list that hid the
    // user's own records would be worse than no list.
    await writeFile(join(recordsDir(), '0003-use-postgres.md'),
      '# 0003. Use Postgres\n\n- **Status:** Accepted\n\nBecause we need transactions.\n', 'utf-8');
    const [rec] = await listPlanRecords(root);
    expect(rec.title).toBe('Use Postgres');
    expect(rec.number).toBe(3);
    expect(rec.stepCount).toBe(0);
    expect(rec.chosen).toBeUndefined();
  });

  it('falls back to the filename when a record has no heading', async () => {
    await writeFile(join(recordsDir(), '0002-no-heading.md'), 'just some prose\n', 'utf-8');
    expect((await listPlanRecords(root))[0].title).toBe('0002-no-heading');
  });

  it('ignores files that are not records', async () => {
    await writeFile(join(recordsDir(), 'notes.txt'), 'not markdown', 'utf-8');
    await writeFile(join(recordsDir(), '.gitkeep'), '', 'utf-8');
    await writePlanRecord(root, { title: 'Real one', steps: [] }, {});
    expect((await listPlanRecords(root)).map(r => r.title)).toEqual(['Real one']);
  });

  it('counts only the steps under ## Plan', async () => {
    // A numbered list in the goal or the verification is not a step.
    await writeFile(join(recordsDir(), '0001-mixed.md'), [
      '# 0001. Mixed', '',
      '## Goal', '', '1. not a step', '2. also not a step', '',
      '## Plan', '', '1. a step', '2. another step', '',
      '## Verification', '', '1. not a step', '',
    ].join('\n'), 'utf-8');
    const rec = (await listPlanRecords(root))[0];
    expect(rec.stepCount).toBe(2);
    expect(rec.steps).toEqual(['a step', 'another step']);
  });

  it('keeps the step text but not its sub-lines', async () => {
    // Files and notes are indented under the step. They belong in the record,
    // not on a sidebar row — the row is meant to be readable at a glance.
    const path = await writePlanRecord(root, {
      title: 'With files',
      steps: [{ description: 'Create the slot widget', files: ['UI/SC_ItemSlotWidget.h'], notes: 'pure display' }],
    }, {});
    const [rec] = await listPlanRecords(root);
    expect(rec.steps).toEqual(['Create the slot widget']);
    // …and the detail is still in the file, which is what opening it is for.
    expect(await readPlanRecord(path!)).toContain('UI/SC_ItemSlotWidget.h');
  });
});

describe('reading one record in full', () => {
  beforeEach(async () => { await mkdir(recordsDir(), { recursive: true }); });

  it('returns the body', async () => {
    const path = await writePlanRecord(root, { title: 'Read me', steps: [] }, {});
    expect(await readPlanRecord(path!)).toContain('# 0001. Read me');
  });

  it('returns null for a file that is not there', async () => {
    expect(await readPlanRecord(join(recordsDir(), 'nope.md'))).toBeNull();
  });
});
