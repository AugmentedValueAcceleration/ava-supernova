/**
 * How far along a pack plan is (pack plans, 9 Nov 2026). Its own module so the
 * folder store never has to import the rooms.
 *
 *   planned      nobody has started it
 *   started      a piece of work is named for it, nothing made yet
 *   in_progress  made, not finished
 *   made         finished: GIMP work with a final; a Blender model built AND
 *                baked (textures/ exists), because an unbaked model reaches an
 *                engine flat and so isn't finished
 */

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { metadataFile, modelsDir } from '../tools/blender/paths.js';
import { readImageFinals } from '../tools/gimp/build-image.js';
import { planWorkId, type LibraryFolder, type PlanItem } from './library-folders.js';

export type PlanItemState = 'planned' | 'started' | 'in_progress' | 'made';

async function libraryIds(): Promise<Set<string>> {
  try {
    const items = JSON.parse(await readFile(metadataFile(), 'utf-8'));
    return new Set((Array.isArray(items) ? items : []).map((i) => i?.id).filter((x): x is string => typeof x === 'string'));
  } catch { return new Set(); }
}

async function stateOf(item: PlanItem, lib: Set<string>): Promise<PlanItemState> {
  if (!item.work) return 'planned';
  if (!lib.has(planWorkId(item.work))) return 'started';
  if (item.work.tool === 'gimp') return (await readImageFinals(item.work.slug)).length ? 'made' : 'in_progress';
  const tex = join(modelsDir(), item.work.slug, 'textures');
  return existsSync(tex) && (await readdir(tex).catch(() => [])).length ? 'made' : 'in_progress';
}

/** Every planned piece's state, by folder and piece id. */
export async function planStatuses(folders: LibraryFolder[]): Promise<Record<string, Record<string, PlanItemState>>> {
  const lib = await libraryIds();
  const out: Record<string, Record<string, PlanItemState>> = {};
  for (const f of folders) {
    if (!f.plan) continue;
    out[f.id] = {};
    for (const item of f.plan.items) out[f.id][item.id] = await stateOf(item, lib);
  }
  return out;
}

/** "7 of 16 made · 2 in progress · next: Arched window". */
export function planProgressLine(folder: LibraryFolder, states: Record<string, PlanItemState>): string {
  const items = folder.plan?.items ?? [];
  const made = items.filter((i) => states[i.id] === 'made').length;
  const going = items.filter((i) => states[i.id] === 'in_progress' || states[i.id] === 'started').length;
  const next = items.find((i) => states[i.id] === 'planned');
  return `${made} of ${items.length} made${going ? ` · ${going} in progress` : ''}${next ? ` · next on the plan: ${next.name}` : made === items.length ? ' · every piece is made' : ''}`;
}
