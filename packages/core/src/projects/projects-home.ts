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
 * The default folder name, under the user's home directory.
 *
 * Visible on purpose, and deliberately NOT under `~/.ava`: that is application
 * data and it is hidden. Source code in a dotfolder is a trap — people lose
 * it, and backup tools routinely skip dotfolders.
 */
export const DEFAULT_PROJECTS_DIRNAME = 'Ava Projects';

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
  return joinPath(homeDir, DEFAULT_PROJECTS_DIRNAME);
}
