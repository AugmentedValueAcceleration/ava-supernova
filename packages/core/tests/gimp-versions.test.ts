/**
 * Several designs in one work: what happens to each is the person's choice.
 * Always a scratch folder (AVA_CREATIVE_DIR).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  chooseImageMain, deleteImageVersion, keepImageVersion, listImageVersions, listImageWork, readImageFinals, readImageMain,
} from '../src/tools/gimp/build-image.js';

let dir: string;
let work: string;
const SLUG = 'dawn-logo';
const design = (name: string) => {
  writeFileSync(join(work, `${name}.xcf`), `${name} layers`);
  writeFileSync(join(work, `${name}.png`), `${name} picture`);
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ava-versions-'));
  process.env.AVA_CREATIVE_DIR = dir;
  work = join(dir, 'gimp', SLUG);
  mkdirSync(work, { recursive: true });
  for (const n of ['Dawn-Light', 'Dawn-Void', 'compare-600', 'test-a']) design(n);
  writeFileSync(join(work, 'preview.png'), 'old sheet');
});
afterEach(async () => {
  delete process.env.AVA_CREATIVE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe('the designs in a work', () => {
  it('lists her designs, not her tests', async () => {
    expect(await listImageVersions(SLUG)).toEqual(['Dawn-Light', 'Dawn-Void']);
  });

  it('their main choice goes on the stage and is remembered', async () => {
    expect(await chooseImageMain(SLUG, 'Dawn-Void')).toBe(true);
    expect(await readImageMain(SLUG)).toBe('Dawn-Void');
    expect(readFileSync(join(work, 'preview.png'), 'utf-8')).toBe('Dawn-Void picture');
    expect((await listImageWork()).find((w) => w.slug === SLUG)?.main).toBe('Dawn-Void');
  });

  it('won\'t choose a design that isn\'t there, or a test', async () => {
    expect(await chooseImageMain(SLUG, 'Nope')).toBe(false);
    expect(await chooseImageMain(SLUG, 'compare-600')).toBe(false);
    expect(await chooseImageMain(SLUG, '../../secret')).toBe(false);
  });

  it('keeping one makes it its own work, ready for the Library, and leaves here', async () => {
    const kept = await keepImageVersion(SLUG, 'Dawn-Void');
    expect(kept).toBe('Dawn Void');
    const moved = join(dir, 'gimp', 'dawn-void');
    expect(readFileSync(join(moved, 'Dawn-Void.xcf'), 'utf-8')).toBe('Dawn-Void layers');
    expect(await readImageFinals('dawn-void')).toEqual(['Dawn-Void.png']);
    const library = JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf-8'));
    expect(library.map((i: { id: string }) => i.id)).toContain('gimp_dawn-void');
    expect(await listImageVersions(SLUG)).toEqual(['Dawn-Light']);
  });

  it('keeping twice never overwrites the first', async () => {
    await keepImageVersion(SLUG, 'Dawn-Void');
    design('Dawn-Void');
    expect(await keepImageVersion(SLUG, 'Dawn-Void')).toBe('Dawn Void 2');
    expect(existsSync(join(dir, 'gimp', 'dawn-void', 'Dawn-Void.xcf'))).toBe(true);
  });

  it('deleting removes that design only, and clears it as main', async () => {
    await chooseImageMain(SLUG, 'Dawn-Void');
    expect(await deleteImageVersion(SLUG, 'Dawn-Void')).toBe(true);
    expect(existsSync(join(work, 'Dawn-Void.xcf'))).toBe(false);
    expect(existsSync(join(work, 'Dawn-Light.xcf'))).toBe(true);
    expect(await readImageMain(SLUG)).toBeNull();
  });

  it('won\'t delete a path, only a design by name', async () => {
    expect(await deleteImageVersion(SLUG, '../dawn-logo/Dawn-Void')).toBe(false);
    expect(existsSync(join(work, 'Dawn-Void.xcf'))).toBe(true);
  });
});
