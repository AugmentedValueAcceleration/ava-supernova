/**
 * Setting a kit's pieces by hand. Always scratch folders, never the real ~/.ava.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  addPieceFromLibrary, addPieceUpload, brandKitSummary, brandLogoPath, createBrandKit, kitForProject, readBrandKit, removePieceFile,
  saveBrandKit, setBrandLogoFromFile,
} from '../src/brand/brand-kits.js';

const PNG = `data:image/png;base64,${Buffer.from('a picture').toString('base64')}`;
let dir: string;
let lib: string;
let kitId: string;
const inLibrary = (name: string) => { const p = join(lib, name); writeFileSync(p, 'library picture'); return p; };
const piece = async (id: string) => (await readBrandKit(kitId))?.pieces?.[id];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ava-pieces-'));
  process.env.AVA_BRAND_KITS_DIR = join(dir, 'kits');
  process.env.AVA_CREATIVE_DIR = join(dir, 'creative');
  lib = join(dir, 'creative', 'gimp', 'work');
  mkdirSync(lib, { recursive: true });
  kitId = (await createBrandKit({ name: 'Dawn', kind: 'game' })).id;
});
afterEach(async () => {
  delete process.env.AVA_BRAND_KITS_DIR;
  delete process.env.AVA_CREATIVE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe('pictures', () => {
  it('a Library picture is copied in and the piece is agreed', async () => {
    const source = inLibrary('splash.png');
    expect(await addPieceFromLibrary(kitId, 'splash', source)).toBeTruthy();
    expect(await piece('splash')).toMatchObject({ state: 'agreed', files: ['pieces/splash/splash.png'] });
    expect(existsSync(source)).toBe(true);
  });

  it('two pictures with one name both stay', async () => {
    await addPieceFromLibrary(kitId, 'splash', inLibrary('splash.png'));
    await addPieceFromLibrary(kitId, 'splash', inLibrary('splash.png'));
    expect((await piece('splash'))?.files).toEqual(['pieces/splash/splash.png', 'pieces/splash/splash-2.png']);
  });

  it('an upload lands in the piece and leaves nothing behind', async () => {
    await addPieceUpload(kitId, 'splash', 'My Art.png', PNG);
    expect((await piece('splash'))?.files).toEqual(['pieces/splash/My Art.png']);
    expect(readdirSync(join(dir, 'kits', 'brand-kits', kitId)).filter((n) => n.startsWith('incoming'))).toEqual([]);
  });

  it('a name can\'t climb out of the kit', async () => {
    await addPieceUpload(kitId, 'splash', '../../evil.png', PNG);
    expect((await piece('splash'))?.files).toEqual(['pieces/splash/evil.png']);
  });

  it('refuses what isn\'t a picture, a file outside the Library, or a piece the kit doesn\'t have', async () => {
    expect(await addPieceUpload(kitId, 'splash', 'x.txt', 'data:text/plain,hello')).toBeNull();
    const outside = join(dir, 'outside.png');
    writeFileSync(outside, 'x');
    expect(await addPieceFromLibrary(kitId, 'splash', outside)).toBeNull();
    expect(await addPieceFromLibrary(kitId, 'favicon', inLibrary('a.png'))).toBeNull();
  });

  it('a kit still waiting to be agreed can\'t be set', async () => {
    const kit = await readBrandKit(kitId);
    await saveBrandKit({ ...kit!, status: 'proposed' });
    expect(await addPieceFromLibrary(kitId, 'splash', inLibrary('a.png'))).toBeNull();
  });

  it('removing the last picture puts the piece back to not made', async () => {
    await addPieceFromLibrary(kitId, 'splash', inLibrary('a.png'));
    await addPieceFromLibrary(kitId, 'splash', inLibrary('b.png'));
    await removePieceFile(kitId, 'splash', 'pieces/splash/a.png');
    expect(await piece('splash')).toMatchObject({ state: 'agreed', files: ['pieces/splash/b.png'] });
    await removePieceFile(kitId, 'splash', 'pieces/splash/b.png');
    expect(await piece('splash')).toMatchObject({ state: 'not_made', files: [] });
  });

  it('won\'t remove a file the piece doesn\'t hold', async () => {
    expect(await removePieceFile(kitId, 'splash', '../../brand-kits.json')).toBeNull();
  });
});

describe('a logo piece holds one logo', () => {
  it('choosing another replaces it, and it is the kit\'s logo', async () => {
    await addPieceFromLibrary(kitId, 'title_logo', inLibrary('wrong.png'));
    await addPieceFromLibrary(kitId, 'title_logo', inLibrary('right.png'));
    expect((await piece('title_logo'))?.files).toEqual(['pieces/title_logo/right.png']);
    const kit = await readBrandKit(kitId);
    expect(kit?.logo?.primary).toBe('logos/primary.png');
  });

  it('removing it clears the logo too', async () => {
    await addPieceFromLibrary(kitId, 'title_logo', inLibrary('logo.png'));
    await removePieceFile(kitId, 'title_logo');
    const kit = await readBrandKit(kitId);
    expect(kit?.logo?.primary).toBeUndefined();
    expect(brandLogoPath(kit!, 'primary')).toBeNull();
    expect(await piece('title_logo')).toMatchObject({ state: 'not_made', files: [] });
  });

  it('a logo set from Edit counts for its piece', async () => {
    await setBrandLogoFromFile(kitId, 'primary', inLibrary('logo.png'));
    expect((await piece('title_logo'))?.state).toBe('agreed');
  });
});

describe('Ava reads what they set', () => {
  it('sees their notes and where their pictures are', async () => {
    const kit = await readBrandKit(kitId);
    await saveBrandKit({ ...kit!, projects: ['C:/game'], pieces: { hud_colours: { state: 'agreed', note: 'Amber for health, teal for shields' } } });
    await addPieceFromLibrary(kitId, 'world_references', inLibrary('world.png'));
    const said = brandKitSummary(await kitForProject('C:/game'));
    expect(said).toContain('Notes on HUD colours: Amber for health, teal for shields');
    expect(said).toMatch(/Character and world references files: .*world\.png/);
  });
});
