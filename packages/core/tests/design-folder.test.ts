/**
 * design_folder (Phase 3): Ava sees a pack before she proposes the next piece,
 * files work into a folder when asked, and keeps the folder's style note —
 * theirs. Always in a scratch folder (AVA_CREATIVE_DIR).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PNG } from 'pngjs';
import { DesignFolderTool } from '../src/tools/design-folder.js';
import { createFolder, addToFolder, readFolders, setFolderNote, findFolder, folderPath } from '../src/creative/library-folders.js';

let scratch: string;
const creative = () => process.env.AVA_CREATIVE_DIR!;
const tool = new DesignFolderTool();
const run = (args: Record<string, unknown>) => tool.execute(args);
const ok = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => { if (!r.ok) throw new Error(r.error); return r.value; };

/** A real PNG, big enough to be shrunk for looking at. */
function png(size: number): Buffer {
  const p = new PNG({ width: size, height: size });
  p.data.fill(200);
  return PNG.sync.write(p);
}

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'ava-dfolder-'));
  process.env.AVA_CREATIVE_DIR = join(scratch, 'creative');
  const gimp = join(creative(), 'gimp', 'stat-icons');
  await mkdir(join(gimp, 'final'), { recursive: true });
  await writeFile(join(gimp, 'final', 'heart.png'), png(1024));
  await writeFile(join(gimp, 'finals.json'), JSON.stringify(['final/heart.png']));
  await writeFile(join(gimp, 'brief.json'), JSON.stringify({ name: 'Stat Icons', style: 'flat, two colours, 2px outline', status: 'agreed' }));
  await mkdir(join(creative(), 'images'), { recursive: true });
  await writeFile(join(creative(), 'images', 'sword.webp'), Buffer.from('RIFF0000WEBPVP8 ', 'latin1'));
  await writeFile(join(creative(), 'metadata.json'), JSON.stringify([
    { id: 'gimp_stat-icons', kind: 'gimp', title: 'Stat Icons', absoluteFolder: gimp },
    { id: 'image_9', kind: 'image', title: 'Sword', absolutePath: join(creative(), 'images', 'sword.webp'), origin: 'generated', aiModel: 'qwen-image-2.0' },
  ]));
});
afterAll(async () => {
  delete process.env.AVA_CREATIVE_DIR;
  await rm(scratch, { recursive: true, force: true }).catch(() => {});
});

describe('finding folders by what people call them', () => {
  it('by name, by path, and not when two share a name', async () => {
    const pack = ok(await createFolder('Fantasy UI Pack'));
    ok(await createFolder('Icons', pack.id));
    ok(await createFolder('Icons'));
    const all = await readFolders();
    expect(findFolder(all, 'fantasy ui pack')?.id).toBe(pack.id);
    expect(folderPath(all, findFolder(all, 'Fantasy UI Pack / icons')!)).toBe('Fantasy UI Pack / Icons');
    // The exact path wins: "Icons" is the top-level one.
    expect(findFolder(all, 'Icons')?.parentId).toBeNull();
    // Two folders of the same name inside different packs, none at the top: ask, don't guess.
    const other = ok(await createFolder('Other Pack'));
    ok(await createFolder('Props', pack.id));
    ok(await createFolder('Props', other.id));
    expect(findFolder(await readFolders(), 'Props')).toBeNull();
    expect(findFolder(await readFolders(), 'Other Pack / Props')?.parentId).toBe(other.id);
  });

  it('a style note is one line, theirs, and can be cleared', async () => {
    const f = findFolder(await readFolders(), 'Fantasy UI Pack')!;
    expect(ok(await setFolderNote(f.id, '  flat,\n two colours  ')).note).toBe('flat, two colours');
    expect((await setFolderNote(f.id, 'x'.repeat(401))).ok).toBe(false);
    expect(ok(await setFolderNote(f.id, '')).note).toBeUndefined();
  });
});

describe('design_folder', () => {
  it('file: only work that exists, into a folder that exists, unless they asked for a new one', async () => {
    expect((await run({ action: 'file', work: 'Not Made Yet', tool: 'gimp', folder: 'Fantasy UI Pack' })).output).toContain("isn't in the Library yet");
    expect((await run({ action: 'file', work: 'Stat Icons', tool: 'gimp', folder: 'Nope' })).success).toBe(false);
    expect((await run({ action: 'file', work: 'Stat Icons', tool: 'gimp', folder: 'Fantasy UI Pack' })).success).toBe(true);
    expect((await run({ action: 'file', work: 'Stat Icons', tool: 'gimp', folder: 'Weapons', create: true })).success).toBe(true);
    const all = await readFolders();
    expect(findFolder(all, 'Weapons')!.members.map((m) => m.ref)).toEqual(['creative:gimp_stat-icons']);
  });

  it('list: every folder with its note and size', async () => {
    const f = findFolder(await readFolders(), 'Fantasy UI Pack')!;
    ok(await setFolderNote(f.id, 'flat, two colours, 2px dark outline'));
    const out = (await run({ action: 'list' })).output;
    expect(out).toContain('Fantasy UI Pack: 1 piece · style note: "flat, two colours, 2px dark outline"');
    expect(out).toContain('Fantasy UI Pack / Icons: 0 pieces · no style note');
    expect(out).toContain('Other Pack / Props: 0 pieces');
  });

  it('look: how each piece was made, the note, and the finished pictures themselves — each labelled with its own type', async () => {
    const f = findFolder(await readFolders(), 'Fantasy UI Pack')!;
    ok(await addToFolder(f.id, [{ ref: 'creative:image_9' }]));
    const res = await run({ action: 'look', folder: 'Fantasy UI Pack' });
    expect(res.success).toBe(true);
    expect(res.output).toContain('Style note (theirs): "flat, two colours, 2px dark outline"');
    expect(res.output).toContain('Stat Icons — GIMP work, finished: final/heart.png · style: flat, two colours, 2px outline');
    expect(res.output).toContain('Sword — image, generated with qwen-image-2.0');
    expect(res.metadata?.mime_type).toBe('image/png');
    expect(res.metadata?.more_mime_types).toEqual(['image/webp']);
    // The 1024px final is shrunk to what a look needs.
    const shown = PNG.sync.read(Buffer.from(String(res.metadata?.base64_image), 'base64'));
    expect(Math.max(shown.width, shown.height)).toBe(512);
  });

  it('set_note saves what they agreed; an unknown folder says which exist', async () => {
    expect((await run({ action: 'set_note', folder: 'Weapons', note: 'worn steel, painterly' })).output).toContain('"worn steel, painterly"');
    const res = await run({ action: 'look', folder: 'Armour' });
    expect(res.success).toBe(false);
    expect(res.output).toContain('"Weapons"');
  });
});

describe('pack plans', () => {
  it('she proposes, they agree, and agreeing builds the folders inside the pack', async () => {
    const { agreePackPlan, editPlanItem } = await import('../src/creative/library-folders.js');
    expect((await run({ action: 'create', folder: 'Medieval House' })).success).toBe(true);
    expect((await run({ action: 'plan', folder: 'Medieval House', items: [{ name: 'Wall', what: 'x', tool: 'blender' }] })).output).toContain('reasoning');

    const plan = await run({
      action: 'plan', folder: 'Medieval House', title: 'Medieval House', reasoning: 'A modular kit an engine can snap together.',
      items: [
        { name: 'Stone wall', what: '4m modular wall, snaps on a 1m grid', tool: 'blender', folder: 'Walls' },
        { name: 'Arched window', what: 'fits the wall opening', tool: 'blender', folder: 'Windows' },
        { name: 'House sign', what: 'painted shop sign', tool: 'gimp' },
      ],
    });
    expect(plan.success, plan.output).toBe(true);

    // Not before they agree.
    expect((await run({ action: 'start_item', folder: 'Medieval House', item: 'Stone wall', work: 'Stone Wall', tool: 'blender' })).output).toContain('waiting for them to agree');

    const house = findFolder(await readFolders(), 'Medieval House')!;
    ok(await agreePackPlan(house.id));
    const all = await readFolders();
    expect(all.filter((f) => f.parentId === house.id).map((f) => f.name).sort()).toEqual(['Walls', 'Windows']);

    // Their edit puts it back to waiting; agreeing again is theirs.
    const sign = all.find((f) => f.id === house.id)!.plan!.items.find((i) => i.name === 'House sign')!;
    ok(await editPlanItem(house.id, sign.id, { what: 'painted shop sign, hangs from an iron bracket' }));
    expect(findFolder(await readFolders(), 'Medieval House')!.plan).toMatchObject({ status: 'proposed', editedByPerson: true });
    ok(await agreePackPlan(house.id));
  });

  it('a started piece files itself into its place once something is made, and the plan tracks it', async () => {
    const { fileLinkedWork } = await import('../src/creative/library-folders.js');
    const { planStatuses } = await import('../src/creative/pack-plan-status.js');
    const started = await run({ action: 'start_item', folder: 'Medieval House', item: 'stone wall', work: 'Stone Wall', tool: 'blender' });
    expect(started.output).toContain('files itself into "Walls"');
    await run({ action: 'start_item', folder: 'Medieval House', item: 'House sign', work: 'Stat Icons', tool: 'gimp' });

    // The wall is built: it lands in Walls.
    const meta = JSON.parse(await (await import('node:fs/promises')).readFile(join(creative(), 'metadata.json'), 'utf-8'));
    meta.push({ id: 'model_stone-wall', kind: 'model', title: 'Stone Wall', absoluteFolder: join(creative(), 'blender', 'stone-wall') });
    await writeFile(join(creative(), 'metadata.json'), JSON.stringify(meta));
    await fileLinkedWork('blender', 'stone-wall');
    const all = await readFolders();
    const walls = all.find((f) => f.name === 'Walls')!;
    expect(walls.members.map((m) => m.ref)).toEqual(['creative:model_stone-wall']);

    const house = all.find((f) => f.name === 'Medieval House')!;
    const st = (await planStatuses(all))[house.id];
    const by = Object.fromEntries(house.plan!.items.map((i) => [i.name, st[i.id]]));
    // The sign's work (Stat Icons) has a final; the wall is built but not baked; the window isn't started.
    expect(by).toEqual({ 'Stone wall': 'in_progress', 'Arched window': 'planned', 'House sign': 'made' });

    const look = await run({ action: 'look', folder: 'Medieval House' });
    expect(look.output).toContain('PACK PLAN "Medieval House" — agreed');
    expect(look.output).toContain('1 of 3 made · 1 in progress · next on the plan: Arched window');
  });
});
