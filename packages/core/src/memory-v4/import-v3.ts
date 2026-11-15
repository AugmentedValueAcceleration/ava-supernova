/**
 * The free import (DECIDED 15 Nov): on the first start after the update, an
 * existing user's old memory comes across automatically, with no model and no
 * cost. Their memory works from the first minute; the tidy-up that sorts and
 * merges it properly is OFFERED on the Memory page, never run unasked.
 *
 *   - Old stores read: ~/.ava/memory/graph.json, ~/.ava/memory.json, and each
 *     registered project's .ava/memory.json and .ava/memory/graph.json.
 *   - Exact repeats are folded (the old graph held each memory ~3 times).
 *   - A memory keeps the project it was stored in; the main store's go under
 *     "everywhere". (Better sorting is the tidy-up's job, not a guess here.)
 *   - Obvious noise ("The assistant…", "Discovery: …") is set aside in
 *     .import/set-aside.json, not deleted, and the old files are never touched.
 *   - Runs once: .import/done.json records it. `since` imports only what was
 *     saved after a date (for someone whose approved memory is already in).
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AvaMemory } from './store.js';
import type { FactKind, FactScope } from './types.js';
import { normalizeForMatch } from './fact-file.js';
import { readIfExists, writeAtomic } from './files.js';
import { normalizeProjectPath } from './projects.js';

const NOISE = [/^the assistant\b/i, /^(discovery|decision|correction):\s/i, /^(recorded and|pushed —|yes —)/i];

interface OldEntry {
  content?: string;
  category?: string;
  createdAt?: string;
  timestamp?: string;
  archived?: boolean;
}

export interface ImportResult {
  imported: number;
  setAside: number;
  repeatsFolded: number;
  projects: number;
  skippedAsDone?: boolean;
}

async function readEntries(file: string): Promise<OldEntry[]> {
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(await readFile(file, 'utf-8')) as { entries?: OldEntry[]; nodes?: OldEntry[] };
    return [...(data.entries ?? []), ...(data.nodes ?? [])];
  } catch {
    return [];
  }
}

function kindFor(category: string | undefined, everywhere: boolean): FactKind {
  if (category === 'person') return 'person';
  if (category === 'preference') return 'preference';
  return everywhere ? 'preference' : 'project';
}

export function importDone(root: string): boolean {
  return existsSync(join(root, '.import', 'done.json'));
}

/**
 * The first start after the update: bring the old memory across once, free.
 * A no-op once done (or for a new user, who has no old memory: the marker is
 * still written, so it never looks again). Never throws.
 */
export async function ensureOldMemoryImported(mem: AvaMemory, oldHome: string, log?: (m: string) => void): Promise<void> {
  if (importDone(mem.root)) return;
  try {
    const r = await importOldMemory({ mem, oldHome });
    if (r.imported || r.setAside) log?.(`memory: brought your old memory across (${r.imported} memories, ${r.repeatsFolded} repeats folded, ${r.setAside} set aside)`);
  } catch (err) {
    log?.(`memory: could not bring the old memory across: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function importOldMemory(opts: { mem: AvaMemory; oldHome: string; since?: string; now?: Date }): Promise<ImportResult> {
  const { mem, oldHome } = opts;
  const marker = join(mem.root, '.import', 'done.json');
  if (!opts.since && existsSync(marker)) return { imported: 0, setAside: 0, repeatsFolded: 0, projects: 0, skippedAsDone: true };

  const sources: Array<{ scope: () => Promise<FactScope>; files: string[] }> = [
    { scope: async () => 'everywhere', files: [join(oldHome, 'memory', 'graph.json'), join(oldHome, 'memory.json')] },
  ];
  let registry: Array<{ path: string; name?: string }> = [];
  try {
    registry = JSON.parse((await readIfExists(join(oldHome, 'projects.json'))) ?? '[]');
  } catch { /* no registry: global only */ }
  const seenPaths = new Set<string>();
  const home = normalizeProjectPath(join(oldHome, '..'));
  for (const p of Array.isArray(registry) ? registry : []) {
    if (!p?.path) continue;
    const key = normalizeProjectPath(p.path);
    // The old registry listed the home folder as a "project": its store IS the global one.
    if (seenPaths.has(key) || key === home || normalizeProjectPath(join(p.path, '.ava')) === normalizeProjectPath(oldHome)) continue;
    seenPaths.add(key);
    const avaDir = join(p.path, '.ava');
    sources.push({
      scope: async () => `project:${(await mem.projectFor(p.path, p.name)).id}` as FactScope,
      files: [join(avaDir, 'memory.json'), join(avaDir, 'memory', 'graph.json')],
    });
  }

  const result: ImportResult = { imported: 0, setAside: 0, repeatsFolded: 0, projects: 0 };
  const setAside: Array<{ text: string; from: string }> = [];
  const seen = new Set<string>();
  const since = opts.since ?? '';

  for (const source of sources) {
    const entries = (await Promise.all(source.files.map(readEntries))).flat();
    if (!entries.length) continue;
    const scope = await source.scope();
    if (scope !== 'everywhere') result.projects++;
    for (const e of entries) {
      const text = String(e.content ?? '').trim();
      const key = normalizeForMatch(text);
      if (!key || e.archived) continue;
      if (seen.has(`${scope}|${key}`)) { result.repeatsFolded++; continue; }
      seen.add(`${scope}|${key}`);
      const when = String(e.createdAt ?? e.timestamp ?? '');
      const from = when.slice(0, 10);
      // `since`: only what was saved after it (ISO strings compare in time order).
      if (since && !(when > since)) continue;
      if (NOISE.some((r) => r.test(text)) || text.length < 20) {
        setAside.push({ text, from });
        result.setAside++;
        continue;
      }
      const { created } = await mem.addFact({
        text,
        kind: kindFor(e.category, scope === 'everywhere'),
        scope,
        source: 'inferred',
        // Their old memory, brought across as it was: counted as theirs, and
        // tagged so the offered tidy-up knows what it has not yet sorted.
        confirmed: (opts.now ?? new Date()).toISOString().slice(0, 10),
        from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : undefined,
        tags: ['imported'],
      });
      if (created) result.imported++; else result.repeatsFolded++;
    }
  }

  const stamp = (opts.now ?? new Date()).toISOString();
  if (setAside.length) {
    const file = join(mem.root, '.import', 'set-aside.json');
    const prior = JSON.parse((await readIfExists(file)) ?? '[]') as unknown[];
    await writeAtomic(file, JSON.stringify([...prior, ...setAside], null, 2));
  }
  await writeAtomic(marker, JSON.stringify({ at: stamp, since: since || null, ...result }, null, 2));
  return result;
}
