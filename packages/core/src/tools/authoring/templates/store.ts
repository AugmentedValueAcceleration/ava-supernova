/**
 * Local-first persistence for user templates and "house style".
 *
 * A writer can save Ava's best output as a reusable template, and pin a brand
 * (fonts/colours) that every new document inherits. Both live as plain files
 * under the Ava home (AVA_HOME or ~/.ava) — exact, offline, and yours. No cloud,
 * no account.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DocTemplate } from './template-model.js';
import type { BrandTokens } from '../doc-model.js';

function avaHome(): string {
  return process.env.AVA_HOME || join(homedir(), '.ava');
}
function authoringDir(): string { return join(avaHome(), 'authoring'); }
function templatesDir(): string { return join(authoringDir(), 'templates'); }
function houseStylePath(): string { return join(authoringDir(), 'house-style.json'); }

// ── House style ──────────────────────────────────────────────────────────────

export async function loadHouseStyle(): Promise<BrandTokens | undefined> {
  try {
    const parsed = JSON.parse(await readFile(houseStylePath(), 'utf-8'));
    return parsed && typeof parsed === 'object' ? parsed as BrandTokens : undefined;
  } catch {
    return undefined;
  }
}

export async function saveHouseStyle(brand: BrandTokens): Promise<string> {
  await mkdir(authoringDir(), { recursive: true });
  const path = houseStylePath();
  await writeFile(path, JSON.stringify(brand, null, 2), 'utf-8');
  return path;
}

// ── User templates ───────────────────────────────────────────────────────────

export async function saveUserTemplate(tpl: DocTemplate): Promise<string> {
  await mkdir(templatesDir(), { recursive: true });
  const safe = tpl.id.replace(/[^\w.-]+/g, '_');
  const path = join(templatesDir(), `${safe}.json`);
  await writeFile(path, JSON.stringify({ ...tpl, source: 'user' }, null, 2), 'utf-8');
  return path;
}

export async function loadUserTemplates(): Promise<DocTemplate[]> {
  let files: string[];
  try { files = await readdir(templatesDir()); } catch { return []; }
  const out: DocTemplate[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const tpl = JSON.parse(await readFile(join(templatesDir(), f), 'utf-8')) as DocTemplate;
      if (tpl?.id && tpl?.body) out.push({ ...tpl, source: 'user' });
    } catch { /* skip malformed */ }
  }
  return out;
}
