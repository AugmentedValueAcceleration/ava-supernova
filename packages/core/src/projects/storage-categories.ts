/**
 * What each thing in `~/.ava` counts as, and what the user is told it is.
 *
 * Dependency-free, and shared. The extension host and the IDE each carried
 * their own copy of this map — same keys, same labels, same `categoryOf`,
 * separately maintained. Adding one category to two files is how the two
 * surfaces end up reporting a user's disk differently, which is a strange
 * thing for a local-first product to do.
 *
 * The scanning itself stays per-surface: the host walks with `node:fs`, the
 * IDE through Tauri. Only the rules live here.
 */

/** Which half of the bar a category belongs to. */
export type StorageFamily = 'ava' | 'projects';

export const CATEGORY_LABEL: Record<string, string> = {
  models: 'Models',
  runtime: 'Runtime',
  creative: 'Creative',
  memory: 'Memory',
  journal: 'Journal',
  datasets: 'Datasets',
  // NOT "Projects". `~/.ava/projects/` holds what Ava knows ABOUT a project —
  // trust state, brainstorm sessions — keyed by a hash of its path. The user's
  // code is wherever they made it. A row called "Projects" reading 1 KB would
  // say something false about where their work lives.
  projects: 'Project data',
  backups: 'Old backups',
  other: 'Other',
};

/** Stable display order; largest-first is applied after, this breaks ties. */
export const CATEGORY_ORDER = [
  'models', 'runtime', 'creative', 'memory', 'journal',
  'datasets', 'projects', 'backups', 'other',
];

/** Map a top-level entry name in `~/.ava` to a storage category. */
export function categoryOf(name: string): string {
  const n = name.toLowerCase();
  if (/backup/.test(n)) return 'backups';
  if (n === 'models') return 'models';
  if (n === 'bin') return 'runtime';
  if (n === 'creative') return 'creative';
  if (n === 'memory' || n === 'memory.json' || n === 'memory.md' || n === 'embeddings' || n === 'graph.json') return 'memory';
  if (n === 'journal') return 'journal';
  if (n === 'datasets') return 'datasets';
  if (n === 'projects') return 'projects';
  return 'other';
}

/** What the user's projects folder costs. Measured separately from `~/.ava`,
 *  because it is their work rather than Ava's footprint — and because it is
 *  expensive enough that it cannot be measured on every render. */
export interface ProjectsUsage {
  /** The projects home this figure describes. */
  path: string;
  bytes: number;
  /** ISO timestamp. Shown to the user, because a cached number that does not
   *  say how old it is invites being read as live. */
  measuredAt: string;
  /** How many project folders were counted, when known. */
  projectCount?: number;
}

/**
 * Is a cached projects measurement worth reusing?
 *
 * A source tree is not a config folder — an Unreal project's `Intermediate`,
 * `Binaries` and `DerivedDataCache` run to tens of gigabytes, and walking that
 * on every page render would stall the UI every time. So the number is cached
 * and shown with its age, and re-measured only on request or once it is stale.
 */
export const PROJECTS_USAGE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function isUsageStale(usage: ProjectsUsage | null | undefined, now = Date.now()): boolean {
  if (!usage?.measuredAt) return true;
  const at = Date.parse(usage.measuredAt);
  return Number.isNaN(at) || now - at > PROJECTS_USAGE_TTL_MS;
}

/** "measured 2h ago" — deliberately coarse; the point is age, not precision. */
export function measuredAgo(usage: ProjectsUsage | null | undefined, now = Date.now()): string | null {
  if (!usage?.measuredAt) return null;
  const at = Date.parse(usage.measuredAt);
  if (Number.isNaN(at)) return null;
  const mins = Math.max(0, Math.floor((now - at) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
