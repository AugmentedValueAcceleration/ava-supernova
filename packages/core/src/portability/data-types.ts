/**
 * Per-type export/import — "give me just my journal", as opposed to the
 * whole-bundle backup in bundle.ts.
 *
 * This lives in core because BOTH surfaces need it and they must not drift.
 * The extension and the IDE previously owned separate copies of this logic;
 * that is precisely how one of them ended up reading `~/.ava/tasks.json`, a
 * path that has never existed, for months without anyone noticing.
 *
 * Two roots, and the distinction matters:
 *   • account data (memory, tasks, history, …) → `scopedDir`
 *   • machine-wide data (datasets, procedures, …) → `avaHome`
 * See ACCOUNT_DATA_PATHS / GLOBAL_DATA_PATHS in bundle.ts.
 *
 * NOT handled here, deliberately:
 *   • `settings` — lives in the host's own config store (VS Code settings vs
 *     the IDE's config.json), so each surface exports its own.
 *   • `creative` — binary media; needs a zip, which is a surface concern.
 *   • secret-vault keys — they live in the OS keychain, never under ~/.ava,
 *     and are never exported. A restore brings back everything but the keys.
 */

import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve, sep } from 'node:path';

/** A file ready to be written wherever the surface's save dialog points. */
export interface ExportedFile {
  /** Suggested filename, e.g. `ava-journal.json`. */
  name: string;
  /** UTF-8 contents. */
  content: string;
}

/** Data types core can export on its own. Surfaces add `settings`/`creative`. */
export const CORE_DATA_TYPES = [
  'memory', 'tasks', 'journal', 'learning', 'history',
  'health', 'personality', 'profile', 'brain', 'datasets', 'audit',
] as const;
export type CoreDataType = typeof CORE_DATA_TYPES[number];

export function isCoreDataType(t: string): t is CoreDataType {
  return (CORE_DATA_TYPES as readonly string[]).includes(t);
}

/** Read a JSON file, or a fallback when it doesn't exist yet. */
async function readJsonOr(path: string, fallback: unknown): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    // A missing file is the ordinary "I never used that feature" case. It is an
    // empty section, not a failure — throwing here used to kill the whole export.
    return JSON.stringify(fallback, null, 2);
  }
}

/** Recursively collect .json/.jsonl under `dir`, keyed relative to `root`. */
async function collectDir(dir: string, root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (d: string): Promise<void> => {
    let entries: Awaited<ReturnType<typeof readdir>> = [];
    try {
      entries = await readdir(d, { withFileTypes: true }) as never;
    } catch {
      return; // directory absent — nothing to collect
    }
    for (const e of entries as unknown as Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>) {
      const abs = join(d, e.name);
      if (e.isDirectory()) { await walk(abs); continue; }
      // .jsonl too — dataset capture writes newline-delimited JSON, and a
      // .json-only filter collected exactly none of it.
      if (e.isFile() && (e.name.endsWith('.json') || e.name.endsWith('.jsonl'))) {
        out[relPosix(root, abs)] = await readFile(abs, 'utf8');
      }
    }
  };
  await walk(dir);
  return out;
}

function relPosix(root: string, abs: string): string {
  return abs.slice(root.length).replace(/^[\\/]+/, '').split(sep).join('/');
}

export interface DataRoots {
  /** Machine root (~/.ava). */
  avaHome: string;
  /** Signed-in account dir (~/.ava/users/<id>). Defaults to avaHome. */
  scopedDir?: string;
}

/**
 * Export one data type. Never throws for missing data — an empty section is a
 * truthful answer; a hard failure for "I never customised it" is not.
 */
export async function exportDataType(type: CoreDataType, roots: DataRoots): Promise<ExportedFile> {
  const { avaHome } = roots;
  const scoped = roots.scopedDir ?? avaHome;

  switch (type) {
    case 'memory': {
      // BOTH the v2 flat store (memory.json) AND the v3 graph (memory/), which
      // is where memories actually live now. Exporting memory.json alone handed
      // back a near-empty file while the real memories sat in the graph.
      const files: Record<string, string> = {};
      try { files['memory.json'] = await readFile(join(scoped, 'memory.json'), 'utf8'); } catch { /* none */ }
      try { files['memory.md'] = await readFile(join(scoped, 'memory.md'), 'utf8'); } catch { /* none */ }
      Object.assign(files, await collectDir(join(scoped, 'memory'), scoped));
      return { name: 'ava-memory.json', content: JSON.stringify({ memory: files }, null, 2) };
    }
    case 'tasks':
      // tasks/tasks.json — a DIRECTORY. Read as `tasks.json` it silently
      // exported nothing at all.
      return {
        name: 'ava-tasks.json',
        content: await readJsonOr(join(scoped, 'tasks', 'tasks.json'), { entries: [] }),
      };
    case 'journal': {
      const dir = join(scoped, 'journal');
      const files = await collectDir(dir, dir);
      const entries: unknown[] = [];
      for (const raw of Object.values(files)) {
        try { entries.push(JSON.parse(raw)); } catch { /* skip unparseable day */ }
      }
      return { name: 'ava-journal.json', content: JSON.stringify({ journal: entries }, null, 2) };
    }
    case 'learning':
      return {
        name: 'ava-learning.json',
        content: await readJsonOr(join(scoped, 'learning.json'), { curriculums: [] }),
      };
    case 'history': {
      const dir = join(scoped, 'history');
      const files = await collectDir(dir, dir);
      const conversations: unknown[] = [];
      for (const raw of Object.values(files)) {
        try { conversations.push(JSON.parse(raw)); } catch { /* skip */ }
      }
      return { name: 'ava-history.json', content: JSON.stringify({ conversations }, null, 2) };
    }
    case 'health': {
      const dir = join(scoped, 'health');
      return { name: 'ava-health.json', content: JSON.stringify({ health: await collectDir(dir, scoped) }, null, 2) };
    }
    case 'personality':
      return {
        name: 'ava-personality.json',
        content: await readJsonOr(join(scoped, 'personality.json'), { personality: null }),
      };
    case 'profile':
      // GeneralProfile — account-scoped (general.json), not the AVA_HOME root.
      return {
        name: 'ava-profile.json',
        content: await readJsonOr(join(scoped, 'general.json'), { profile: null }),
      };
    case 'brain': {
      // The learned layer lives at the AVA_HOME ROOT, not the scoped dir.
      const read = async (f: string): Promise<unknown> => {
        try { return JSON.parse(await readFile(join(avaHome, f), 'utf8')); } catch { return null; }
      };
      return {
        name: 'ava-brain.json',
        content: JSON.stringify({
          procedures: await read('procedures.json'),
          selfImprovement: await read('self-improvement.json'),
          feedback: await read('feedback.json'),
        }, null, 2),
      };
    }
    case 'datasets': {
      const files = await collectDir(join(avaHome, 'datasets'), avaHome);
      return { name: 'ava-datasets.json', content: JSON.stringify({ datasets: files }, null, 2) };
    }
    case 'audit':
      // Export-only — see importDataType.
      return {
        name: 'ava-audit-log.jsonl',
        content: await readFile(join(avaHome, 'audit-log.jsonl'), 'utf8').catch(() => ''),
      };
  }
}

/** Thrown when a caller tries to import a type that is deliberately export-only. */
export class NotImportableError extends Error {}

/**
 * Restore one data type. Returns how many items were written.
 * `audit` throws NotImportableError: it is an append-only record of what ran on
 * THIS machine, and overwriting it with another machine's history would destroy
 * the very thing it exists to prove.
 */
export async function importDataType(
  type: CoreDataType,
  content: string,
  roots: DataRoots,
): Promise<number> {
  const { avaHome } = roots;
  const scoped = roots.scopedDir ?? avaHome;

  const writeOne = async (abs: string, body: string): Promise<number> => {
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, body, 'utf8');
    return 1;
  };

  switch (type) {
    case 'audit':
      throw new NotImportableError(
        "The activity log is export-only — it cannot be restored over this machine's own record.",
      );
    case 'tasks':
      // Into the tasks/ DIRECTORY the TaskManager actually reads.
      return writeOne(join(scoped, 'tasks', 'tasks.json'), content);
    case 'learning':
      return writeOne(join(scoped, 'learning.json'), content);
    case 'personality':
      return writeOne(join(scoped, 'personality.json'), content);
    case 'profile':
      return writeOne(join(scoped, 'general.json'), content);
    case 'memory': {
      const parsed = JSON.parse(content) as { memory?: Record<string, string> };
      let n = 0;
      for (const [rel, raw] of Object.entries(parsed.memory ?? {})) {
        if (!contained(scoped, rel)) continue;
        n += await writeOne(join(scoped, rel), raw);
      }
      return n;
    }
    case 'health': {
      const parsed = JSON.parse(content) as { health?: Record<string, string> };
      let n = 0;
      for (const [rel, raw] of Object.entries(parsed.health ?? {})) {
        if (!contained(scoped, rel)) continue;
        n += await writeOne(join(scoped, rel), raw);
      }
      return n;
    }
    case 'journal': {
      const parsed = JSON.parse(content) as { journal?: Array<{ date?: string }> };
      let n = 0;
      for (const entry of parsed.journal ?? []) {
        if (!entry?.date) continue;
        n += await writeOne(join(scoped, 'journal', `${entry.date}.json`), JSON.stringify(entry, null, 2));
      }
      return n;
    }
    case 'history': {
      const parsed = JSON.parse(content) as { conversations?: Array<{ id?: string }> };
      let n = 0;
      for (const conv of parsed.conversations ?? []) {
        if (!conv?.id) continue;
        n += await writeOne(join(scoped, 'history', `${conv.id}.json`), JSON.stringify(conv, null, 2));
      }
      return n;
    }
    case 'brain': {
      const parsed = JSON.parse(content) as {
        procedures?: unknown; selfImprovement?: unknown; feedback?: unknown;
      };
      const parts: Array<[string, unknown]> = [
        ['procedures.json', parsed.procedures],
        ['self-improvement.json', parsed.selfImprovement],
        ['feedback.json', parsed.feedback],
      ];
      let n = 0;
      for (const [file, value] of parts) {
        if (value == null) continue;
        n += await writeOne(join(avaHome, file), JSON.stringify(value, null, 2));
      }
      return n;
    }
    case 'datasets': {
      const parsed = JSON.parse(content) as { datasets?: Record<string, string> };
      let n = 0;
      for (const [rel, raw] of Object.entries(parsed.datasets ?? {})) {
        if (!contained(avaHome, rel)) continue;
        n += await writeOne(join(avaHome, rel), raw);
      }
      return n;
    }
  }
}

/** Guard: never let a crafted export escape its root. */
function contained(root: string, rel: string): boolean {
  const abs = resolve(root, rel);
  const base = resolve(root);
  return abs === base || abs.startsWith(base + sep);
}
