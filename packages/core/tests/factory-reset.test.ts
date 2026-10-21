// Factory reset — tested on a scratch tree, never on real data.
//
// This is the one module in the codebase whose bugs are measured in lost
// years. The first draft of it filed `users/` (account memory, history,
// journal, health) under "caches, safe to delete, ticked by default", and
// pointed `memory` at the home root where a signed-in user has nothing. It
// would have deleted everything the user owned under a reassuring label and
// spared the thing the label named.
//
// So the tests that matter here are not "does it delete" — they are "does it
// delete the RIGHT thing, and does it refuse the wrong one".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resetCategories, categoryPaths, scanCategories, executeReset, formatBytes,
  type ResetHost,
} from '../src/portability/factory-reset.js';

let home: string;
const ACCOUNT = 'users/acct-123';

const exists = async (p: string) => access(p).then(() => true, () => false);

function host(): ResetHost & { secrets: string[]; keys: string[] } {
  const h = {
    secrets: [] as string[],
    keys: [] as string[],
    async deleteSecret(k: string) { h.secrets.push(k); },
    async clearStateKey(k: string) { h.keys.push(k); },
    log() { /* quiet in tests */ },
  };
  return h;
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'ava-reset-'));
  // A signed-in user: account data under users/<id>/, machine data at root.
  await mkdir(join(home, ACCOUNT, 'memory'), { recursive: true });
  await mkdir(join(home, ACCOUNT, 'history'), { recursive: true });
  await mkdir(join(home, 'projects', 'SacredCrossing'), { recursive: true });
  await mkdir(join(home, 'models'), { recursive: true });
  await writeFile(join(home, ACCOUNT, 'memory', 'graph.json'), '{"nodes":[]}');
  await writeFile(join(home, ACCOUNT, 'memory.json'), 'x'.repeat(100));
  await writeFile(join(home, ACCOUNT, 'history', 'chat-1.json'), 'y'.repeat(50));
  await writeFile(join(home, 'projects', 'SacredCrossing', 'main.rs'), 'fn main() {}');
  await writeFile(join(home, 'models', 'blob.bin'), 'z'.repeat(2048));
  await writeFile(join(home, 'audit-log.jsonl'), 'line\n');
  await writeFile(join(home, 'procedures.json'), '{}');
});

afterEach(async () => { await rm(home, { recursive: true, force: true }); });

describe('account data is found where it actually lives', () => {
  // The bug this file exists for. Account paths resolve against users/<id>/,
  // not the home root, or a signed-in user's reset deletes nothing of theirs.
  it('resolves account paths under the scoped dir', () => {
    const memory = resetCategories().find(c => c.id === 'memory')!;
    const paths = categoryPaths(memory, home, join(home, ACCOUNT));
    expect(paths).toContain(join(home, ACCOUNT, 'memory'));
    expect(paths).toContain(join(home, ACCOUNT, 'memory.json'));
    // ...while the learned layer is machine-wide and stays at the root.
    expect(paths).toContain(join(home, 'procedures.json'));
  });

  it('falls back to the home root when signed out', () => {
    const memory = resetCategories().find(c => c.id === 'memory')!;
    expect(categoryPaths(memory, home, null)).toContain(join(home, 'memory'));
  });

  // Found in the wild, 19 Oct 2026: a full wipe left ~/.ava/memory.json sitting
  // there with 199 entries because memory is an account path and only the
  // scoped copy was in scope. "Erase everything you know about me" has to mean
  // both copies, or someone resets and Ava still remembers them.
  it('sweeps account paths at BOTH roots when signed in', async () => {
    await writeFile(join(home, 'memory.json'), 'stale-but-live');
    await mkdir(join(home, 'memory'), { recursive: true });
    await writeFile(join(home, 'memory', 'graph.json'), '{"nodes":[1]}');

    const memory = resetCategories().find(c => c.id === 'memory')!;
    const paths = categoryPaths(memory, home, join(home, ACCOUNT));
    expect(paths).toContain(join(home, ACCOUNT, 'memory.json'));
    expect(paths).toContain(join(home, 'memory.json'));

    await executeReset(['memory'], host(), home, join(home, ACCOUNT));
    expect(await exists(join(home, ACCOUNT, 'memory.json'))).toBe(false);
    expect(await exists(join(home, 'memory.json'))).toBe(false);
    expect(await exists(join(home, 'memory'))).toBe(false);
  });

  it('does not list the same path twice when signed out', () => {
    const memory = resetCategories().find(c => c.id === 'memory')!;
    const paths = categoryPaths(memory, home, home);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('actually deletes the signed-in account’s memory', async () => {
    await executeReset(['memory'], host(), home, join(home, ACCOUNT));
    expect(await exists(join(home, ACCOUNT, 'memory'))).toBe(false);
    expect(await exists(join(home, ACCOUNT, 'memory.json'))).toBe(false);
  });
});

describe('the user’s source code', () => {
  // Rule 1. 19GB of real projects sat in this folder when the feature was
  // written; it is the only category whose loss cannot be re-earned.
  it('is never selected by default', () => {
    const projects = resetCategories().find(c => c.id === 'projects')!;
    expect(projects.defaultSelected).toBe(false);
    expect(projects.severity).toBe('irreversible');
  });

  it('survives a reset that did not ask for it', async () => {
    const everythingElse = resetCategories()
      .filter(c => c.id !== 'projects').map(c => c.id);
    await executeReset(everythingElse, host(), home, join(home, ACCOUNT));
    expect(await exists(join(home, 'projects', 'SacredCrossing', 'main.rs'))).toBe(true);
  });

  it('goes only when explicitly named', async () => {
    await executeReset(['projects'], host(), home, join(home, ACCOUNT));
    expect(await exists(join(home, 'projects'))).toBe(false);
  });

  it('is not what `project_data` means', async () => {
    // "What Ava knows about the projects" and "the projects" are different
    // categories on purpose. Conflating them is how a year of work goes.
    await executeReset(['project_data'], host(), home, join(home, ACCOUNT));
    expect(await exists(join(home, 'projects', 'SacredCrossing'))).toBe(true);
  });
});

describe('nothing escapes the Ava folder', () => {
  it('refuses a path outside the home, and the home itself', async () => {
    const h = host();
    // Point the home somewhere else so every real path is now "outside".
    const elsewhere = await mkdtemp(join(tmpdir(), 'ava-other-'));
    const report = await executeReset(['projects'], h, elsewhere, join(home, ACCOUNT));
    // Nothing under the real home was touched.
    expect(await exists(join(home, 'projects', 'SacredCrossing', 'main.rs'))).toBe(true);
    expect(report.removed.every(p => p.startsWith(elsewhere))).toBe(true);
    await rm(elsewhere, { recursive: true, force: true });
  });
});

describe('nothing can bring the data back', () => {
  // Rule 3. Ava is local only, but installs from the cloud-sync era still
  // carry the legacy sync preferences — a settings reset clears them.
  it('clears the legacy sync preferences key', async () => {
    const h = host();
    await executeReset(['settings'], h, home, join(home, ACCOUNT));
    expect(h.keys).toContain('ava.syncPrefs');
  });
});

describe('the report tells the truth', () => {
  it('counts secrets and settings, and keeps going past a missing path', async () => {
    const h = host();
    const report = await executeReset(['credentials', 'settings'], h, home, join(home, ACCOUNT));
    expect(report.secretsCleared).toBeGreaterThan(0);
    expect(report.stateKeysCleared).toBeGreaterThan(0);
    expect(h.secrets).toContain('ava-supernova.provider.deepseek.apiKey');
    expect(h.keys).toContain('ava.onboardedV1');
    expect(report.failed).toHaveLength(0);
  });

  it('reports freed bytes from what was really there', async () => {
    const report = await executeReset(['caches'], host(), home, join(home, ACCOUNT));
    expect(report.bytesFreed).toBeGreaterThanOrEqual(2048);
  });

  it('does nothing at all when nothing is selected', async () => {
    const h = host();
    const report = await executeReset([], h, home, join(home, ACCOUNT));
    expect(report.removed).toHaveLength(0);
    expect(h.keys).toHaveLength(0);
    expect(h.secrets).toHaveLength(0);
    expect(await exists(join(home, ACCOUNT, 'memory'))).toBe(true);
  });
});

describe('the dialog can show what each category costs', () => {
  it('sizes categories and marks the empty ones', async () => {
    const sizes = await scanCategories(home, join(home, ACCOUNT));
    const by = Object.fromEntries(sizes.map(s => [s.id, s]));
    expect(by.memory.bytes).toBeGreaterThan(100);
    expect(by.projects.bytes).toBeGreaterThan(0);
    expect(by.datasets.empty).toBe(true);        // never created in this fixture
    expect(by.credentials.empty).toBe(false);    // has keys, not bytes
  });

  it('formats sizes the way a person reads them', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(19 * 1024 ** 3)).toBe('19.0 GB');
  });
});
