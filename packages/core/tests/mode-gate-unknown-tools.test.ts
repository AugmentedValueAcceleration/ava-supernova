// An unknown tool is not a refused tool.
//
// MODE_ALLOWED_TOOLS answers "does this mode want this tool?" for the tools it
// knows. For a tool that appears in no mode's list it answers nothing, and an
// empty answer was read as "no": the tool was cut from the schemas AND refused
// if the model asked for it, with no error and no log line anywhere.
//
// It went unnoticed because every shipped tool is a built-in that some mode
// lists, so nothing user-facing could hit it. What hit it was the dataset
// event tests, which register their own `echo` tool and send an untagged
// message - untagged means code mode, and code mode began enforcing on
// 2026-09-01. Ten tests failed reporting missing tool events, which was true
// but was the symptom: the tool never ran at all.
//
// The same absence is what every MCP server tool will look like, since their
// names cannot be known in advance to be put on a list.
import { describe, it, expect } from 'vitest';
import { toolPassesModeGate, DESKTOP_TOOL_NAMES } from '../src/agent/agent.js';

// Stand-in for a mode's allowlist: names that ARE classified, since every one
// of these appears in some mode's list in agent.ts.
const WORK_LIKE = new Set(['read', 'write', 'edit']);

describe('mode gate: the three ways through', () => {
  it('allows a tool the mode lists', () => {
    expect(toolPassesModeGate('read', WORK_LIKE)).toBe(true);
  });

  it('allows a tool every mode gets, even when the mode omits it', () => {
    expect(toolPassesModeGate('self_inspect', WORK_LIKE)).toBe(true);
    expect(toolPassesModeGate('conversation_recall', WORK_LIKE)).toBe(true);
  });

  it('allows a tool no mode classifies', () => {
    // The MCP case, and the one the dataset tests hit. Nothing has ever
    // decided about this name, so there is no decision to enforce.
    expect(toolPassesModeGate('echo', WORK_LIKE)).toBe(true);
    expect(toolPassesModeGate('some_third_party_tool', WORK_LIKE)).toBe(true);
  });

  it('still withholds a tool another mode classifies but this one omits', () => {
    // The gate's actual job: journal_write belongs to Chat, not to code mode.
    // If this passes, the exemption has swallowed the allowlist whole and the
    // ~25K tokens a coding turn spent on unrelated schemas are back.
    expect(toolPassesModeGate('journal_write', WORK_LIKE)).toBe(false);
  });

  it('keeps desktop tools out however they are classified', () => {
    // "Desktop tools stay out on both branches" - the one restriction the old
    // fallback did apply, and called load-bearing where it is written.
    for (const name of DESKTOP_TOOL_NAMES) {
      expect(toolPassesModeGate(name, WORK_LIKE)).toBe(false);
    }
  });
});
