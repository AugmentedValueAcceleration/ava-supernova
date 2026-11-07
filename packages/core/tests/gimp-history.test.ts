/**
 * Going back. The steps, and what going back does to the files, without GIMP:
 * the real run is covered in gimp-build-image.test.ts. Always a scratch folder.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DesignRestoreImageTool, readImageHistory, recordImageStep, restoreImageStep } from '../src/tools/gimp/build-image.js';

let dir: string;
let work: string;
const SLUG = 'dawn-logo';
const step = async (art: string, label = '') => {
  writeFileSync(join(work, 'logo.xcf'), art);
  writeFileSync(join(work, 'preview.png'), `preview of ${art}`);
  return recordImageStep(SLUG, label);
};
const art = () => readFileSync(join(work, 'logo.xcf'), 'utf-8');

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ava-history-'));
  process.env.AVA_CREATIVE_DIR = dir;
  work = join(dir, 'gimp', SLUG);
  mkdirSync(work, { recursive: true });
});
afterEach(async () => {
  delete process.env.AVA_CREATIVE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe('steps', () => {
  it('saves each one with its picture, numbered in order', async () => {
    await step('first', 'Set the type');
    await step('second');
    const steps = await readImageHistory(SLUG);
    expect(steps.map((s) => [s.number, s.label])).toEqual([[1, 'Set the type'], [2, 'Step 2']]);
    expect(readFileSync(join(work, steps[0].preview!), 'utf-8')).toBe('preview of first');
  });

  it('has nothing to save before there is an image', async () => {
    expect(await recordImageStep(SLUG, 'empty')).toBeNull();
    expect(await readImageHistory(SLUG)).toEqual([]);
  });

  it('keeps the last 20, and numbers keep counting', async () => {
    for (let i = 1; i <= 23; i++) await step(`v${i}`);
    const steps = await readImageHistory(SLUG);
    expect(steps).toHaveLength(20);
    expect(steps[0].number).toBe(4);
    expect(steps.at(-1)!.number).toBe(23);
    expect(existsSync(join(work, 'history', '3'))).toBe(false);
    expect(existsSync(join(work, 'history', '4'))).toBe(true);
  });
});

describe('going back', () => {
  it('puts the image and preview back, and nothing later is lost', async () => {
    await step('first');
    await step('second');
    await step('third');
    expect((await restoreImageStep(SLUG, 1))?.number).toBe(1);
    expect(art()).toBe('first');
    expect(readFileSync(join(work, 'preview.png'), 'utf-8')).toBe('preview of first');
    const steps = await readImageHistory(SLUG);
    expect(steps.map((s) => s.number)).toEqual([1, 2, 3, 4]);
    expect(steps.at(-1)!.label).toBe('Back to step 1');
    await restoreImageStep(SLUG, 3);
    expect(art()).toBe('third');
  });

  it('removes an image made after that step', async () => {
    await step('first');
    writeFileSync(join(work, 'extra.xcf'), 'later');
    await step('second');
    await restoreImageStep(SLUG, 1);
    expect(existsSync(join(work, 'extra.xcf'))).toBe(false);
    await restoreImageStep(SLUG, 2);
    expect(existsSync(join(work, 'extra.xcf'))).toBe(true);
  });

  it('leaves finished files alone', async () => {
    writeFileSync(join(work, 'final.png'), 'the final');
    await step('first');
    await step('second');
    await restoreImageStep(SLUG, 1);
    expect(readFileSync(join(work, 'final.png'), 'utf-8')).toBe('the final');
  });

  it('refuses a step that was never made, and changes nothing', async () => {
    await step('first');
    expect(await restoreImageStep(SLUG, 9)).toBeNull();
    expect(await restoreImageStep(SLUG, Number('../..'))).toBeNull();
    expect(art()).toBe('first');
  });

  it('her tool says which steps exist when she asks for a wrong one', async () => {
    await step('first');
    const tool = new DesignRestoreImageTool();
    const wrong = await tool.execute({ name: 'Dawn Logo', step: 7 });
    expect(wrong.success).toBe(false);
    expect(wrong.output).toContain('Steps here: 1');
    await step('second');
    expect((await tool.execute({ name: 'Dawn Logo', step: 1 })).success).toBe(true);
    expect(art()).toBe('first');
  });
});
