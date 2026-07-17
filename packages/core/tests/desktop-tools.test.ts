// Marketplace-compliance contract.
//
// Microsoft blocked the VS Code extension over the desktop-automation and
// browser-control tools and required their removal to reinstate it (v0.48.1,
// 2026-04-21). On 2026-07-17 an audit found they had been shipping again since
// some point: registerBuiltins() constructed all 12 on every surface, and the
// only thing between a marketplace user and a desktop_* schema was mode
// detection — which keys off a literal '[Desktop Automation Mode]' prefix in
// the user's own message text and had no idea which surface it ran on.
//
// These tests exist so that regression fails CI instead of shipping. If one
// breaks, do not "fix" it by loosening the assertion — a green suite here is a
// promise to a gatekeeper who has already pulled us once.

import { describe, it, expect } from 'vitest';
import { ToolRegistry, DESKTOP_TOOL_NAMES } from '../src/index.js';
import { createDesktopTools, registerDesktopTools } from '../src/tools/desktop-tools.js';

/** The extension's registry, built exactly as AvaViewProvider builds it. */
function extensionRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  reg.registerBuiltins({ exclude: [...DESKTOP_TOOL_NAMES], allowDesktopMode: false });
  return reg;
}

/** The IDE/CLI registry — full toolkit, distributed outside the marketplace. */
function fullRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  reg.registerBuiltins();
  registerDesktopTools(reg);
  return reg;
}

describe('desktop tools — marketplace compliance', () => {
  it('registerBuiltins does NOT construct desktop tools on any surface', () => {
    // The physical split: even with no exclude list, the base builtins must not
    // contain them, because that import graph is what reaches the VSIX bundle.
    const bare = new ToolRegistry();
    bare.registerBuiltins();
    for (const name of DESKTOP_TOOL_NAMES) {
      expect(bare.getTool(name), `${name} must not be a builtin`).toBeUndefined();
    }
  });

  it('the extension cannot reach a single desktop tool', () => {
    const reg = extensionRegistry();
    for (const name of DESKTOP_TOOL_NAMES) {
      expect(reg.getTool(name), `${name} reachable on the extension`).toBeUndefined();
    }
  });

  it('no desktop tool appears in the extension schemas sent to the model', () => {
    const names = new Set(extensionRegistry().getSchemas().map((s) => s.function.name));
    for (const name of DESKTOP_TOOL_NAMES) {
      expect(names.has(name), `${name} leaked into extension schemas`).toBe(false);
    }
  });

  it('switch_mode does not offer desktop as a target on the extension', () => {
    const schema = extensionRegistry().getTool('switch_mode')!.schema;
    const targets = (schema.parameters as { properties: { target_mode: { enum: string[] } } })
      .properties.target_mode.enum;
    expect(targets).not.toContain('desktop');
  });

  it('DESKTOP_TOOL_NAMES matches what createDesktopTools actually builds', () => {
    // Guards the drift that makes every other test here pass while a new tool
    // ships to the marketplace: add a tool to createDesktopTools, forget the
    // name here, and the exclude list silently misses it.
    const built = createDesktopTools().map((t) => t.name).sort();
    expect(built).toEqual([...DESKTOP_TOOL_NAMES].sort());
  });

  it('the IDE/CLI still get the full desktop toolkit', () => {
    // The flip side — the strip must not quietly disarm the IDE, whose whole
    // pitch is that it ships what the marketplace will not allow.
    const reg = fullRegistry();
    for (const name of DESKTOP_TOOL_NAMES) {
      expect(reg.getTool(name), `${name} missing from the IDE`).toBeDefined();
    }
    const schema = reg.getTool('switch_mode')!.schema;
    const targets = (schema.parameters as { properties: { target_mode: { enum: string[] } } })
      .properties.target_mode.enum;
    expect(targets).toContain('desktop');
  });
});
