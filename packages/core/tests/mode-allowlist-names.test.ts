// Every name in MODE_ALLOWED_TOOLS must be a tool that actually exists.
//
// A mode's allowlist is the only thing standing between Ava and a tool, so a
// name that no longer resolves is a silently removed capability: the mode
// keeps "listing" the tool, the schema filter drops it because the registry
// has nothing by that name, and Ava correctly reports she doesn't have it.
// Nothing fails, nothing logs, and the mode is quietly poorer than its own
// prompt claims.
//
// This is not hypothetical — 'generate_image' and 'generate_video' were
// renamed to 'design_generate_*' and had to be removed from four modes by
// hand. Nothing would have caught it if one had been missed.
//
// The parser strips comments FIRST. The allowlists carry explanatory comments
// that quote tool names ("'generate_image' used to sit here"), and a parser
// that reads those as entries reports removed names as live ones. I made
// exactly that mistake twice while writing this, which is why it is a comment
// and a test rather than a note in a plan.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ToolRegistry, DESKTOP_TOOL_NAMES } from '../src/index.js';
import { registerDesktopTools } from '../src/tools/desktop-tools.js';

const raw = readFileSync(join(__dirname, '../src/agent/agent.ts'), 'utf8');
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function parseAllowlists(): Record<string, string[]> {
  const start = src.indexOf('const MODE_ALLOWED_TOOLS');
  if (start < 0) throw new Error('MODE_ALLOWED_TOOLS not found');
  const block = src.slice(start, src.indexOf('\n};', start));
  const out: Record<string, string[]> = {};
  for (const m of block.matchAll(/^\s{2}([a-z]+):\s*new Set\(\[([\s\S]*?)\]\),/gm)) {
    out[m[1]] = [...m[2].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
  }
  return out;
}

// Desktop tools are registered by registerDesktopTools, not registerBuiltins —
// the opt-in half of the two-lock design that keeps them out of the VS Code
// extension entirely. Register them here so desktop's list can be checked
// like every other mode's rather than exempted from the rule.
function fullRegistry(): Set<string> {
  const reg = new ToolRegistry();
  reg.registerBuiltins();
  registerDesktopTools(reg);
  return new Set(reg.getSchemas().map((s: { function: { name: string } }) => s.function.name));
}

describe('mode allowlists name real tools', () => {
  const lists = parseAllowlists();
  const real = fullRegistry();

  it('parses every mode', () => {
    // Guards the parser itself: a formatting change that stopped it matching
    // would make every assertion below vacuously pass.
    expect(Object.keys(lists).length).toBeGreaterThanOrEqual(12);
    expect(lists.work?.length).toBeGreaterThan(30);
  });

  it('strips comments before reading names', () => {
    expect(src).not.toContain('used to sit here');
  });

  for (const [mode, names] of Object.entries(parseAllowlists())) {
    it(`${mode}: every listed tool is registered`, () => {
      const missing = names.filter((n) => !real.has(n));
      expect(missing, `${mode} lists unregistered tool(s): ${missing.join(', ')}`).toEqual([]);
    });
  }

  it('desktop names are real tools, not just a naming convention', () => {
    for (const n of DESKTOP_TOOL_NAMES) expect(real.has(n)).toBe(true);
  });
});
