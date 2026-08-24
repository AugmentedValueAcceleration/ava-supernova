/**
 * Where Ava's per-project data lives, and which project it belongs to.
 *
 * `~/.ava/projects/<hash>/` holds what Ava knows about a project — verification
 * trust, brainstorm sessions — keyed by a hash of the project's path. Note what
 * that is NOT: it is not where projects live. The user's code is wherever they
 * made it. A row in the storage bar called "Projects" pointing here would say
 * something false.
 *
 * Two things brought this module into being.
 *
 * The hash was implemented TWICE — `projectHash` in brainstorm-store.ts and
 * `cwdHash` in verification-trust.ts — byte-identical and independently
 * maintained. They agree today. If either drifted, the same project would
 * silently split into two folders and Ava would lose her trust history and her
 * brainstorming for it, with nothing failing loudly enough to notice.
 *
 * And the hash is ONE-WAY. Nothing recorded which path produced it, so Ava
 * could never answer "which projects do I know about?" — you could only ask
 * about a project you already had in your hand. `project.json` fixes that: the
 * directory now says what it belongs to.
 */

import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
// The path rule itself lives in a dependency-free leaf, because the IDE
// renderer needs the same answer and cannot import node:fs.
import { projectsHomeFrom, DEFAULT_PROJECTS_DIRNAME } from './projects-home.js';
export { projectsHomeFrom, DEFAULT_PROJECTS_DIRNAME };

/** Ava's data root. */
export function avaHome(): string {
  return join(homedir(), '.ava');
}

/**
 * The folder new projects are created in.
 *
 * `~/Ava Projects` unless the user has pointed `preferences.projectsHome`
 * somewhere else. Visible on purpose, and deliberately NOT under `~/.ava` —
 * that is application data and it is hidden; source code in a dotfolder gets
 * lost and gets skipped by backup tools.
 *
 * Resolved here rather than in each surface so the IDE, the extension and the
 * CLI cannot disagree about where a project went. That is the mistake this
 * module already exists to correct once.
 */
export function projectsHome(configured?: string | null): string {
  return projectsHomeFrom(homedir(), configured);
}

/**
 * Stable id for a project path.
 *
 * Canonicalised first so a trailing slash or Windows drive-letter casing
 * cannot produce separate buckets for one project.
 */
export function projectHash(projectPath: string): string {
  const canonical = resolve(projectPath).replace(/[\\/]+$/, '').toLowerCase();
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/** Directory holding Ava's data for one project. Does not create it. */
export function projectDataDir(projectPath: string, globalDir?: string): string {
  return join(globalDir ?? avaHome(), 'projects', projectHash(projectPath));
}

/** What `project.json` records — the path the hash was made from. */
export interface ProjectRecord {
  version: 1;
  /** Absolute path, as resolved when first seen. */
  path: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

/**
 * Ensure the project's data directory exists and knows which project it is.
 *
 * Called by anything about to write per-project data. Cheap and idempotent:
 * an existing record only has its `lastSeenAt` refreshed, so a project that
 * moved keeps its original first-seen date rather than looking new.
 */
export async function ensureProjectData(projectPath: string, globalDir?: string): Promise<string> {
  const dir = projectDataDir(projectPath, globalDir);
  await mkdir(dir, { recursive: true });

  const file = join(dir, 'project.json');
  const now = new Date().toISOString();
  let record: ProjectRecord = {
    version: 1,
    path: resolve(projectPath),
    firstSeenAt: now,
    lastSeenAt: now,
  };
  try {
    const existing = JSON.parse(await readFile(file, 'utf8')) as Partial<ProjectRecord>;
    if (existing?.firstSeenAt) record = { ...record, firstSeenAt: existing.firstSeenAt };
  } catch { /* first time, or unreadable — rewrite it */ }

  // Best-effort: failing to record the path must never stop the caller from
  // doing the work it actually came here for.
  try { await writeFile(file, JSON.stringify(record, null, 2), 'utf8'); } catch { /* ignore */ }
  return dir;
}

/**
 * Every project Ava has data for, newest-seen first.
 *
 * Skips directories with no `project.json` — those predate this record and
 * their path is genuinely unrecoverable, the hash being one-way. They are not
 * an error; they are simply not listable.
 */
export async function listKnownProjects(globalDir?: string): Promise<ProjectRecord[]> {
  const root = join(globalDir ?? avaHome(), 'projects');
  let entries: string[];
  try {
    entries = (await readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  const records: ProjectRecord[] = [];
  for (const hash of entries) {
    try {
      const raw = await readFile(join(root, hash, 'project.json'), 'utf8');
      const rec = JSON.parse(raw) as ProjectRecord;
      if (rec?.path) records.push(rec);
    } catch { /* pre-record directory, or unreadable */ }
  }
  return records.sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''));
}
