/**
 * Step history for 3D models — the same strip the GIMP room has (Library
 * folders and packs plan, the step after Phase 3; built 9 Nov 2026).
 *
 * Every run saves over the same .blend, and versions/ only kept the last five
 * with no picture and no way back from the room. Now each successful step is
 * saved to history/<number>/ with its preview and a label, and going back to
 * one is a step itself — so nothing later is lost and they can go forward again.
 *
 * What a step holds: the .blend, the .glb and preview.png — and the baked
 * textures, because a bake rewrites them and going back must bring back the
 * textures that step had. Texture maps are large, so a step only stores them
 * when they changed since the step before; otherwise it points at the step
 * that has them (texturesIn). Pruning moves a shared copy forward rather than
 * losing it.
 */

import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { modelsDir } from './paths.js';
import { appendMaking, beforeChange, sourcesNow, type MakingAi } from '../making-record.js';

export interface ModelStep {
  number: number;
  label: string;
  at: string;
  /** Relative to the model's folder, or null when the step had no picture. */
  preview: string | null;
  /** The step whose history folder holds this step's textures; null = it had none. */
  texturesIn: number | null;
}

const HISTORY_KEEP = 20;
const historyFile = (slug: string) => join(modelsDir(), slug, 'history.json');
const stepFolder = (slug: string, n: number) => join(modelsDir(), slug, 'history', String(n));

export async function readModelHistory(slug: string): Promise<ModelStep[]> {
  try {
    const parsed = JSON.parse(await readFile(historyFile(slug), 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/** Names, sizes and times of the textures: enough to know whether a bake changed them. */
async function textureSignature(dir: string): Promise<string | null> {
  const names = (await readdir(dir).catch(() => [] as string[])).sort();
  if (!names.length) return null;
  const parts: string[] = [];
  for (const n of names) {
    const s = await stat(join(dir, n)).catch(() => null);
    if (s?.isFile()) parts.push(`${n}:${s.size}:${Math.round(s.mtimeMs)}`);
  }
  return parts.length ? parts.join('|') : null;
}

async function signatureOfStep(slug: string, step: ModelStep): Promise<string | null> {
  if (step.texturesIn === null) return null;
  try { return await readFile(join(stepFolder(slug, step.texturesIn), 'textures.sig'), 'utf-8'); } catch { return null; }
}

/** Save the model as it stands now as the next step. */
export async function recordModelStep(slug: string, label: string): Promise<ModelStep | null> {
  const dir = join(modelsDir(), slug);
  const blend = join(dir, `${slug}.blend`);
  if (!existsSync(blend)) return null;
  const steps = await readModelHistory(slug);
  const number = (steps.at(-1)?.number ?? 0) + 1;
  const folder = stepFolder(slug, number);
  await mkdir(folder, { recursive: true });
  await copyFile(blend, join(folder, `${slug}.blend`));
  for (const f of [`${slug}.glb`, 'preview.png']) {
    if (existsSync(join(dir, f))) await copyFile(join(dir, f), join(folder, f));
  }
  // Textures only when they changed since the last step.
  const sig = await textureSignature(join(dir, 'textures'));
  let texturesIn: number | null = null;
  if (sig) {
    // Any step already holding these exact textures — not only the last one:
    // going back to step 2 after step 1 must reuse step 2's copy.
    let holder: number | null = null;
    for (const n of [...new Set(steps.map((s) => s.texturesIn).filter((x): x is number => x !== null))].reverse()) {
      if ((await signatureOfStep(slug, { texturesIn: n } as ModelStep)) === sig) { holder = n; break; }
    }
    if (holder !== null) texturesIn = holder;
    else {
      await cp(join(dir, 'textures'), join(folder, 'textures'), { recursive: true, preserveTimestamps: true });
      await writeFile(join(folder, 'textures.sig'), sig, 'utf-8');
      texturesIn = number;
    }
  }
  const step: ModelStep = {
    number, label: label.trim().slice(0, 80) || `Step ${number}`, at: new Date().toISOString(),
    preview: existsSync(join(folder, 'preview.png')) ? `history/${number}/preview.png` : null,
    texturesIn,
  };
  steps.push(step);
  while (steps.length > HISTORY_KEEP) {
    const oldest = steps.shift()!;
    const heirs = steps.filter((s) => s.texturesIn === oldest.number);
    if (heirs.length) {
      // A later step still uses these textures: move them to the first of those.
      const heir = heirs[0].number;
      await rm(join(stepFolder(slug, heir), 'textures'), { recursive: true, force: true });
      await rename(join(stepFolder(slug, oldest.number), 'textures'), join(stepFolder(slug, heir), 'textures')).catch(() => {});
      await rename(join(stepFolder(slug, oldest.number), 'textures.sig'), join(stepFolder(slug, heir), 'textures.sig')).catch(() => {});
      for (const s of heirs) s.texturesIn = heir;
    }
    await rm(stepFolder(slug, oldest.number), { recursive: true, force: true });
  }
  await writeFile(historyFile(slug), JSON.stringify(steps, null, 2), 'utf-8');
  return step;
}

/**
 * Put the model back as it was at a step: .blend, .glb, preview and textures.
 * Going back is itself saved as a step, so later steps stay and can be
 * returned to. Null if there is no such step.
 */
export async function restoreModelStep(
  slug: string, number: number,
  who: { by: 'ava'; ai: MakingAi | null; ask: string | null } | { by: 'person' } = { by: 'person' },
): Promise<ModelStep | null> {
  const step = (await readModelHistory(slug)).find((s) => s.number === number);
  if (!step) return null;
  const dir = join(modelsDir(), slug);
  const folder = stepFolder(slug, number);
  if (!existsSync(join(folder, `${slug}.blend`))) return null;
  await beforeChange(dir, 'blender');
  await copyFile(join(folder, `${slug}.blend`), join(dir, `${slug}.blend`));
  for (const f of [`${slug}.glb`, 'preview.png']) {
    if (existsSync(join(folder, f))) await copyFile(join(folder, f), join(dir, f));
    else await rm(join(dir, f), { force: true });
  }
  await rm(join(dir, 'textures'), { recursive: true, force: true });
  if (step.texturesIn !== null && existsSync(join(stepFolder(slug, step.texturesIn), 'textures'))) {
    await cp(join(stepFolder(slug, step.texturesIn), 'textures'), join(dir, 'textures'), { recursive: true, preserveTimestamps: true });
  }
  await recordModelStep(slug, `Back to step ${number}`);
  await appendMaking(dir, { ...who, event: 'restored', tool: 'blender', step: number, label: step.label, sources: await sourcesNow(dir, 'blender') });
  return step;
}
