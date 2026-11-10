/**
 * design_folder — Ava works inside a Library folder (Library folders and packs
 * plan, Phase 3, 9 Nov 2026).
 *
 * A folder is a pack: piece 40 has to match piece 1. So she can SEE a folder —
 * what is in it, how each piece was made, and the finished pictures themselves
 * — before she proposes a brief for the next piece. She can file the piece on
 * the stage into a folder when they say so, and keep the folder's style note.
 *
 * What she cannot do: decide on her own. Filing happens when they ask; the
 * style note is theirs and she saves one only after they say yes to it (his
 * call, 9 Nov). The brief still comes first — matching the set never skips it.
 */

import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { metadataFile, modelSlug } from './blender/paths.js';
import { readImageBrief, readImageFinals } from './gimp/build-image.js';
import { readModelBrief } from './blender/model-brief.js';
import { decodeImage, encodePng } from '../creative/image-local.js';
import {
  readFolders, findFolder, folderPath, addToFolder, createFolder, setFolderNote, proposePackPlan, startPlanItem, type FolderMember, type LibraryFolder,
} from '../creative/library-folders.js';
import { planStatuses, planProgressLine, type PlanItemState } from '../creative/pack-plan-status.js';

const MAX_LOOK = 6;
const LOOK_PX = 512;
const MAX_PICTURE_BYTES = 6 * 1024 * 1024;
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

interface Item {
  id: string; kind?: string; title?: string; prompt?: string; absolutePath?: string; absoluteFolder?: string;
  origin?: string; aiModel?: string; createdAt?: string; updatedAt?: string;
}

async function library(): Promise<Map<string, Item>> {
  try {
    const items = JSON.parse(await readFile(metadataFile(), 'utf-8'));
    return new Map((Array.isArray(items) ? items : []).filter((i) => typeof i?.id === 'string').map((i) => [i.id, i as Item]));
  } catch { return new Map(); }
}

/** A picture she can look at, no bigger than she needs. */
async function picture(path: string): Promise<{ b64: string; mime: string } | null> {
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime || !existsSync(path)) return null;
  const size = (await stat(path).catch(() => null))?.size ?? 0;
  if (!size || size > MAX_PICTURE_BYTES) return null;
  const bytes = await readFile(path);
  if (mime === 'image/webp') return { b64: bytes.toString('base64'), mime };
  try {
    // Shrink PNG and JPEG to what a look needs; nearest-neighbour is fine for judging a set.
    const img = await decodeImage(bytes);
    const scale = Math.min(1, LOOK_PX / Math.max(img.width, img.height));
    if (scale >= 1) return { b64: bytes.toString('base64'), mime };
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(img.height - 1, Math.floor(y / scale));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(img.width - 1, Math.floor(x / scale));
        data.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * w + x) * 4);
      }
    }
    return { b64: (await encodePng({ width: w, height: h, data })).toString('base64'), mime: 'image/png' };
  } catch {
    return { b64: bytes.toString('base64'), mime };
  }
}

/** One line on a piece, and the picture that shows it finished. */
async function describe(m: FolderMember, lib: Map<string, Item>): Promise<{ line: string; picturePath?: string }> {
  if (m.ref.startsWith('file:')) {
    const path = m.ref.slice(5);
    return { line: `${path.split('/').pop()} — a project file${existsSync(path) ? '' : ' (not there now)'}`, picturePath: path };
  }
  if (m.ref.startsWith('logo:')) {
    const group = m.ref.slice(5);
    const forms = [...lib.values()].filter((i) => i.id.startsWith(`${group}_`));
    const brand = (forms[0]?.title ?? 'Logo').replace(/ — .*$/, '');
    return { line: `${brand} — a logo system (${forms.length} forms${m.pick?.length ? `, ${m.pick.join(', ')} in this folder` : ''}), built from shapes and fonts` };
  }
  const item = lib.get(m.ref.slice('creative:'.length));
  if (!item) return { line: `${m.ref} — no longer in the Library` };
  const made = item.origin === 'uploaded' ? 'their own upload'
    : item.origin === 'composed' ? 'built from shapes and fonts'
    : item.origin === 'generated' ? `generated${item.aiModel ? ` with ${item.aiModel}` : ''}`
    : '';
  if (item.kind === 'gimp' && item.absoluteFolder) {
    const slug = item.absoluteFolder.split(/[\\/]/).pop() ?? '';
    const brief = await readImageBrief(slug);
    const finals = (await readImageFinals(slug)).filter((f) => !m.pick?.length || m.pick.includes(f));
    const style = brief ? ` · style: ${(brief as unknown as Record<string, string>).style ?? '—'}` : '';
    return {
      line: `${item.title} — GIMP work${finals.length ? `, finished: ${finals.join(', ')}` : ', no finished file yet'}${style}`,
      picturePath: finals[0] ? join(item.absoluteFolder, finals[0]) : join(item.absoluteFolder, 'preview.png'),
    };
  }
  if (item.kind === 'model' && item.absoluteFolder) {
    const slug = item.absoluteFolder.split(/[\\/]/).pop() ?? '';
    const brief = item.id.startsWith('upload_') ? null : await readModelBrief(slug);
    const style = brief ? ` · style: ${brief.style} · budget: ${brief.budget}` : '';
    return { line: `${item.title} — 3D model${item.origin === 'uploaded' ? ' (their own upload)' : ''}${style}`, picturePath: join(item.absoluteFolder, 'preview.png') };
  }
  return { line: `${item.title} — ${item.kind ?? 'file'}${made ? `, ${made}` : ''}`, picturePath: item.absolutePath };
}

export class DesignFolderTool implements Tool {
  readonly name = 'design_folder';
  readonly description = 'See a Library folder (a pack) and its finished pieces, file the work on the stage into a folder when they ask, and keep a folder\'s style note.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_folder',
    description:
      'Library folders are how they organise work, and for a pack, piece 40 has to match piece 1. ' +
      'list: their folders, with each one\'s style note and how much is in it. ' +
      'look: what is in a folder, how each piece was made, and the finished pictures themselves — LOOK at them before you propose a brief for the next piece of that set, and hold its shape language, line weight, light and palette. ' +
      'file: put the piece on the stage into a folder — ONLY when they ask ("this goes in my Fantasy UI Pack"). ' +
      'set_note: save the folder\'s style note — it is THEIRS: propose one in chat, and call this only after they say yes to that exact wording. ' +
      'create: make a folder (inside another with parent) — when they ask, or for a pack whose plan they asked you to make. ' +
      'plan: propose the PACK PLAN for a folder — every piece the pack needs, each with a name, one line on what it is, the room that makes it, and the folder inside the pack it goes in — with your reasoning (what it is for, what a buyer or engine expects, what makes it feel complete). ' +
      'They edit and agree it in the folder; you cannot agree it. Agreeing it builds the folders inside the pack. Call plan again with the full plan when the talk changes it. ' +
      'start_item: when you start a planned piece, link it to its work (its name and room) BEFORE its brief, so the room knows which piece of which plan this is and the work files itself into its place. ' +
      'Every planned piece is still made one at a time with its own agreed brief: the plan is the map, never a button. ' +
      'A folder never moves files; it points at them, so filing never changes the work.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'look', 'file', 'set_note', 'create', 'plan', 'start_item'] },
        folder: { type: 'string', description: 'The folder\'s name, or its path for one inside another ("Pack / Icons"). Not needed for list.' },
        work: { type: 'string', description: 'file: the name of the work on the stage, e.g. "Stat Icons".' },
        tool: { type: 'string', enum: ['gimp', 'blender'], description: 'file: which room made it.' },
        create: { type: 'boolean', description: 'file: make the folder first if it doesn\'t exist — only when they asked for a new folder.' },
        note: { type: 'string', description: 'set_note: the style note they agreed, in one line. Empty clears it.' },
        parent: { type: 'string', description: 'create: the folder to make it inside. Omit for the top level.' },
        title: { type: 'string', description: 'plan: the pack\'s name, e.g. "Medieval House".' },
        reasoning: { type: 'string', description: 'plan: why these pieces — the part they question and learn from.' },
        items: {
          type: 'array',
          description: 'plan: every piece the pack needs.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'e.g. "Arched window".' },
              what: { type: 'string', description: 'One line: what it is and what it must do.' },
              tool: { type: 'string', enum: ['gimp', 'blender', 'other'], description: 'The room that makes it.' },
              folder: { type: 'string', description: 'The folder inside the pack it goes in, e.g. "Windows". Omit for the pack itself.' },
            },
            required: ['name', 'what', 'tool'],
          },
        },
        item: { type: 'string', description: 'start_item: the planned piece\'s name.' },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, _context?: ToolExecutionContext): Promise<ToolResult> {
    const action = String(args.action ?? '');
    const folders = await readFolders();
    const names = () => folders.length ? folders.map((f) => `"${folderPath(folders, f)}"`).join(', ') : 'none yet';

    const states = await planStatuses(folders);
    const planLine = (f: LibraryFolder) => (f.plan
      ? ` · PACK PLAN "${f.plan.title}" (${f.plan.status === 'agreed' ? 'agreed' : 'waiting for them to agree'}): ${planProgressLine(f, states[f.id] ?? {})}`
      : '');

    if (action === 'list') {
      if (!folders.length) return { success: true, output: 'They have no folders yet. Folders are made in the Library (Assets → Folders), or with create when they ask for one.' };
      const lines = folders
        .map((f) => ({ f, path: folderPath(folders, f) }))
        .sort((a, b) => a.path.localeCompare(b.path))
        .map(({ f, path }) => `- ${path}: ${f.members.length} piece${f.members.length === 1 ? '' : 's'}${f.note ? ` · style note: "${f.note}"` : ' · no style note'}${planLine(f)}`);
      return { success: true, output: `Their folders:\n${lines.join('\n')}` };
    }

    if (action === 'file') {
      const work = String(args.work ?? '').trim();
      const slug = modelSlug(work);
      const tool = args.tool === 'blender' ? 'blender' : args.tool === 'gimp' ? 'gimp' : null;
      if (!slug || !tool) return { success: false, output: 'Say which work (its name) and which room made it (gimp or blender).' };
      const id = tool === 'gimp' ? `gimp_${slug}` : `model_${slug}`;
      if (!(await library()).has(id)) return { success: false, output: `"${work}" isn't in the Library yet: it gets there once something has been made. Make it first, then file it.` };
      let folder = findFolder(folders, String(args.folder ?? ''));
      if (!folder && args.create === true) {
        const made = await createFolder(String(args.folder ?? ''), null);
        if (!made.ok) return { success: false, output: made.error };
        folder = made.value;
      }
      if (!folder) return { success: false, output: `There is no folder called "${args.folder}". Their folders: ${names()}. If they want a new one, call again with create: true.` };
      const res = await addToFolder(folder.id, [{ ref: `creative:${id}` }]);
      if (!res.ok) return { success: false, output: res.error };
      return { success: true, output: `"${work}" is in "${folder.name}". Nothing moved: the folder points at it, so it stays in the Library and in the room as it was.` };
    }

    if (action === 'create') {
      const parent = args.parent ? findFolder(folders, String(args.parent)) : null;
      if (args.parent && !parent) return { success: false, output: `There is no folder called "${args.parent}". Their folders: ${names()}.` };
      const made = await createFolder(String(args.folder ?? ''), parent?.id ?? null);
      if (!made.ok) return { success: false, output: made.error };
      return { success: true, output: `Made the folder "${made.value.name}"${parent ? ` inside "${parent.name}"` : ''}.` };
    }

    const folder = findFolder(folders, String(args.folder ?? ''));
    if (!folder) return { success: false, output: `There is no folder called "${args.folder}". Their folders: ${names()}. To make one, use create.` };

    if (action === 'plan') {
      const res = await proposePackPlan(folder.id, { title: args.title, reasoning: args.reasoning, items: args.items });
      if (!res.ok) return { success: false, output: res.error };
      const plan = res.value.plan!;
      const homes = [...new Set(plan.items.map((i) => i.folder).filter(Boolean))];
      return {
        success: true,
        output: `The plan for "${folder.name}" is in the folder: ${plan.items.length} pieces${homes.length ? `, in ${homes.join(', ')}` : ''}. ` +
          'Talk them through your reasoning and change it where they have a point. They agree it in the folder (Library → Folders); agreeing it makes the folders inside the pack. Nothing is made until they do, and then every piece still gets its own brief.',
      };
    }

    if (action === 'start_item') {
      const work = String(args.work ?? '').trim();
      const slug = modelSlug(work);
      const tool = args.tool === 'blender' ? 'blender' : args.tool === 'gimp' ? 'gimp' : null;
      if (!slug || !tool) return { success: false, output: 'Say the work\'s name and which room makes it (gimp or blender).' };
      const res = await startPlanItem(folder.id, String(args.item ?? ''), tool, work, slug);
      if (!res.ok) return { success: false, output: res.error };
      return {
        success: true,
        output: `"${res.value.item.name}" from the "${folder.plan!.title}" plan is now "${work}" in the ${tool === 'gimp' ? 'GIMP' : 'Blender'} room; it files itself into "${res.value.home}" once something is made. ` +
          `What it must be: ${res.value.item.what}. Now propose its brief, built on the plan line, the style note and the set — they agree it before anything is made.`,
      };
    }

    if (action === 'set_note') {
      const res = await setFolderNote(folder.id, String(args.note ?? ''));
      if (!res.ok) return { success: false, output: res.error };
      return { success: true, output: res.value.note ? `The style note for "${folder.name}" is now: "${res.value.note}".` : `The style note for "${folder.name}" is cleared.` };
    }

    if (action !== 'look') return { success: false, output: 'action is list, look, file or set_note.' };

    const lib = await library();
    const inside = folders.filter((f) => f.parentId === folder.id);
    const described = await Promise.all(folder.members.map((m) => describe(m, lib)));
    // The first pieces set the style and the latest show where it is now: both.
    const order = described.map((d, i) => ({ ...d, i })).filter((d) => d.picturePath);
    const chosen = order.length <= MAX_LOOK ? order : [...order.slice(0, 2), ...order.slice(-(MAX_LOOK - 2))];
    const pictures: Array<{ b64: string; mime: string; label: string }> = [];
    for (const d of chosen) {
      const p = await picture(d.picturePath!);
      if (p) pictures.push({ ...p, label: d.line.split(' — ')[0] });
    }
    const lines = [
      `"${folderPath(folders, folder)}" — ${folder.members.length} piece${folder.members.length === 1 ? '' : 's'}${inside.length ? `, and folders inside it: ${inside.map((f) => f.name).join(', ')}` : ''}.`,
      folder.note ? `Style note (theirs): "${folder.note}". Every brief for this folder follows it.` : 'No style note yet. If the set has a clear look, you can propose one in a line — saved only once they say yes.',
      ...described.map((d, i) => `${i + 1}. ${d.line}`),
    ];
    if (folder.plan) {
      const st: Record<string, PlanItemState> = states[folder.id] ?? {};
      const word: Record<PlanItemState, string> = { planned: 'planned', started: 'started', in_progress: 'in progress', made: 'MADE' };
      lines.push(
        `PACK PLAN "${folder.plan.title}" — ${folder.plan.status === 'agreed' ? 'agreed' : 'waiting for them to agree it'}${folder.plan.editedByPerson ? ' (they edited it: work from their version)' : ''}: ${planProgressLine(folder, st)}.`,
        ...folder.plan.items.map((i) => `  - ${i.name}${i.folder ? ` [${i.folder}]` : ''} (${i.tool}) — ${word[st[i.id] ?? 'planned']}${i.work ? `, work "${i.work.name}"` : ''}: ${i.what}`),
      );
    }
    lines.push(pictures.length
      ? `You are looking at, in order: ${pictures.map((p) => p.label).join('; ')}.${order.length > pictures.length ? ` (${order.length - pictures.length} more not shown.)` : ''} Hold what they share — shape language, line weight, light direction, palette, detail level — in the next piece, and say what you see.`
      : 'There are no finished pictures to look at here yet.');

    return {
      success: true,
      output: lines.join('\n'),
      metadata: pictures.length ? {
        base64_image: pictures[0].b64, mime_type: pictures[0].mime,
        more_images: pictures.slice(1).map((p) => p.b64), more_mime_types: pictures.slice(1).map((p) => p.mime),
      } : undefined,
    };
  }
}
