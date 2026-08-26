// A day that cannot be read must never be replaced with an empty one.
//
// readFresh is called by mutateDay INSIDE the lock, and whatever it returns is
// written straight back. So `catch { return createEmptyJournalDay() }` — which
// is what it used to do for every failure — did not mean "start fresh". It
// meant "overwrite this day with nothing", turning a transient read error into
// permanent loss of writing the person cannot reproduce.
//
// Found while chasing an intermittent concurrency failure in the journal. This
// path was NOT the cause of that (instrumentation proved it never fired), and
// it is fixed on its own merits: a silent fallback that can only ever destroy
// data is wrong whether or not it is currently firing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JournalManager } from '../src/journal/journal-manager.js';

let home: string;
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'ava-journal-fail-')); });
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

const dayPath = (date: string) => join(home, 'journal', `${date}.json`);

async function seed(date: string, contents: string) {
  await mkdir(join(home, 'journal'), { recursive: true });
  await writeFile(dayPath(date), contents, 'utf-8');
}

describe('a day that cannot be read is never overwritten', () => {
  it('corrupt JSON is preserved rather than silently replaced', async () => {
    await seed('2026-06-20', '{ this is not json at all');
    const m = new JournalManager({ globalDir: home });

    await m.addEntry('2026-06-20', { author: 'user', kind: 'idea', content: 'new entry' });

    // The new entry is written...
    const day = await m.getDay('2026-06-20');
    expect(day!.entries).toHaveLength(1);

    // ...but the unreadable original still exists somewhere. Those bytes may be
    // the only copy of what the person wrote.
    const files = await readdir(join(home, 'journal'));
    const kept = files.find((f) => f.includes('.corrupt-'));
    expect(kept, 'the corrupt day was destroyed instead of preserved').toBeDefined();
    expect(await readFile(join(home, 'journal', kept!), 'utf-8')).toBe('{ this is not json at all');
  });

  it('a readable day is still read normally', async () => {
    // Guards the guard: if the retry/throw path broke ordinary reads, every
    // assertion above would still pass while the journal was unusable.
    const m = new JournalManager({ globalDir: home });
    await m.addEntry('2026-06-21', { author: 'user', kind: 'idea', content: 'first' });
    await m.addEntry('2026-06-21', { author: 'user', kind: 'idea', content: 'second' });
    const day = await m.getDay('2026-06-21');
    expect(day!.entries).toHaveLength(2);
    expect(day!.entries.map((e) => e.content)).toEqual(['first', 'second']);
  });

  it('an empty file is treated as corrupt, not as an empty day', async () => {
    // A zero-length file is the classic result of an interrupted write. It is
    // not the same as no file, and it must not be taken as "nothing was here".
    await seed('2026-06-22', '');
    const m = new JournalManager({ globalDir: home });
    await m.addEntry('2026-06-22', { author: 'user', kind: 'idea', content: 'after' });
    const files = await readdir(join(home, 'journal'));
    expect(files.some((f) => f.includes('.corrupt-'))).toBe(true);
  });
});
