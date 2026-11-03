/**
 * Where Ava's 3D models live: ~/.ava/creative/blender/<slug>/.
 *
 * Read at call time: tests point AVA_CREATIVE_DIR at a scratch folder so they
 * never touch the real Library.
 */

import { join } from 'node:path';
import { AVA_HOME } from '../../core/constants.js';

export const creativeDir = () => process.env.AVA_CREATIVE_DIR || join(AVA_HOME, 'creative');
export const modelsDir = () => join(creativeDir(), 'blender');
export const metadataFile = () => join(creativeDir(), 'metadata.json');

/** "Worn Supply Crate" → "worn-supply-crate". The folder and file names. */
export function modelSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
