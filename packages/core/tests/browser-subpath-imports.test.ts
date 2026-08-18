// A browser surface must reach into core through a SUBPATH, never the root barrel.
//
// `@ava/core` re-exports the whole library: the agent, the providers, the tool
// registry, the history store — code that opens files, reads env vars and talks
// to the network. Pulling that into a renderer bundle costs a great deal of
// weight for whatever one function was wanted, and drags Node built-ins into a
// place that has none of them.
//
// The subpaths exist precisely so this cannot happen: ./dates, ./models,
// ./routing-modes, ./health/*, ./billing and the rest are narrow leaves. At the
// time of writing the IDE renderer reaches core 32 times and every one of them
// is a subpath, which is exactly right — and entirely by hand, with nothing
// keeping it that way.
//
// routing-modes.ts is the cautionary tale. It exists as its own dependency-free
// file because the fleet list had been copied by hand into three places that
// could not cheaply import it. Reachability shapes what people write; when the
// cheap path is wrong, the wrong thing gets written.
//
// Node-side surfaces (the extension host, the CLI, the sidecar) are deliberately
// NOT covered. They run on Node, the barrel is the convenient entry point there,
// and there is no bundle to protect.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');

/** Renderer/webview code only — everything here ships to a browser. */
const BROWSER_ROOTS = [
  join(repoRoot, 'packages', 'ide', 'src'),
  join(repoRoot, 'packages', 'extension', 'webview-ui', 'src'),
  join(repoRoot, 'packages', 'extension', 'dashboard-ui', 'src'),
];

/** Walk rather than list files by hand — a hand-written file list is how the
 *  Longxiang guard missed the one file that was actually broken. */
function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Lines importing the ROOT barrel — `@ava/core` with no subpath after it. */
function rootBarrelImports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return src
    .split('\n')
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    // Skip comments — this file's own prose mentions the pattern it forbids,
    // and a guard that flags its own explanation has happened here before.
    .filter(({ line }) => !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*'))
    .filter(({ line }) => /from\s+['"]@ava\/core['"]/.test(line))
    .map(({ line, n }) => `${n}: ${line}`);
}

describe('browser surfaces import core through subpaths only', () => {
  for (const root of BROWSER_ROOTS) {
    const label = root.split(sep).slice(-3).join('/');

    it(`${label} never imports the root barrel`, () => {
      const files = sourceFiles(root);
      if (files.length === 0) return; // submodule not checked out

      const offenders: string[] = [];
      for (const file of files) {
        for (const hit of rootBarrelImports(file)) {
          const rel = file.replace(repoRoot, '').split(sep).join('/');
          offenders.push(`${rel}  ${hit}`);
        }
      }

      expect(
        offenders,
        `These import the whole of @ava/core into a browser bundle:\n  ${offenders.join('\n  ')}\n` +
        'Use a narrow subpath instead (@ava/core/dates, /models, /routing-modes, /health/*, /billing …). ' +
        'If none fits, add one to the exports map in packages/core/package.json rather than reaching for the barrel.',
      ).toEqual([]);
    });
  }

  it('finds real files to check, so a silent pass means something', () => {
    // Without this the suite would go green if the walker broke or every path
    // were wrong — the failure mode of any test that scans for absence.
    const total = BROWSER_ROOTS.map(sourceFiles).reduce((n, f) => n + f.length, 0);
    if (!existsSync(BROWSER_ROOTS[0])) return; // submodules absent
    expect(total).toBeGreaterThan(20);
  });
});
