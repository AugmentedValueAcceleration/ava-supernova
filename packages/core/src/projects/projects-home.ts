/**
 * Where new projects go — and nothing else.
 *
 * Dependency-free on purpose, like routing-modes.ts and the authoring format
 * leaf. Four places need this answer and they do not share a runtime: core and
 * the extension host are Node, the IDE renderer reaches the filesystem through
 * Tauri, and the webviews have no filesystem at all. A file that imports
 * nothing can be reached from all of them, so "where did Ava put my project?"
 * has one answer instead of four that drift.
 *
 * The home directory is passed IN rather than read here, because that is the
 * one thing each runtime discovers differently (`os.homedir()` in Node,
 * `homeDir()` from Tauri in the renderer).
 */

/**
 * The default location, relative to the user's home directory.
 *
 * `~/.ava/projects` — INSIDE Ava's own folder, alongside everything else she
 * keeps. It used to be `~/Ava Projects`, a second top-level folder, on the
 * argument that source code in a dotfolder gets lost and that backup tools skip
 * dotfolders. Operator, 2026-09-06, and he is right: what that actually
 * produced was two folders called "projects" on one machine, one of them his
 * work and one of them Ava's notes about his work, and no way to tell which
 * from the outside. One findable place beats two that look like duplicates.
 *
 * The safety argument did not survive being checked, either — nothing in this
 * codebase deletes `~/.ava` wholesale; reclaimStorage only removes paths
 * matching /backup/i.
 *
 * Ava's notes moved to `project-notes/` in the same change, so nothing shares
 * this name any more.
 */
export const PROJECTS_DIRNAME = 'projects';
export const AVA_DIRNAME = '.ava';

/** @deprecated The old `~/Ava Projects` name. Kept ONLY so the one-time move
 *  can find what it is moving; never use it to decide where a project goes. */
export const LEGACY_PROJECTS_DIRNAME = 'Ava Projects';

/** Join two path segments without caring which separator the platform uses. */
function joinPath(base: string, name: string): string {
  const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/';
  return base.replace(/[\\/]+$/, '') + sep + name;
}

/**
 * Resolve the projects home.
 *
 * `configured` is `preferences.projectsHome` — an absolute path the user chose.
 * Empty or unset means the default. A default, not a prison: developers have
 * settled habits about `~/dev` or `D:\work`, and the point is to remove a
 * decision from someone who does not yet have one, not to overrule someone
 * who does.
 */
export function projectsHomeFrom(homeDir: string, configured?: string | null): string {
  const trimmed = configured?.trim();
  if (trimmed) return trimmed.replace(/[\\/]+$/, '');
  return joinPath(joinPath(homeDir, AVA_DIRNAME), PROJECTS_DIRNAME);
}

/** Where projects used to go. The one-time move reads this; nothing else should. */
export function legacyProjectsHomeFrom(homeDir: string): string {
  return joinPath(homeDir, LEGACY_PROJECTS_DIRNAME);
}
