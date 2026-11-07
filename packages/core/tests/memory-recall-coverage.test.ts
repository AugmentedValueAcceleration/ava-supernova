/**
 * A short search against a long note. Similarity scores that about 0.05 even when
 * the note is the right one, so multi-word searches used to find nothing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryManager } from '../src/memory/memory-manager.js';
import { TfIdfIndex } from '../src/memory/tfidf.js';

const filler = Array.from({ length: 120 }, (_, i) => `detail${i} measured carefully`).join(' ');
const LONG = `The title screen uses a dawn palette of amber and teal over void black. ${filler}`;

let dir: string;
let memory: MemoryManager;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ava-recall-'));
  memory = new MemoryManager({ globalDir: join(dir, 'home'), projectRoot: join(dir, 'project') });
  await memory.saveEntry({ scope: 'project', category: 'decision', content: LONG });
  await memory.saveEntry({ scope: 'project', category: 'decision', content: 'Props are built in headless Blender and baked in Cycles.' });
  await memory.saveEntry({ scope: 'project', category: 'decision', content: 'Combat is resolved on the server every tick.' });
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const find = (query: string) => memory.recall({ query, scope: 'project' });

describe('finding a long note with a short search', () => {
  it('a long note scores too low on similarity alone, which is why this exists', () => {
    const index = new TfIdfIndex();
    index.addDocument('long', LONG);
    index.addDocument('other', 'Combat is resolved on the server every tick.');
    expect(index.search('title palette amber')[0].score).toBeLessThan(0.25);
  });

  it('finds it, though the words are not side by side', async () => {
    const found = await find('title palette amber');
    expect(found.map((r) => r.entry.content)).toContain(LONG);
  });

  it('lets a search carry words no note has', async () => {
    expect((await find('title palette amber'))[0].entry.content).toBe(LONG);
    expect((await find('amber palette brochure')).map((r) => r.entry.content)).toContain(LONG);
  });

  it('finds nothing for words that aren\'t there', async () => {
    expect(await find('quantum banana elephant')).toEqual([]);
  });

  it('one shared word is not enough', async () => {
    expect(await find('amber quantum banana elephant')).toEqual([]);
  });

  it('never counts a note twice', async () => {
    const found = await find('headless Blender props');
    expect(found.filter((r) => r.entry.content.includes('Cycles'))).toHaveLength(1);
  });

  it('leaves archived notes out unless they are asked for', async () => {
    const [{ entry }] = await find('title palette amber');
    await memory.archiveEntry('project', entry.id);
    expect(await find('title palette amber')).toEqual([]);
    expect(await memory.recall({ query: 'title palette amber', scope: 'project', includeArchived: true })).toHaveLength(1);
  });
});
