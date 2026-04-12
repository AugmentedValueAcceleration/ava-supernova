/**
 * Dynamic design context re-injection.
 *
 * When an agent (main or Builder) writes/edits a UI file during a long
 * session, its attention has usually drifted toward recent tool results
 * (stack traces, build failures, edit diffs) and away from the session-start
 * design context. By the time it makes the next design decision, the palette
 * and voice files have faded out of the active attention window.
 *
 * This helper detects "about to touch a UI file" moments and returns a fresh
 * system-message payload containing the current Decisions/design/ contents,
 * suitable for injection into the next LLM call. The caller appends this
 * payload to the messages array just before the next turn, placing the design
 * context back into the most-recent-token attention slot where it can compete
 * with whatever else is dominating her focus.
 *
 * This is the hardware-level fix for "flustered design degradation": by the
 * time she makes a colour choice, the palette file is the freshest thing in
 * her context, not the stack trace that just finished scrolling.
 *
 * The helper is intentionally stateless and cheap — it reads from disk every
 * call, so user edits to Decisions/design/*.md take effect immediately
 * without any cache invalidation plumbing.
 */

import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const UI_FILE_EXTENSIONS = new Set([
  '.tsx', '.jsx', '.vue', '.svelte', '.astro',
  '.css', '.scss', '.sass', '.less', '.styl',
  '.html', '.htm',
  '.svg',
]);

const UI_PATH_MARKERS = [
  '/components/', '\\components\\',
  '/pages/', '\\pages\\',
  '/ui/', '\\ui\\',
  '/styles/', '\\styles\\',
  '/views/', '\\views\\',
  '/layouts/', '\\layouts\\',
  '/screens/', '\\screens\\',
];

/**
 * Return true if the given file path looks like a UI file where taste
 * decisions (palette, typography, spacing, voice, layout) are likely to be
 * embedded.
 */
export function isUIFilePath(filePath: string): boolean {
  if (!filePath) return false;
  const lower = filePath.toLowerCase();

  // Extension check — most UI files are caught here
  const lastDot = lower.lastIndexOf('.');
  if (lastDot !== -1) {
    const ext = lower.slice(lastDot);
    if (UI_FILE_EXTENSIONS.has(ext)) return true;
  }

  // Path marker check — catches config-style TS/JS files that live inside
  // UI directories (e.g. components/index.ts, pages/_app.tsx)
  for (const marker of UI_PATH_MARKERS) {
    if (lower.includes(marker)) return true;
  }

  return false;
}

/**
 * Read the current contents of Decisions/design/*.md (and Decisions/overview.md,
 * Decisions/context.md for framing) from the given project root. Returns a
 * formatted string suitable for injection as a system message body, or null
 * if the project has no Decisions folder or all files are empty.
 *
 * This reads from disk every call — intentional. User edits to these files
 * take effect on the very next re-injection without any caching layer.
 */
export async function loadFreshDesignContext(projectRoot: string): Promise<string | null> {
  if (!projectRoot) return null;

  const decisionsDir = join(projectRoot, 'Decisions');
  if (!existsSync(decisionsDir)) return null;

  const parts: string[] = [];

  // Project framing first — overview + context
  const framingFiles: Array<{ name: string; header: string }> = [
    { name: 'overview.md', header: 'Project overview' },
    { name: 'context.md',  header: 'Project context' },
  ];
  for (const { name, header } of framingFiles) {
    try {
      const content = await readFile(join(decisionsDir, name), 'utf-8');
      const trimmed = content.trim();
      if (trimmed) parts.push(`**${header}** (\`Decisions/${name}\`)\n${trimmed}`);
    } catch { /* skip */ }
  }

  // Then the actual design files
  const designDir = join(decisionsDir, 'design');
  if (existsSync(designDir)) {
    const designFiles: Array<{ name: string; header: string }> = [
      { name: 'palette.md',    header: 'Palette (apply as law)' },
      { name: 'typography.md', header: 'Typography (apply as law)' },
      { name: 'voice.md',      header: 'Voice (apply as law)' },
      { name: 'assets.md',     header: 'Generated assets log' },
    ];
    for (const { name, header } of designFiles) {
      try {
        const content = await readFile(join(designDir, name), 'utf-8');
        const trimmed = content.trim();
        if (trimmed) parts.push(`**${header}** (\`Decisions/design/${name}\`)\n${trimmed}`);
      } catch { /* skip */ }
    }
  }

  if (parts.length === 0) return null;
  return parts.join('\n\n---\n\n');
}

/**
 * Build the full system-message body for re-injection. Wraps the design
 * context in framing that tells the model *why* this content is arriving
 * mid-session: it's a deliberate refresh, not a duplicate. The framing
 * matters because without it, the model might treat the injection as noise.
 */
export function formatDesignReinjectionMessage(designContext: string): string {
  return [
    '[Design context refresh — these are the project\'s current taste decisions, loaded fresh from disk because you\'re about to touch a UI file. Apply them. Do not default to generic patterns.]',
    '',
    designContext,
    '',
    '[End design context refresh. Resume your task with these decisions fresh in your attention.]',
  ].join('\n');
}

/**
 * Minimum number of agent turns that must pass between design-context
 * re-injections. Prevents the same palette/voice/typography files from
 * being read and injected 20 times in a session where Ava writes 20 UI
 * files back-to-back. If design files are genuinely modified between
 * turns, the mtime check still triggers re-injection regardless.
 */
export const REINJECTION_MIN_TURNS = 5;

/**
 * Per-Agent state for design re-injection throttling. Owned by the Agent
 * instance and passed through on each call so the helper can decide
 * whether to re-inject based on turn count and file-mtime changes.
 */
export interface ReinjectionState {
  /** Current agent turn counter — incremented on each UI tool call. */
  currentTurn: number;
  /** Turn index at which the last re-injection fired. -Infinity if none yet. */
  lastInjectedTurn: number;
  /** Map of design file path → last-known mtime in ms. Updated on each injection. */
  lastMtimes: Map<string, number>;
}

export interface ReinjectionResult {
  content: string;
  updatedMtimes: Map<string, number>;
}

/**
 * Read mtimes for all design files in the project's Decisions folder.
 * Used for cache invalidation — if any file has changed since the last
 * re-injection, we refresh even if fewer than REINJECTION_MIN_TURNS have
 * passed.
 */
async function readDesignFileMtimes(projectRoot: string): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const decisionsDir = join(projectRoot, 'Decisions');
  if (!existsSync(decisionsDir)) return result;

  const candidates = [
    join(decisionsDir, 'overview.md'),
    join(decisionsDir, 'context.md'),
    join(decisionsDir, 'design', 'palette.md'),
    join(decisionsDir, 'design', 'typography.md'),
    join(decisionsDir, 'design', 'voice.md'),
    join(decisionsDir, 'design', 'assets.md'),
  ];

  for (const path of candidates) {
    try {
      const s = await stat(path);
      result.set(path, s.mtimeMs);
    } catch { /* file doesn't exist — skip */ }
  }

  return result;
}

/**
 * Return true if any file's current mtime differs from the cached value,
 * or if the current map contains a file the cache doesn't know about.
 */
function hasAnyFileChanged(
  cached: Map<string, number>,
  current: Map<string, number>,
): boolean {
  if (cached.size === 0 && current.size > 0) return true;
  for (const [path, mtime] of current) {
    const cachedMtime = cached.get(path);
    if (cachedMtime === undefined) return true;
    if (cachedMtime !== mtime) return true;
  }
  return false;
}

/**
 * One-shot helper: given a project root, a file path the agent is about
 * to write to, and the per-Agent re-injection state, decide whether to
 * re-inject the design context and return the result (or null if no
 * injection is warranted).
 *
 * Throttling rules:
 *   (a) If the file path isn't a UI file → no injection
 *   (b) If the project has no Decisions folder → no injection
 *   (c) If fewer than REINJECTION_MIN_TURNS turns have passed since the
 *       last injection AND no design file has been modified since → no
 *       injection (avoids burning tokens on duplicate context reads when
 *       the agent writes many UI files back-to-back)
 *   (d) Otherwise: read the design files fresh, build the injection
 *       message, and return it along with the updated mtime map so the
 *       caller can store it as the new cache baseline.
 *
 * All I/O is best-effort; any error silently returns null.
 */
export async function maybeBuildDesignReinjection(
  projectRoot: string | undefined,
  filePath: string | undefined,
  state: ReinjectionState,
): Promise<ReinjectionResult | null> {
  if (!projectRoot || !filePath) return null;
  if (!isUIFilePath(filePath)) return null;

  try {
    const turnsSinceLast = state.currentTurn - state.lastInjectedTurn;
    const currentMtimes = await readDesignFileMtimes(projectRoot);

    // Nothing to inject if there are no design files at all
    if (currentMtimes.size === 0) return null;

    // Throttle: skip if too recent AND files haven't changed
    if (turnsSinceLast < REINJECTION_MIN_TURNS) {
      const filesChanged = hasAnyFileChanged(state.lastMtimes, currentMtimes);
      if (!filesChanged) return null;
    }

    const design = await loadFreshDesignContext(projectRoot);
    if (!design) return null;

    return {
      content: formatDesignReinjectionMessage(design),
      updatedMtimes: currentMtimes,
    };
  } catch {
    return null;
  }
}
