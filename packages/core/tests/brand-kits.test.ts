/**
 * Brand kits in their one home. Always a scratch folder (AVA_BRAND_KITS_DIR),
 * never the real ~/.ava.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import {
  brandKitsFile, brandKitsForApps, brandLogoPath, createBrandKit, deleteBrandKit, importBrandKits, listBrandKits,
  agreeBrandKit, knownProjects, brandKitSummary, checkPairings, contrastRatio, kitForProject, kitForScripts, kitPieceStates, linkBrandKit, unlinkBrandKit,
  readBrandKit, saveBrandKit, setActiveBrandKit, setBrandLogoFromFile, updateBrandKit, type BrandKitRecord,
} from '../src/brand/brand-kits.js';
import {
  DesignBrandKitTool, DesignProposeKitTool, DesignExploreLogosTool, DesignGenerateIconTool, DesignGenerateLogoTool, DesignGenerateSetTool,
  DesignGenerateVideoTool, DesignGenerateVoiceTool, DesignGenerateImageTool,
} from '../src/tools/design-studio-tools.js';

const palette = { primary: '#111111', secondary: '#222222', accent: '#333333', neutral: '#444444', surface: '#555555' };
const old = (id: string, name: string, extra: Partial<BrandKitRecord> = {}): BrandKitRecord =>
  ({ id, name, palette, styleTags: [], createdAt: 1, updatedAt: 1, ...extra });
const SVG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>');

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ava-kits-'));
  process.env.AVA_BRAND_KITS_DIR = dir;
});
afterEach(async () => {
  delete process.env.AVA_BRAND_KITS_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe('moving kits across', () => {
  it('brings in what an app holds, once, and keeps its active kit', async () => {
    expect(await importBrandKits([old('a', 'One'), old('b', 'Two')], 'b')).toBe(2);
    expect((await listBrandKits()).activeId).toBe('b');
    expect(await importBrandKits([old('a', 'One changed')], 'a')).toBe(0);
    expect((await readBrandKit('a'))?.name).toBe('One');
    expect((await listBrandKits()).activeId).toBe('b');
  });

  it('adds kits from a second app without touching the first', async () => {
    await importBrandKits([old('a', 'Extension')], 'a');
    expect(await importBrandKits([old('b', 'IDE'), old('c', 'Extension')], 'b')).toBe(2);
    const { kits, activeId } = await listBrandKits();
    expect(kits.map((k) => k.id)).toEqual(['a', 'b', 'c']);
    expect(activeId).toBe('a');
  });

  it('a deleted kit cannot return from an old copy', async () => {
    await importBrandKits([old('a', 'One'), old('b', 'Two')], 'a');
    await deleteBrandKit('a');
    expect(await importBrandKits([old('a', 'One')], 'a')).toBe(0);
    expect((await listBrandKits()).kits.map((k) => k.id)).toEqual(['b']);
    expect((await listBrandKits()).activeId).toBe('b');
  });

  it('turns logo data URLs into real files, and gives the apps something to show', async () => {
    const png = 'data:image/png;base64,' + Buffer.from('fake').toString('base64');
    await importBrandKits([old('a', 'One', { logo: { primary: SVG, mark: png, dark: 'https://example.com/x.png' } })], 'a');
    const kit = (await readBrandKit('a'))!;
    expect(kit.logo).toEqual({ primary: 'logos/primary.svg', mark: 'logos/mark.png', dark: 'https://example.com/x.png' });
    expect(await readFile(brandLogoPath(kit, 'primary')!, 'utf-8')).toContain('<svg');
    const shown = (await brandKitsForApps()).kits[0];
    expect(shown.logo?.primary).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(shown.logo?.mark).toBe(png);
    expect(shown.logo?.dark).toBe('https://example.com/x.png');
  });

  it('refuses to overwrite a damaged file', async () => {
    await writeFile(brandKitsFile(), '{ not json', 'utf-8');
    await expect(importBrandKits([old('a', 'One')], 'a')).rejects.toThrow();
    expect(await readFile(brandKitsFile(), 'utf-8')).toBe('{ not json');
  });
});

describe('changing kits', () => {
  it('a new kit does not switch the one in use; the first one is active', async () => {
    const first = await createBrandKit({ name: 'First' });
    const second = await createBrandKit({ name: 'Second', tagline: 'Hello' });
    expect((await listBrandKits()).activeId).toBe(first.id);
    expect(second.tagline).toBe('Hello');
    await setActiveBrandKit(second.id);
    expect((await readBrandKit())?.id).toBe(second.id);
  });

  it('an update changes only what was passed', async () => {
    const kit = await createBrandKit({ name: 'Kit', tagline: 'Keep', palette: { primary: '#000000' } });
    const next = await updateBrandKit(kit.id, { palette: { accent: '#ffffff' } });
    expect(next?.tagline).toBe('Keep');
    expect(next?.palette.primary).toBe('#000000');
    expect(next?.palette.accent).toBe('#ffffff');
  });

  it('changes at the same moment are all kept', async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => createBrandKit({ name: `Kit ${i}` })));
    expect((await listBrandKits()).kits).toHaveLength(12);
  });

  it('an app save keeps its own timestamp, so its echo is recognised', async () => {
    await saveBrandKit(old('a', 'One', { updatedAt: 42, logo: { primary: SVG } }));
    const kit = (await readBrandKit('a'))!;
    expect(kit.updatedAt).toBe(42);
    expect(kit.logo?.primary).toBe('logos/primary.svg');
  });

  it('a logo from the Library is a copy, and replaces the old one whatever its type', async () => {
    await saveBrandKit(old('a', 'One', { logo: { primary: SVG } }));
    const source = join(dir, 'from-library.png');
    await writeFile(source, 'picture', 'utf-8');
    const kit = (await setBrandLogoFromFile('a', 'primary', source))!;
    expect(kit.logo?.primary).toBe('logos/primary.png');
    await rm(source);
    expect(await readFile(brandLogoPath(kit, 'primary')!, 'utf-8')).toBe('picture');
    expect(existsSync(join(dir, 'brand-kits', 'a', 'logos', 'primary.svg'))).toBe(false);
  });

  it('a logo must be a picture, for a real kit', async () => {
    await saveBrandKit(old('a', 'One'));
    const notPicture = join(dir, 'notes.txt');
    await writeFile(notPicture, 'x', 'utf-8');
    expect(await setBrandLogoFromFile('a', 'primary', notPicture)).toBeNull();
    expect(await setBrandLogoFromFile('a', 'primary', join(dir, 'missing.png'))).toBeNull();
    expect(await setBrandLogoFromFile('nope', 'primary', notPicture)).toBeNull();
  });

  it('deleting a kit removes its files', async () => {
    await saveBrandKit(old('a', 'One', { logo: { primary: SVG } }));
    const path = brandLogoPath((await readBrandKit('a'))!, 'primary')!;
    expect(existsSync(path)).toBe(true);
    await deleteBrandKit('a');
    expect(existsSync(path)).toBe(false);
  });
});

describe('a kit belongs to its project', () => {
  const A = join(tmpdir(), 'Game One');
  const B = join(tmpdir(), 'Game Two');

  it('in a project, only its own kit is used, never the active one', async () => {
    const dawn = await createBrandKit({ name: 'Dawn', palette: { primary: '#0000ff' } });
    await createBrandKit({ name: 'Coffee', palette: { primary: '#884400' } });
    expect((await kitForProject(A)).status).toBe('unlinked');
    expect((await kitForProject(null)).kit?.id).toBe(dawn.id);
    const text = brandKitSummary(await kitForProject(A));
    expect(text).toContain('No brand kit is linked');
    expect(text).toContain('never use one by default');
    expect(text).not.toContain('#0000ff');
    expect(await kitForScripts(A)).toBeNull();
  });

  it('linking makes it the kit in use, and one kit can serve several projects', async () => {
    const a = await createBrandKit({ name: 'First' });
    const b = await createBrandKit({ name: 'Studio', tagline: 'Hi' });
    await linkBrandKit(b.id, A);
    await linkBrandKit(b.id, B);
    expect((await kitForProject(A)).kit?.id).toBe(b.id);
    expect((await kitForProject(B)).kit?.id).toBe(b.id);
    expect((await brandKitsForApps(A)).activeId).toBe(b.id);
    expect((await brandKitsForApps(null)).activeId).toBe(a.id);
  });

  it('a project has one kit: linking another takes over', async () => {
    const a = await createBrandKit({ name: 'One' });
    const b = await createBrandKit({ name: 'Two' });
    await linkBrandKit(a.id, A);
    await linkBrandKit(b.id, A);
    expect((await kitForProject(A)).kit?.id).toBe(b.id);
    expect((await readBrandKit(a.id))?.projects).toEqual([]);
    await unlinkBrandKit(b.id, A);
    expect((await kitForProject(A)).status).toBe('unlinked');
  });

  it('finds the project whatever the path looks like', async () => {
    const a = await createBrandKit({ name: 'One' });
    await linkBrandKit(a.id, A);
    expect((await kitForProject(A + sep)).kit?.id).toBe(a.id);
    if (process.platform === 'win32') expect((await kitForProject(A.toUpperCase())).kit?.id).toBe(a.id);
  });

  it('Ava hears the kit in words, with what scripts can reach', async () => {
    await saveBrandKit(old('a', 'Dawn', { projects: [A], positioning: 'A game', styleTags: ['cold'], voice: 'Calm', dontRules: ['No hype'], logo: { mark: SVG } }));
    const text = brandKitSummary(await kitForProject(A));
    for (const want of ['"Dawn", linked to this project', 'What it is: A game', 'primary #111111', 'Style: cold', 'Logos: mark', 'Voice: Calm', 'Never: No hype', 'KIT.colour']) {
      expect(text).toContain(want);
    }
    const scripts = (await kitForScripts(A))!;
    expect(scripts.palette.primary).toBe('#111111');
    expect(existsSync(scripts.logos.mark)).toBe(true);
  });

  it('her tool works on the kit in use, and links on request', async () => {
    const tool = new DesignBrandKitTool();
    const ctx = { cwd: '.', sharedState: { designProject: () => A } };
    const kit = await createBrandKit({ name: 'Dawn' });
    expect((await tool.execute({ action: 'read' }, ctx)).output).toContain('No brand kit is linked');
    expect((await tool.execute({ action: 'link_project', kit_id: kit.id }, ctx)).output).toContain('Linked');
    expect((await tool.execute({ action: 'read' }, ctx)).output).toContain('"Dawn"');
    await tool.execute({ action: 'update', voice: 'Calm' }, ctx);
    expect((await readBrandKit(kit.id))?.voice).toBe('Calm');
    expect((await tool.execute({ action: 'link_project', kit_id: kit.id }, { cwd: '.' })).success).toBe(false);
  });
});

describe('a kit shaped by what the project is', () => {
  it('asks for the pieces its kind needs, plus what every kit has', async () => {
    const game = await createBrandKit({ name: 'Game', kind: 'game' });
    const labels = kitPieceStates(game).map((p) => p.id);
    expect(labels).toContain('title_logo');
    expect(labels).toContain('colours');
    expect(labels).not.toContain('app_icon');
    expect(kitPieceStates(game).every((p) => p.state === 'not_made')).toBe(true);
    expect(kitPieceStates(await createBrandKit({ name: 'App', kind: 'app' })).map((p) => p.id)).toContain('app_icon');
    expect(kitPieceStates(await createBrandKit({ name: 'Old' })).map((p) => p.id)).toEqual(['colours', 'fonts', 'image_style', 'visual_rules', 'voice']);
  });

  it('a kit with no kind is asked about, not guessed', async () => {
    const kit = await createBrandKit({ name: 'Old' });
    expect(brandKitSummary({ status: 'active', kit })).toContain('Never guess');
    expect(brandKitSummary({ status: 'active', kit: { ...kit, kind: 'game' } })).toContain('Title logo (not made)');
  });

  it('works out contrast, by role or hex', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    const kit = old('a', 'One', { palette: { ...palette, primary: '#ffffff', surface: '#000000' }, pairings: [
      { ink: 'primary', on: 'surface' }, { ink: '#777777', on: '#ffffff' }, { ink: '#999999', on: '#ffffff' }, { ink: '#aaaaaa', on: '#bbbbbb' }, { ink: 'nope', on: 'surface' },
    ] });
    expect(checkPairings(kit).map((p) => p.verdict)).toEqual(['fine', 'large only', 'too low', 'too low', 'unknown']);
    expect(brandKitSummary({ status: 'active', kit })).toContain('primary on surface — 21:1, fine');
  });

  it('her tool moves pieces on, and refuses what the kit does not have', async () => {
    const tool = new DesignBrandKitTool();
    const kit = await createBrandKit({ name: 'Game', kind: 'game' });
    const run = (a: Record<string, unknown>) => tool.execute({ kit_id: kit.id, ...a }, { cwd: '.' });
    expect((await run({ action: 'set_piece', piece: 'title_logo', state: 'in_progress' })).output).toContain('in progress');
    expect(kitPieceStates((await readBrandKit(kit.id))!).find((p) => p.id === 'title_logo')?.state).toBe('in_progress');
    expect((await run({ action: 'set_piece', piece: 'app_icon', state: 'agreed' })).output).toContain('no piece');
    expect((await run({ action: 'set_piece', piece: 'title_logo', state: 'done' })).success).toBe(false);
    expect((await run({ action: 'update', kind: 'film' })).success).toBe(false);
    const weak = await run({ action: 'update', pairings: [{ ink: '#aaaaaa', on: '#bbbbbb' }] });
    expect(weak.output).toContain('Too low to read');
    expect((await run({ action: 'read' })).output).toContain('Pieces:');
  });

  it('what she can reach in scripts', async () => {
    await saveBrandKit(old('a', 'One', { projects: ['/tmp/x'], fonts: { heading: 'Space Grotesk' } }));
    expect((await kitForScripts('/tmp/x'))?.fonts.heading).toBe('Space Grotesk');
  });
});

describe('a kit made with Ava', () => {
  const propose = new DesignProposeKitTool();
  const args = { name: 'Dawn', kind: 'game', palette: { primary: '#3D52D8' }, reasoning: 'Because', pairings: [{ ink: 'primary', on: 'surface' }], fonts: { heading: 'Space Grotesk' }, voice: 'Calm' };
  const project = join(tmpdir(), 'Dawn Project');
  const known = async () => writeFile(join(dir, 'projects.json'), JSON.stringify([{ path: project, name: 'Dawn Project', lastUsed: '2026-11-04' }]), 'utf-8');

  it('a proposal is used nowhere until they agree it', async () => {
    await known();
    const res = await propose.execute({ ...args, project });
    expect(res.success, res.output).toBe(true);
    const id = res.metadata?.kit_id as string;
    expect((await readBrandKit(id))?.status).toBe('proposed');
    expect((await kitForProject(project)).status).toBe('unlinked');
    expect((await kitForProject(null)).status).toBe('none');
    expect(await kitForScripts(project)).toBeNull();

    const agreed = (await agreeBrandKit(id))!;
    expect(agreed.status).toBeUndefined();
    expect((await kitForProject(project)).kit?.id).toBe(id);
    expect((await listBrandKits()).activeId).toBe(id);
    expect(agreed.pieces?.colours?.state).toBe('agreed');
    expect(agreed.pieces?.fonts?.state).toBe('agreed');
    expect(agreed.pieces?.voice?.state).toBe('agreed');
    expect(agreed.pieces?.image_style).toBeUndefined();
    expect(await agreeBrandKit(id)).toBeNull();
  });

  it('she can revise her proposal, but not an agreed kit', async () => {
    const res = await propose.execute(args);
    const id = res.metadata?.kit_id as string;
    await propose.execute({ ...args, kit_id: id, name: 'Dawn Two' });
    expect((await listBrandKits()).kits).toHaveLength(1);
    expect((await readBrandKit(id))?.name).toBe('Dawn Two');
    await agreeBrandKit(id);
    expect((await propose.execute({ ...args, kit_id: id })).output).toContain('agreed');
  });

  it('needs reasoning, a real kind, and one of their projects', async () => {
    expect((await propose.execute({ ...args, reasoning: '' })).success).toBe(false);
    expect((await propose.execute({ ...args, kind: 'film' })).success).toBe(false);
    expect((await propose.execute({ ...args, project: '/somewhere/else' })).output).toContain('not one of their projects');
  });

  it('warns her about a pairing that can not be read', async () => {
    const res = await propose.execute({ ...args, pairings: [{ ink: '#aaaaaa', on: '#bbbbbb' }] });
    expect(res.output).toContain('Fix before they see it');
  });

  it('reads only projects they have opened', async () => {
    await known();
    const tool = new DesignBrandKitTool();
    expect((await tool.execute({ action: 'read_project', project: '/somewhere/else' }, { cwd: '.' })).output).toContain('not one of their projects');
    expect((await tool.execute({ action: 'read_project', project }, { cwd: '.' })).output).toContain('no Decisions folder');
  });

  it('lists projects newest first, once each, with the open one on top', async () => {
    await writeFile(join(dir, 'projects.json'), JSON.stringify([
      { path: 'C:/old', name: 'old', lastUsed: '2026-01-01' }, { path: 'C:/new', name: 'new', lastUsed: '2026-06-01' }, { path: 'c:/NEW', name: 'new', lastUsed: '2026-02-01' },
    ]), 'utf-8');
    const names = (await knownProjects(join(tmpdir(), 'Open'))).map((p) => p.name);
    expect(names[0]).toBe('Open');
    expect(names).toContain('new');
    expect(names.indexOf('new')).toBeLessThan(names.indexOf('old'));
  });
});

describe('design_brand_kit with no studio open', () => {
  const tool = new DesignBrandKitTool();
  const run = (args: Record<string, unknown>) => tool.execute(args, { cwd: '.' });

  it('lists, creates, updates, switches and deletes', async () => {
    expect((await run({ action: 'list' })).output).toContain('No brand kits yet');
    const made = await run({ action: 'create', name: 'DawnSets', palette: { primary: '#3D52D8' } });
    expect(made.output).toContain('Created');
    expect(made.output).toContain('#3D52D8');
    const other = await createBrandKit({ name: 'Other' });
    await run({ action: 'set_active', kit_id: other.id });
    expect((await run({ action: 'list' })).output).toContain('Other (active)');
    expect((await run({ action: 'update', voice: 'Calm' })).output).toContain('voice set');
    expect((await run({ action: 'delete', kit_id: other.id })).output).toContain('Deleted');
    expect((await run({ action: 'list' })).output).toContain('DawnSets');
  });

  it('delete and switch need a kit named', async () => {
    expect((await run({ action: 'delete' })).success).toBe(false);
    expect((await run({ action: 'set_active' })).success).toBe(false);
  });

  it('assigning the canvas still needs the canvas', async () => {
    expect((await run({ action: 'set_logo' })).success).toBe(false);
  });
});

describe('the GIMP and Blender rooms make things by hand', () => {
  const inRoom = (room: string, control: () => Promise<unknown>) => ({ cwd: '.', sharedState: { designRoom: () => room, designControl: control } });
  const makers: Array<[string, { execute(a: Record<string, unknown>, c: never): Promise<{ success: boolean; output: string }> }]> = [
    ['icon', new DesignGenerateIconTool() as never], ['set', new DesignGenerateSetTool() as never],
    ['video', new DesignGenerateVideoTool() as never], ['voice', new DesignGenerateVoiceTool() as never],
    ['logo', new DesignGenerateLogoTool() as never], ['explore', new DesignExploreLogosTool() as never],
  ];

  it.each(makers)('%s refuses in both, and never reaches the canvas', async (_name, tool) => {
    let reached = false;
    const control = async () => { reached = true; return { ok: true }; };
    const gimp = await tool.execute({ prompt: 'x', direction: 'x', brand_name: 'x' }, inRoom('gimp', control) as never);
    expect(gimp.success).toBe(false);
    expect(gimp.output).toContain('made in GIMP');
    const blender = await tool.execute({ prompt: 'x', direction: 'x', brand_name: 'x' }, inRoom('model', control) as never);
    expect(blender.output).toContain('made in Blender');
    expect(reached).toBe(false);
  });

  it('they still work in their own rooms', async () => {
    let reached = false;
    const control = async () => { reached = true; return { ok: true, data: {} }; };
    await new DesignGenerateLogoTool().execute({ direction: 'x', brand_name: 'x' }, inRoom('logo', control) as never);
    expect(reached).toBe(true);
  });

  it('generating an image stays available as the aid', async () => {
    let reached = false;
    const control = async () => { reached = true; return { ok: true, data: {} }; };
    await new DesignGenerateImageTool().execute({ prompt: 'a texture' }, inRoom('gimp', control) as never);
    expect(reached).toBe(true);
  });
});
