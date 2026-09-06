/**
 * One-time move to the single-roof layout.
 *
 *     ~/.ava/projects/        the user's work
 *     ~/.ava/project-notes/   what Ava knows ABOUT a project, keyed by hash
 *
 * Before 2026-09-06 those were `~/.ava/projects` (notes) and `~/Ava Projects`
 * (work) — two folders called "projects" on one machine, one of them the user's
 * code and one of them Ava's notes about it, with nothing to tell them apart
 * from the outside. Operator: *"we want it all in there that way is easy for
 * users to find anything."*
 *
 * TWO MOVES, and the order matters: the notes vacate `projects/` BEFORE any
 * work is moved into it. Run the other way round and a project could land in a
 * folder that is about to be treated as notes.
 *
 * Everything here is deliberately narrow, because the second move touches
 * somebody's source code:
 *
 *   - only 16-hex-character directories are treated as notes, which is exactly
 *     what projectHash produces and which no real project folder looks like;
 *   - work moves only when the user never chose a projects path of their own —
 *     a configured path is their decision and is never overridden;
 *   - nothing is ever overwritten: a name that already exists at the
 *     destination is left where it is and reported;
 *   - the old folder is removed only once it is empty, and only if it emptied
 *     because we emptied it;
 *   - a failure leaves the file where it is. Half a migration is worse than
 *     none, and this is not our data.
 *
 * Idempotent, and cheap on the overwhelmingly common path: two `readdir`s that
 * miss, and it returns.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readdir, rename, rmdir, stat } from 'node:fs/promises';

import { avaHome, PROJECT_NOTES_DIRNAME } from './project-data.js';
import { legacyProjectsHomeFrom, projectsHomeFrom, PROJECTS_DIRNAME } from './projects-home.js';

/** What projectHash produces: 16 lowercase hex characters, nothing else. */
const HASH_DIR = /^[0-9a-f]{16}$/;

export interface LayoutMigration {
  /** Note directories moved into project-notes/. */
  notesMoved: number;
  /** Project folders moved into ~/.ava/projects. */
  projectsMoved: string[];
  /** Things left alone, and why — a name collision, or a move that failed. */
  skipped: string[];
}

/**
 * Move one directory, refusing to clobber anything already there.
 *
 * `rename` is atomic within a volume, and both paths are under the home
 * directory, so this is the same filesystem in every normal setup. Across
 * volumes it throws EXDEV and the caller reports a skip rather than falling
 * back to a copy — a half-copied source tree that then gets deleted is exactly
 * the outcome worth refusing.
 */
async function moveIfFree(from: string, to: string): Promise<string | null> {
  try {
    await stat(to);
    return 'already exists at the destination';
  } catch { /* free — carry on */ }
  try {
    await rename(from, to);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Bring an install onto the current layout. Safe to call on every startup.
 *
 * `configured` is `preferences.projectsHome`. When it is set, the work move is
 * skipped entirely: they chose a location and it is not ours to change.
 */
export async function migrateProjectsLayout(
  configured?: string | null,
  home: string = homedir(),
): Promise<LayoutMigration> {
  const result: LayoutMigration = { notesMoved: 0, projectsMoved: [], skipped: [] };
  const ava = avaHome();
  const notesDir = join(ava, PROJECT_NOTES_DIRNAME);
  const projectsDir = join(ava, PROJECTS_DIRNAME);

  // ── 1. The notes vacate `projects/` ──────────────────────────────────
  //
  // FIRST, so that nothing is moved into a folder still being read as notes.
  // Only hash-shaped names: after this ships, `~/.ava/projects` fills up with
  // real project folders, and this must never mistake one for a note.
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    const hashes = entries.filter(e => e.isDirectory() && HASH_DIR.test(e.name));
    if (hashes.length > 0) {
      await mkdir(notesDir, { recursive: true });
      for (const e of hashes) {
        const why = await moveIfFree(join(projectsDir, e.name), join(notesDir, e.name));
        if (why) result.skipped.push(`notes ${e.name}: ${why}`);
        else result.notesMoved++;
      }
    }
  } catch { /* no such folder — a fresh install, nothing to move */ }

  // ── 2. The work moves in ─────────────────────────────────────────────
  //
  // Only from the OLD DEFAULT, and only when they never chose a path. Somebody
  // pointing projectsHome at ~/dev has made a decision; migrating them out of
  // it would be overruling them, which this is not for.
  if (configured?.trim()) return result;
  if (projectsHomeFrom(home, configured) !== projectsDir) return result;

  const legacy = legacyProjectsHomeFrom(home);
  let legacyEntries: string[];
  try {
    legacyEntries = (await readdir(legacy, { withFileTypes: true })).map(e => e.name);
  } catch {
    return result; // never had one — the common case after the first run
  }

  if (legacyEntries.length > 0) await mkdir(projectsDir, { recursive: true });
  for (const name of legacyEntries) {
    const why = await moveIfFree(join(legacy, name), join(projectsDir, name));
    if (why) result.skipped.push(`${name}: ${why}`);
    else result.projectsMoved.push(name);
  }

  // Only if we emptied it. rmdir without `recursive` refuses a non-empty
  // directory, which is the guarantee wanted here rather than a check we
  // perform ourselves and then race.
  try { await rmdir(legacy); } catch { /* something is left in it — leave it be */ }

  return result;
}
