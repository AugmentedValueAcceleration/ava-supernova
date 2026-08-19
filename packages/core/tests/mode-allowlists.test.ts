// Every tool named in a mode's allowlist must exist in the registry.
//
// MODE_ALLOWED_TOOLS filters the schemas the model is offered. A name that no
// longer exists does not error — it simply matches nothing, so the tool it was
// meant to allow is silently withheld.
//
// On 2026-08-19 that had happened to every mode at once. `file_read`,
// `file_write` and `file_edit` were renamed to `read`, `write` and `edit`, and
// the allowlists kept the old names — so NO MODE THAT FILTERS COULD OPEN A
// FILE. Plan mode is "research the codebase and propose": it offered 21 tools,
// had glob and grep, and could not read what it found.
//
// Work mode escaped only by accident. It has no prefix, so the filter never
// runs and it gets everything minus the desktop tools. That is also why nobody
// noticed: the mode where most work happens is the one mode this cannot break.
//
// Comments are stripped before parsing. The block explains that `generate_image`
// USED to be listed, and a checker that reads its own explanation as data
// reports six faults that do not exist — which is exactly what happened while
// writing this.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import { registerDesktopTools } from '../src/tools/desktop-tools.js';

/** Every tool name the registry can actually produce, desktop included. */
function registeredToolNames(): Set<string> {
  const registry = new ToolRegistry();
  registry.registerBuiltins();
  registerDesktopTools(registry);
  return new Set(registry.getSchemas().map((s) => s.function.name));
}

/** The allowlists, parsed from source — they are a module-private literal. */
function modeAllowlists(): Record<string, string[]> {
  const src = readFileSync(join(__dirname, '..', 'src', 'agent', 'agent.ts'), 'utf8');
  const start = src.indexOf('const MODE_ALLOWED_TOOLS');
  const body = src
    .slice(start, src.indexOf('\n};', start))
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  const out: Record<string, string[]> = {};
  for (const m of body.matchAll(/\n {2}(\w+):\s*new Set\(\[([\s\S]*?)\]\)/g)) {
    out[m[1]] = [...m[2].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]);
  }
  return out;
}

const ALWAYS_ALLOWED = new Set(['self_inspect', 'conversation_recall']);

describe('mode allowlists name real tools', () => {
  const registered = registeredToolNames();
  const lists = modeAllowlists();

  it('parses the allowlists, so a silent pass means something', () => {
    expect(Object.keys(lists).length).toBeGreaterThanOrEqual(10);
    expect(registered.size).toBeGreaterThan(100);
  });

  for (const [mode, tools] of Object.entries(modeAllowlists())) {
    it(`${mode} names no tool that does not exist`, () => {
      const dead = tools.filter((t) => !registered.has(t));
      expect(
        dead,
        `${mode} allows ${dead.join(', ')} — no such tool. The name matches nothing, ` +
        'so the tool it was meant to allow is silently withheld from that mode.',
      ).toEqual([]);
    });
  }
});

describe('modes that edit files can reach the file tools', () => {
  const registered = registeredToolNames();
  const lists = modeAllowlists();
  const offers = (mode: string, tool: string) =>
    lists[mode]?.includes(tool) || ALWAYS_ALLOWED.has(tool);

  // Read-only by design: Plan proposes, Security audits. Both must still READ.
  for (const mode of ['plan', 'security']) {
    it(`${mode} can read but not write`, () => {
      expect(offers(mode, 'read'), `${mode} cannot open a file`).toBe(true);
      expect(offers(mode, 'write'), `${mode} should be read-only`).toBe(false);
      expect(offers(mode, 'edit'), `${mode} should be read-only`).toBe(false);
    });
  }

  // These change files, so they need the full set.
  for (const mode of ['work', 'teach', 'write']) {
    it(`${mode} can read, write and edit`, () => {
      for (const tool of ['read', 'write', 'edit']) {
        expect(offers(mode, tool), `${mode} cannot ${tool} a file`).toBe(true);
      }
    });
  }

  it('work can ask for its own verification', () => {
    // The pre-closure guard constructs verify_change directly, so verify runs
    // whether or not it is offered. It should still be reachable by name in the
    // mode that edits code — and its absence from every list is what made the
    // last audit read this as a landmine rather than a live fault.
    expect(offers('work', 'verify_change')).toBe(true);
  });

  it('chat and brainstorm get no file tools at all', () => {
    for (const mode of ['chat', 'brainstorm']) {
      for (const tool of ['read', 'write', 'edit']) {
        expect(offers(mode, tool), `${mode} should not touch files`).toBe(false);
      }
    }
  });
});
