/**
 * Where Ava's 3D models live: ~/.ava/creative/blender/<slug>/.
 *
 * Read at call time: tests point AVA_CREATIVE_DIR at a scratch folder so they
 * never touch the real Library.
 */

import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AVA_HOME } from '../../core/constants.js';

export const creativeDir = () => process.env.AVA_CREATIVE_DIR || join(AVA_HOME, 'creative');
export const modelsDir = () => join(creativeDir(), 'blender');
export const imagesDir = () => join(creativeDir(), 'gimp');
export const metadataFile = () => join(creativeDir(), 'metadata.json');

/** "Worn Supply Crate" → "worn-supply-crate". The folder and file names. */
export function modelSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/**
 * Delete a piece of work: its whole folder, brief included, and its Library
 * entry. The Library can only reach work that has been made, so a brief that
 * was never built had no way out. Only ever called from the person's own
 * Delete button, after they have confirmed it.
 */
export async function deleteDesignWork(tool: 'blender' | 'gimp', slug: string): Promise<boolean> {
  if (!slug || modelSlug(slug) !== slug) return false;
  await rm(join(tool === 'gimp' ? imagesDir() : modelsDir(), slug), { recursive: true, force: true });
  try {
    const items = JSON.parse(await readFile(metadataFile(), 'utf-8'));
    const id = `${tool === 'gimp' ? 'gimp' : 'model'}_${slug}`;
    if (Array.isArray(items)) await writeFile(metadataFile(), JSON.stringify(items.filter((i) => i?.id !== id), null, 2), 'utf-8');
  } catch { /* no index yet */ }
  return true;
}
