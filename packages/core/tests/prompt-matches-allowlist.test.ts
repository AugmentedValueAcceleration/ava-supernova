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
  getWorkModePrefix,
} from '../src/agent/system-prompt.js';
import { readOnlyModeToolCeiling, modeCanEditFiles } from '../src/agent/agent.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  ['work', getWorkModePrefix],
];

/**
 * Work's allowlist, read out of agent.ts.
 *
 * readOnlyModeToolCeiling only answers for read-only modes, and work is the
 * one editing mode whose prompt now advertises a specific list — so it needs
 * checking against the same source the schema filter uses. Comments are
 * stripped first: the allowlists carry explanatory comments that quote tool
 * names, and reading those as entries makes removed names look live.
 */
function workCeiling(): Set<string> {
  const raw = readFileSync(join(__dirname, '../src/agent/agent.ts'), 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const block = src.slice(src.indexOf('const MODE_ALLOWED_TOOLS'));
  const work = /^  work: new Set\(\[([\s\S]*?)\]\),/m.exec(block)!;
  const names = [...work[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  const aStart = src.indexOf('const ALWAYS_ALLOWED_TOOLS');
  const always = [...src.slice(aStart, src.indexOf(']', aStart)).matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  return new Set([...names, ...always]);
}

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

  it('work advertises only tools work is offered', () => {
    // Work's allowlist reached the schema filter on 2026-08-25 (it had never
    // once applied before, because code mode carried no tag). The moment it
    // enforces, anything this prompt names that is not on the list becomes a
    // refusal in the middle of a coding turn — she follows her own
    // instructions and the call is blocked.
    const ceiling = workCeiling();
    const unreachable = advertised(getWorkModePrefix('x')).filter((t) => real.has(t) && !ceiling.has(t));
    expect(
      unreachable,
      `work's prompt names tools outside MODE_ALLOWED_TOOLS.work: ${unreachable.join(', ')}`,
    ).toEqual([]);
  });

  for (const [mode, fn] of MODES) {
    // The read-only modes have a ceiling to check against. The editing modes
    // are handled above (work) or have no advertised list to clamp.
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
