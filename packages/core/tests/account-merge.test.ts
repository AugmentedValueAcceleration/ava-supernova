// Bringing account-era data home (1 Nov 2026). Built in temp folders, never a
// real ~/.ava. The rule that matters above all: nothing is lost.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeAccountFolders, ACCOUNT_MERGE_MARKER } from '../src/config/account-merge.js';

let home: string;
const put = (rel: string, body: string | object) => {
  const p = join(home, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, typeof body === 'string' ? body : JSON.stringify(body));
};
const read = (rel: string) => readFileSync(join(home, rel), 'utf-8');
const json = (rel: string) => JSON.parse(read(rel));

beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'ava-merge-')); });

describe('mergeAccountFolders', () => {
  it('does nothing when there are no account folders', async () => {
    put('memory.json', '{"a":1}');
    const r = await mergeAccountFolders(home);
    expect(r.merged).toBe(false);
    expect(existsSync(join(home, ACCOUNT_MERGE_MARKER))).toBe(false);
  });

  it('copies everything that is not already there, and leaves users/ untouched', async () => {
    put('users/acct-1/history/c1.json', '{"id":"c1"}');
    put('users/acct-1/journal/2026-10-22.json', '{"d":1}');
    const r = await mergeAccountFolders(home);
    expect(r.merged).toBe(true);
    expect(read('history/c1.json')).toBe('{"id":"c1"}');
    expect(read('journal/2026-10-22.json')).toBe('{"d":1}');
    expect(existsSync(join(home, 'users/acct-1/history/c1.json'))).toBe(true);
  });

  it('the account the apps were showing wins a clash, and the replaced file is kept beside it', async () => {
    put('memory.json', '{"root":true}');
    put('users/acct-1/memory.json', '{"account":true}');
    await mergeAccountFolders(home, { preferredAccount: 'acct-1' });
    expect(json('memory.json')).toEqual({ account: true });
    expect(json('memory.before-merge.json')).toEqual({ root: true });
  });

  it('merges lists of items by id instead of replacing one with the other', async () => {
    put('creative/metadata.json', [{ id: 'r1' }, { id: 'shared', v: 'root' }]);
    put('users/acct-1/creative/metadata.json', [{ id: 'a1' }, { id: 'shared', v: 'account' }]);
    await mergeAccountFolders(home, { preferredAccount: 'acct-1' });
    const merged = json('creative/metadata.json') as Array<{ id: string; v?: string }>;
    expect(merged.map((x) => x.id).sort()).toEqual(['a1', 'r1', 'shared']);
    expect(merged.find((x) => x.id === 'shared')?.v).toBe('account');
    expect(existsSync(join(home, 'creative/metadata.before-merge.json'))).toBe(true);
  });

  it('a second account adds what does not clash and keeps its clashing files aside', async () => {
    put('users/acct-1/memory.json', '{"one":1}');
    put('users/acct-2/memory.json', '{"two":2}');
    put('users/acct-2/history/c2.json', '{"id":"c2"}');
    await mergeAccountFolders(home, { preferredAccount: 'acct-1' });
    expect(json('memory.json')).toEqual({ one: 1 });
    expect(json('memory.from-account-acct-2.json')).toEqual({ two: 2 });
    expect(read('history/c2.json')).toBe('{"id":"c2"}');
  });

  it('skips identical files and the old sync state', async () => {
    put('tasks/tasks.json', '[]');
    put('users/acct-1/tasks/tasks.json', '[]');
    put('users/acct-1/sync-state.json', '{"x":1}');
    const r = await mergeAccountFolders(home);
    expect(r.skippedIdentical).toBe(1);
    expect(existsSync(join(home, 'sync-state.json'))).toBe(false);
  });

  it('runs once', async () => {
    put('users/acct-1/history/c1.json', '{"id":"c1"}');
    await mergeAccountFolders(home);
    put('users/acct-1/history/late.json', '{"id":"late"}');
    const second = await mergeAccountFolders(home);
    expect(second.merged).toBe(false);
    expect(second.reason).toBe('already merged');
    expect(existsSync(join(home, 'history/late.json'))).toBe(false);
  });

  it('with no pointer, picks the account with the most signs of use', async () => {
    put('users/thin/memory.json', '{"thin":1}');
    put('users/busy/memory.json', '{"busy":1}');
    put('users/busy/journal/d.json', '{}');
    put('users/busy/history/h.json', '{}');
    const r = await mergeAccountFolders(home);
    expect(r.activeAccount).toBe('busy');
    expect(json('memory.json')).toEqual({ busy: 1 });
    expect(readdirSync(home).some((f) => f.startsWith('memory.from-account-thin'))).toBe(true);
  });
});

describe('stores shaped { version, entries: [...] }', () => {
  it('merges the entries by id and keeps the winner\'s other fields', async () => {
    put('tasks/tasks.json', { version: 2, lastModified: 'old', entries: [{ id: 't-root' }, { id: 'both', s: 'root' }] });
    put('users/acct-1/tasks/tasks.json', { version: 2, lastModified: 'new', entries: [{ id: 't-acct' }, { id: 'both', s: 'acct' }] });
    const r = await mergeAccountFolders(home, { preferredAccount: 'acct-1' });
    const t = json('tasks/tasks.json') as { lastModified: string; entries: Array<{ id: string; s?: string }> };
    expect(t.lastModified).toBe('new');
    expect(t.entries.map((e) => e.id).sort()).toEqual(['both', 't-acct', 't-root']);
    expect(t.entries.find((e) => e.id === 'both')?.s).toBe('acct');
    expect(r.listsMerged).toBe(1);
  });

  it('keeps both files when an object differs in a way it does not understand', async () => {
    put('memory.json', { prefs: { theme: 'dark' } });
    put('users/acct-1/memory.json', { prefs: { theme: 'light' } });
    await mergeAccountFolders(home, { preferredAccount: 'acct-1' });
    expect(json('memory.json')).toEqual({ prefs: { theme: 'light' } });
    expect(json('memory.before-merge.json')).toEqual({ prefs: { theme: 'dark' } });
  });
});
