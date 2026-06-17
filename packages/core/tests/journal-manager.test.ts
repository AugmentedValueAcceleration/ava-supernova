import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JournalManager } from '../src/journal/journal-manager.js';
import { migrateDay, BUILTIN_KINDS } from '../src/journal/types.js';

let home: string;
let project: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'ava-journal-'));
  project = await mkdtemp(join(tmpdir(), 'ava-project-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
  await rm(project, { recursive: true, force: true });
});

function mgr(opts?: { withProject?: boolean }) {
  return new JournalManager({ globalDir: home, projectRoot: opts?.withProject ? project : undefined });
}

/** Write a raw legacy v1 day file directly to disk. */
async function seedV1(date: string, day: Record<string, unknown>) {
  const dir = join(home, 'journal');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${date}.json`), JSON.stringify(day));
}

// ── migrateDay (pure) ─────────────────────────────────────────────────────────

describe('migrateDay', () => {
  it('maps v1 userEntry + avaEntry to typed entries with deterministic ids', () => {
    const d = migrateDay(
      {
        version: 1,
        date: '2026-06-04',
        userEntry: { content: 'felt good today', mood: 4, tags: ['win'], createdAt: '2026-06-04T08:00:00.000Z', updatedAt: '2026-06-04T09:00:00.000Z' },
        avaEntry: { content: 'shipped the journal', tags: ['build'], createdAt: '2026-06-04T20:00:00.000Z', updatedAt: '2026-06-04T20:00:00.000Z' },
      },
      '2026-06-04',
    );
    expect(d.version).toBe(2);
    expect(d.entries).toHaveLength(2);
    const user = d.entries.find((e) => e.author === 'user')!;
    expect(user.id).toBe('v1-2026-06-04-user');
    expect(user.kind).toBe('personal');
    expect(user.mood).toBe(4);
    expect(user.tags).toEqual(['win']);
    const ava = d.entries.find((e) => e.author === 'ava')!;
    expect(ava.id).toBe('v1-2026-06-04-ava');
    expect(ava.kind).toBe('observation');
  });

  it('is idempotent and lossless', () => {
    const raw = { version: 1, date: '2026-01-01', userEntry: { content: 'x', mood: 2 } };
    const once = migrateDay(raw, '2026-01-01');
    const twice = migrateDay(once, '2026-01-01');
    expect(twice).toEqual(once);
  });

  it('passes a v2 day through unchanged', () => {
    const v2 = { version: 2 as const, date: '2026-02-02', entries: [{ id: 'a', author: 'user' as const, kind: 'idea', content: 'hi', createdAt: 't', updatedAt: 't' }] };
    expect(migrateDay(v2, '2026-02-02')).toEqual(v2);
  });

  it('returns an empty day for missing/empty input', () => {
    expect(migrateDay(null, '2026-03-03')).toEqual({ version: 2, date: '2026-03-03', entries: [] });
    expect(migrateDay({ version: 1, date: '2026-03-03' }, '2026-03-03').entries).toHaveLength(0);
  });
});

// ── Entry CRUD ──────────────────────────────────────────────────────────────

describe('JournalManager entry CRUD', () => {
  it('adds an entry and reads it back', async () => {
    const m = mgr();
    const { id } = await m.addEntry('2026-06-10', { author: 'user', kind: 'feeling', content: 'calm', mood: 5, tags: ['am'] });
    const day = await m.getDay('2026-06-10');
    expect(day!.entries).toHaveLength(1);
    expect(day!.entries[0].id).toBe(id);
    expect(day!.entries[0].mood).toBe(5);
  });

  it('keeps multiple entries ordered by createdAt', async () => {
    const m = mgr();
    const a = await m.addEntry('2026-06-10', { author: 'user', kind: 'idea', content: 'first' });
    const b = await m.addEntry('2026-06-10', { author: 'ava', kind: 'observation', content: 'second' });
    const day = await m.getDay('2026-06-10');
    expect(day!.entries.map((e) => e.id)).toEqual([a.id, b.id]);
  });

  it('updates an entry by id', async () => {
    const m = mgr();
    const { id } = await m.addEntry('2026-06-10', { author: 'user', kind: 'personal', content: 'old', mood: 2 });
    const updated = await m.updateEntry('2026-06-10', id, { content: 'new', mood: 4 });
    expect(updated).not.toBeNull();
    const day = await m.getDay('2026-06-10');
    expect(day!.entries[0].content).toBe('new');
    expect(day!.entries[0].mood).toBe(4);
  });

  it('clears mood when patched to null', async () => {
    const m = mgr();
    const { id } = await m.addEntry('2026-06-10', { author: 'user', kind: 'feeling', content: 'x', mood: 3 });
    await m.updateEntry('2026-06-10', id, { mood: null });
    const day = await m.getDay('2026-06-10');
    expect(day!.entries[0].mood).toBeUndefined();
  });

  it('deletes an entry and returns null for unknown ids', async () => {
    const m = mgr();
    const { id } = await m.addEntry('2026-06-10', { author: 'user', kind: 'idea', content: 'x' });
    expect(await m.deleteEntry('2026-06-10', 'nope')).toBeNull();
    const day = await m.deleteEntry('2026-06-10', id);
    expect(day!.entries).toHaveLength(0);
  });
});

// ── Migration through the manager (id stability) ──────────────────────────────

describe('JournalManager migration', () => {
  it('reads a legacy v1 file as typed entries', async () => {
    await seedV1('2026-05-01', { version: 1, date: '2026-05-01', userEntry: { content: 'legacy' }, avaEntry: { content: 'note' } });
    const day = await mgr().getDay('2026-05-01');
    expect(day!.entries).toHaveLength(2);
    expect(day!.entries.find((e) => e.author === 'user')!.content).toBe('legacy');
  });

  it('can edit a migrated entry by its stable id without a reload mismatch', async () => {
    await seedV1('2026-05-01', { version: 1, date: '2026-05-01', userEntry: { content: 'legacy', mood: 3 } });
    const m = mgr();
    await m.getDay('2026-05-01'); // read first (mints deterministic id)
    const ok = await m.updateEntry('2026-05-01', 'v1-2026-05-01-user', { content: 'edited' });
    expect(ok).not.toBeNull();
    const day = await m.getDay('2026-05-01');
    expect(day!.entries[0].content).toBe('edited');
  });
});

// ── Project/global merge by id ────────────────────────────────────────────────

describe('JournalManager global + project merge', () => {
  it('unions entries across scopes without duplicates', async () => {
    const m = mgr({ withProject: true });
    await m.addEntry('2026-06-12', { author: 'user', kind: 'personal', content: 'global one' }, 'global');
    await m.addEntry('2026-06-12', { author: 'ava', kind: 'observation', content: 'project one' }, 'project');
    const day = await m.getDay('2026-06-12');
    expect(day!.entries).toHaveLength(2);
    expect(day!.entries.map((e) => e.content).sort()).toEqual(['global one', 'project one']);
  });
});

// ── Month / year views ────────────────────────────────────────────────────────

describe('JournalManager month + year', () => {
  it('returns month entries annotated with their date', async () => {
    const m = mgr();
    await m.addEntry('2026-06-01', { author: 'user', kind: 'idea', content: 'june a' });
    await m.addEntry('2026-06-20', { author: 'user', kind: 'idea', content: 'june b' });
    await m.addEntry('2026-07-01', { author: 'user', kind: 'idea', content: 'july' });
    const june = await m.getMonth(2026, 6);
    expect(june).toHaveLength(2);
    expect(june.every((e) => e.date.startsWith('2026-06'))).toBe(true);
    expect(june[0]).toHaveProperty('date');
  });

  it('summarizes a year with counts and mood', async () => {
    const m = mgr();
    await m.addEntry('2026-06-01', { author: 'user', kind: 'feeling', content: 'a', mood: 4 });
    await m.addEntry('2026-06-01', { author: 'user', kind: 'feeling', content: 'b', mood: 2 });
    const summary = await m.getYearSummary(2026);
    expect(summary['2026-06-01'].count).toBe(2);
    expect(summary['2026-06-01'].avgMood).toBe(3);
    expect(summary['2026-06-01'].authors.user).toBe(true);
    expect(summary['2026-06-01'].byKind.feeling).toBe(2);
  });
});

// ── Search ────────────────────────────────────────────────────────────────────

describe('JournalManager search', () => {
  it('finds entries and respects kind/author filters', async () => {
    const m = mgr();
    await m.addEntry('2026-06-01', { author: 'user', kind: 'idea', content: 'refactor the journal' });
    await m.addEntry('2026-06-02', { author: 'ava', kind: 'observation', content: 'refactor noticed' });
    expect(await m.search('refactor')).toHaveLength(2);
    expect(await m.search('refactor', { author: 'user' })).toHaveLength(1);
    expect(await m.search('refactor', { kind: 'observation' })).toHaveLength(1);
    expect(await m.search('nothing-here')).toHaveLength(0);
  });
});

// ── Kinds registry ────────────────────────────────────────────────────────────

describe('JournalManager kinds', () => {
  it('lists built-ins by default', async () => {
    const kinds = await mgr().listKinds();
    expect(kinds).toHaveLength(BUILTIN_KINDS.length);
    expect(kinds.find((k) => k.id === 'personal')!.tracksMood).toBe(true);
  });

  it('adds, updates and deletes custom kinds', async () => {
    const m = mgr();
    let kinds = await m.addKind({ id: 'Dream', label: 'Dream', color: '#abcdef', tracksMood: true });
    expect(kinds.find((k) => k.id === 'dream')).toBeTruthy();
    kinds = await m.updateKind('dream', { color: '#000000' });
    expect(kinds.find((k) => k.id === 'dream')!.color).toBe('#000000');
    kinds = await m.deleteKind('dream');
    expect(kinds.find((k) => k.id === 'dream')).toBeFalsy();
  });

  it('rejects shadowing or deleting a built-in, and duplicates', async () => {
    const m = mgr();
    await expect(m.addKind({ id: 'personal', label: 'X', color: '#fff', tracksMood: false })).rejects.toThrow(/built-in/i);
    await expect(m.deleteKind('idea')).rejects.toThrow(/built-in/i);
    await m.addKind({ id: 'win', label: 'Win', color: '#0f0', tracksMood: false });
    await expect(m.addKind({ id: 'win', label: 'Win', color: '#0f0', tracksMood: false })).rejects.toThrow(/already exists/i);
  });
});

// ── Concurrency (lost-update safety) ──────────────────────────────────────────

describe('JournalManager concurrency', () => {
  it('keeps every entry when many are added to one day at once', async () => {
    const m = mgr();
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => m.addEntry('2026-06-15', { author: 'user', kind: 'idea', content: `entry ${i}` })),
    );
    const day = await m.getDay('2026-06-15');
    expect(day!.entries).toHaveLength(8);
    expect(new Set(day!.entries.map((e) => e.id)).size).toBe(8);
  });
});

// ── Back-compat shims (Ava auto-journal + sidecar) ────────────────────────────

describe('JournalManager back-compat shims', () => {
  it('appendAvaEntry adds a new observation entry each call', async () => {
    const m = mgr();
    await m.appendAvaEntry('2026-06-16', 'session one');
    await m.appendAvaEntry('2026-06-16', 'session two');
    const day = await m.getDay('2026-06-16');
    expect(day!.entries).toHaveLength(2);
    expect(day!.entries.every((e) => e.author === 'ava' && e.kind === 'observation')).toBe(true);
  });

  it('writeUserEntry upserts a single personal entry', async () => {
    const m = mgr();
    await m.writeUserEntry('2026-06-16', 'first', 3);
    await m.writeUserEntry('2026-06-16', 'second', 5);
    const day = await m.getDay('2026-06-16');
    expect(day!.entries).toHaveLength(1);
    expect(day!.entries[0].content).toBe('second');
    expect(day!.entries[0].mood).toBe(5);
  });
});
