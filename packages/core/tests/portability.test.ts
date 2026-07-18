import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  seal, open, isSealedEnvelope,
  gatherBundle, restoreBundle,
  exportEncryptedBackup, importEncryptedBackup,
} from '../src/portability/index.js';

async function seedAvaHome(dir: string) {
  await mkdir(join(dir, 'memory'), { recursive: true });
  await mkdir(join(dir, 'history'), { recursive: true });
  await mkdir(join(dir, 'journal'), { recursive: true });
  await mkdir(join(dir, 'tasks'), { recursive: true });
  await writeFile(join(dir, 'memory', 'graph.json'), JSON.stringify({ nodes: [{ id: 'n1', content: 'the operator is a 30-year programmer' }], edges: [] }));
  await writeFile(join(dir, 'history', 'conv-1.json'), JSON.stringify({ id: 'conv-1', messages: [{ role: 'user', content: 'hello' }] }));
  // tasks/tasks.json — a file INSIDE a directory. This test used to seed a
  // root-level `tasks.json`, the path the allowlist wrongly used and which has
  // never existed in a real ~/.ava. The bug (backups silently containing zero
  // tasks) is fixed in bundle.ts + data-types.ts; this seeds the real layout so
  // the test guards the fix instead of asserting the old broken shape.
  await writeFile(join(dir, 'tasks', 'tasks.json'), JSON.stringify({ version: 1, entries: [{ id: 't1', title: 'ship it' }] }));
  await writeFile(join(dir, 'journal', '2026-06-04.json'), JSON.stringify({ date: '2026-06-04' }));
  // A file NOT on the allowlist (operational) — must be excluded.
  await writeFile(join(dir, 'usage.json'), JSON.stringify({ credits: 300 }));
}

describe('portability crypto', () => {
  it('seals and opens a roundtrip', () => {
    const sealed = seal('the quick brown fox', 'correct horse battery staple');
    expect(isSealedEnvelope(sealed)).toBe(true);
    expect(open(sealed, 'correct horse battery staple')).toBe('the quick brown fox');
  });

  it('rejects the wrong passphrase', () => {
    const sealed = seal('secret', 'right-pass');
    expect(() => open(sealed, 'wrong-pass')).toThrow(/wrong passphrase|corrupted/i);
  });

  it('rejects a tampered envelope', () => {
    const env = JSON.parse(seal('secret', 'p'));
    // Flip a byte in the ciphertext.
    const ct = Buffer.from(env.ct, 'base64');
    ct[0] ^= 0xff;
    env.ct = ct.toString('base64');
    expect(() => open(JSON.stringify(env), 'p')).toThrow(/wrong passphrase|corrupted/i);
  });

  it('rejects non-envelope input', () => {
    expect(isSealedEnvelope('{"hi":1}')).toBe(false);
    expect(() => open('not json', 'p')).toThrow(/not a valid/i);
  });
});

describe('portability bundle', () => {
  let src: string;
  let dst: string;

  beforeEach(async () => {
    src = await mkdtemp(join(tmpdir(), 'ava-src-'));
    dst = await mkdtemp(join(tmpdir(), 'ava-dst-'));
    await seedAvaHome(src);
  });
  afterEach(async () => {
    await rm(src, { recursive: true, force: true });
    await rm(dst, { recursive: true, force: true });
  });

  it('gathers only allowlisted user data', async () => {
    const bundle = await gatherBundle(src, { source: 'test' });
    expect(bundle.files['memory/graph.json']).toContain('30-year programmer');
    expect(bundle.files['history/conv-1.json']).toContain('hello');
    expect(bundle.files['tasks/tasks.json']).toContain('ship it');
    expect(bundle.files['journal/2026-06-04.json']).toBeDefined();
    // Operational file excluded.
    expect(bundle.files['usage.json']).toBeUndefined();
  });

  it('round-trips through an encrypted backup', async () => {
    const envelope = await exportEncryptedBackup(src, 'pass-123', { source: 'test' });
    expect(isSealedEnvelope(envelope)).toBe(true);

    const { bundle, result } = await importEncryptedBackup(dst, envelope, 'pass-123');
    expect(bundle.source).toBe('test');
    expect(result.written).toBeGreaterThan(0);
    expect(result.rejected).toEqual([]);

    // Files landed identically on the fresh device.
    expect(await readFile(join(dst, 'memory', 'graph.json'), 'utf8'))
      .toBe(await readFile(join(src, 'memory', 'graph.json'), 'utf8'));
    expect(existsSync(join(dst, 'usage.json'))).toBe(false);
  });

  it('safe-merges by default and overwrites when asked', async () => {
    const envelope = await exportEncryptedBackup(src, 'p', { source: 'test' });
    // Pre-existing differing file on dst — same real path as the bundle uses.
    await mkdir(join(dst, 'tasks'), { recursive: true });
    await writeFile(join(dst, 'tasks', 'tasks.json'), JSON.stringify({ version: 1, entries: [{ id: 'keep' }] }));

    const merge = await importEncryptedBackup(dst, envelope, 'p');
    expect(merge.result.skipped).toBeGreaterThan(0);
    expect(await readFile(join(dst, 'tasks', 'tasks.json'), 'utf8')).toContain('keep');

    const over = await importEncryptedBackup(dst, envelope, 'p', { overwrite: true });
    expect(over.result.written).toBeGreaterThan(0);
    expect(await readFile(join(dst, 'tasks', 'tasks.json'), 'utf8')).toContain('ship it');
  });

  it('rejects path-traversal entries', async () => {
    const evil = {
      v: 1 as const,
      createdAt: new Date().toISOString(),
      source: 'evil',
      files: { '../escape.json': 'pwned', 'memory/ok.json': '{}' },
    };
    const result = await restoreBundle(dst, evil);
    expect(result.rejected).toContain('../escape.json');
    expect(existsSync(join(dst, 'memory', 'ok.json'))).toBe(true);
  });
});
