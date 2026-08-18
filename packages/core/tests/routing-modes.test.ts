// Every surface must agree on what counts as a fleet.
//
// There was no runtime list — only a RoutingMode type — so each surface wrote
// its own check. The extension's included 'longxiang'. The IDE sidecar's did
// not, so choosing Longxiang there skipped the fleet branch, fell through to
// "resolve a specific model", and failed with "Model not found:
// platform:longxiang" — a name that was never a model id. Found by using it,
// not by reading it, because the surface that was right hid the one that
// wasn't.
//
// ROUTING_MODES is now the list AND the source of the type. A
// `readonly RoutingMode[]` would not have helped: it still typechecks with a
// member missing. Only deriving the type from the list makes forgetting one
// impossible.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTING_MODES, isRoutingMode } from '../src/auto/model-router.js';

describe('ROUTING_MODES', () => {
  it('holds every fleet we actually run', () => {
    // Named explicitly. If a fleet is added or retired this fails, which is
    // the moment to check the routers, the credit multipliers and the copy —
    // not something to silently update.
    expect([...ROUTING_MODES].sort()).toEqual(['aurora', 'auto', 'longxiang', 'supernova']);
  });

  it('accepts each one and rejects a raw model id', () => {
    for (const m of ROUTING_MODES) expect(isRoutingMode(m)).toBe(true);
    // The exact shape that broke: an alias with the platform prefix glued on.
    expect(isRoutingMode('platform:longxiang')).toBe(false);
    expect(isRoutingMode('kimi-k3')).toBe(false);
    expect(isRoutingMode('')).toBe(false);
    expect(isRoutingMode(undefined)).toBe(false);
    expect(isRoutingMode(null)).toBe(false);
  });

  it('has a router for every mode except auto', () => {
    // A fleet in the list with no routing table would resolve as a fleet and
    // then coordinate nothing. 'auto' is the default ladder and has no file.
    const dir = join(__dirname, '..', 'src', 'auto');
    const missing = ROUTING_MODES
      .filter((m) => m !== 'auto')
      .filter((m) => !existsSync(join(dir, `${m}-router.ts`)));
    expect(missing, `fleets with no router file: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('no surface keeps its own copy of the list', () => {
  // The whole point is one list. A surface that re-derives it by hand is how
  // this broke, so the shapes that did it are searched for directly.
  // SCANNED, not listed. The first version of this test named two files by
  // hand — and missed DashboardPages.tsx, which held TWO more copies of the
  // chain and was the one actually breaking Longxiang in the UI. A guard with
  // a hand-written list has the same flaw as the bug it guards against, which
  // is a lesson worth only learning once.
  const roots = [
    join(__dirname, '..', '..', 'ide', 'src'),
    join(__dirname, '..', '..', 'ide', 'sidecar'),
    join(__dirname, '..', '..', 'extension', 'src'),
    join(__dirname, '..', '..', 'extension', 'webview-ui', 'src'),
  ];

  function walk(dir: string, out: string[] = []): string[] {
    if (!existsSync(dir)) return out; // submodule not checked out
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(p, out);
      } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
        out.push(p);
      }
    }
    return out;
  }

  const files = roots.flatMap((r) => walk(r));

  /** Source with `//` comments removed.
   *
   *  Needed because the fix's own comment QUOTES the pattern it replaced, and
   *  the first version of this test flagged that comment as an offender. A
   *  guard a comment can trip is a guard a comment can also silence, so it
   *  reads code only. String literals are left alone — a fleet id in one is
   *  exactly what we are hunting. */
  const codeOnly = (src: string) =>
    src.split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s+\/\/.*$/, '')).join('\n');

  it('no surface anywhere hand-writes a fleet check', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (!existsSync(f)) continue; // submodule not checked out — not a failure
      const src = codeOnly(readFileSync(f, 'utf8'));
      // `x === 'aurora' || x === 'supernova'`-style chains, in either order.
      if (/===\s*'(aurora|supernova)'\s*\|\|[^\n]*===\s*'(aurora|supernova|auto)'/.test(src)) {
        offenders.push(f);
      }
    }
    expect(
      offenders,
      `These build a fleet list by hand instead of using isRoutingMode from core: ${offenders.join(', ')}. `
      + `That is exactly how 'longxiang' went missing from one surface and not the other.`,
    ).toEqual([]);
  });
});
