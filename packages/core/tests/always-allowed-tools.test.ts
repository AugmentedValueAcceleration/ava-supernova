// self_inspect must reach Ava in EVERY mode.
//
// It was allowed in `work` and `plan` only. In the other ten modes the schema
// filter removed it and she would correctly tell the user she didn't have it —
// including in Chat, where "what can you do?" is the natural question and where
// the README promises she answers it by reading her own source.
//
// It is read-only by construction: it reads Ava's own source and deploy state,
// and cannot write, execute, or spend. Operator, 2026-07-17: "its always read
// only she can never effect the code that only for us to do here." So there is
// no mode where withholding it is correct.
//
// This test reads the real MODE_ALLOWED_TOOLS out of agent.ts rather than
// duplicating it, so adding a mode without self_inspect fails here instead of
// silently shipping a mode where Ava goes blind to herself.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ToolRegistry } from '../src/index.js';

const agentSrc = readFileSync(join(__dirname, '../src/agent/agent.ts'), 'utf8');

function parseNamedSet(name: string): string[] {
  const start = agentSrc.indexOf(`const ${name}`);
  if (start < 0) throw new Error(`${name} not found in agent.ts`);
  const block = agentSrc.slice(start, agentSrc.indexOf(']', start));
  return [...block.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
}

function parseModeAllowedTools(): Record<string, string[]> {
  const start = agentSrc.indexOf('const MODE_ALLOWED_TOOLS');
  const block = agentSrc.slice(start, agentSrc.indexOf('\n};', start));
  const out: Record<string, string[]> = {};
  for (const m of block.matchAll(/^\s{2}([a-z]+):\s*new Set\(\[([\s\S]*?)\]\),/gm)) {
    out[m[1]] = [...m[2].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
  }
  return out;
}

describe('always-allowed tools', () => {
  it('self_inspect is in the always-allowed set', () => {
    expect(parseNamedSet('ALWAYS_ALLOWED_TOOLS')).toContain('self_inspect');
  });

  it('self_inspect is a real, registered tool', () => {
    // The whole point is undermined if we always-allow a name that, like
    // generate_image, has never existed.
    const reg = new ToolRegistry();
    reg.registerBuiltins();
    expect(reg.getTool('self_inspect')).toBeDefined();
  });

  it('self_inspect survives the filter in every single mode', () => {
    const always = new Set(parseNamedSet('ALWAYS_ALLOWED_TOOLS'));
    const modes = parseModeAllowedTools();
    expect(Object.keys(modes).length).toBeGreaterThan(5); // sanity: parser worked

    for (const [mode, allowed] of Object.entries(modes)) {
      // Mirrors the real filter: modeAllowed.has(name) || ALWAYS_ALLOWED.has(name)
      const reaches = allowed.includes('self_inspect') || always.has('self_inspect');
      expect(reaches, `self_inspect cannot reach Ava in ${mode} mode`).toBe(true);
    }
  });

  it('every always-allowed tool actually exists', () => {
    const reg = new ToolRegistry();
    reg.registerBuiltins();
    for (const name of parseNamedSet('ALWAYS_ALLOWED_TOOLS')) {
      expect(reg.getTool(name), `${name} is always-allowed but does not exist`).toBeDefined();
    }
  });
});
