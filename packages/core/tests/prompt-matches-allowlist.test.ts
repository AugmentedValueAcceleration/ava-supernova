// A mode prompt must not advertise a tool the mode does not have.
//
// Every mode prefix opens with a "## Tools available" line, and the registry
// filters by MODE_ALLOWED_TOOLS. Two hand-maintained lists of the same fact,
// and nothing checks that they agree.
//
// Both failure directions are quiet and both are bad:
//
//   advertised but not offered — she is told to call something that is not on
//   the schema list, tries, and the call is refused. The user sees her fail at
//   a thing her own instructions told her to do.
//
//   offered but not advertised — a capability the mode has and she never
//   reaches for, because nothing told her it was there.
//
// The second is looser by design (the prose is a summary, not an inventory),
// so only the first is enforced. This was the open item 3.2 from the work-room
// review on 2026-08-19, written when the brainstorm prefix gained tools on
// 2026-08-20.

import { describe, it, expect } from 'vitest';
import {
  getPlanModePrefix,
  getChatModePrefix,
  getBrainstormModePrefix,
  getSecurityModePrefix,
  getWriteModePrefix,
  getTeachModePrefix,
} from '../src/agent/system-prompt.js';
import { readOnlyModeToolCeiling, modeCanEditFiles } from '../src/agent/agent.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';

/** Every tool the registry can produce. */
function registered(): Set<string> {
  const r = new ToolRegistry();
  r.registerBuiltins();
  return new Set(r.getSchemas().map((s) => s.function.name));
}

/** The names listed under "## Tools available" in a prefix. */
function advertised(prefix: string): string[] {
  const m = /## Tools available\s*\n([^\n]+)/.exec(prefix);
  if (!m) return [];
  return m[1]
    .replace(/\.$/, '')
    .split(',')
    .map((s) => s.trim())
    // Prose creeps into some lists, e.g. "document_manage (spreadsheets/CSV)".
    .map((s) => s.replace(/\s*\(.*$/, '').trim())
    .filter((s) => /^[a-z][a-z0-9_]*$/.test(s));
}

const MODES: Array<[string, (t: string) => string]> = [
  ['plan', getPlanModePrefix],
  ['chat', getChatModePrefix],
  ['brainstorm', getBrainstormModePrefix],
  ['security', getSecurityModePrefix],
  ['write', getWriteModePrefix],
  ['teach', getTeachModePrefix],
];

describe('what a mode promises, it can actually do', () => {
  const real = registered();

  it('finds tool lists in the prefixes, so a silent pass means something', () => {
    for (const [mode, fn] of MODES) {
      expect(advertised(fn('x')).length, `${mode} has no readable tool list`).toBeGreaterThan(3);
    }
  });

  for (const [mode, fn] of MODES) {
    it(`${mode} advertises only tools that exist`, () => {
      // The dead-name trap: a renamed tool leaves the prose naming a ghost.
      const ghosts = advertised(fn('x')).filter((t) => !real.has(t));
      expect(
        ghosts,
        `${mode}'s prompt names tools that are not in the registry: ${ghosts.join(', ')}`,
      ).toEqual([]);
    });
  }

  for (const [mode, fn] of MODES) {
    // Only the read-only modes have a ceiling to check against — the editing
    // modes deliberately have none, because work's allowlist has never applied
    // and clamping to it would enforce a list nobody has verified.
    if (modeCanEditFiles(mode)) continue;
    it(`${mode} advertises only tools it is actually offered`, () => {
      const ceiling = readOnlyModeToolCeiling(mode)!;
      const unreachable = advertised(fn('x')).filter((t) => real.has(t) && !ceiling.has(t));
      expect(
        unreachable,
        `${mode}'s prompt tells her to use tools the mode withholds, so the call ` +
        `is refused when she follows her own instructions: ${unreachable.join(', ')}`,
      ).toEqual([]);
    });
  }
});
