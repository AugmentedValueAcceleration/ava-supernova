import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../src/tools/tool-registry.js';

/**
 * Image, video and voice generation spend the user's Qwen key. Without one the
 * tools are withheld from the model, so Ava never offers to make something she
 * cannot (his call, 2 Nov 2026). Logos are drawn on the user's machine and
 * need no key.
 */
// The live media tools — Ava makes images, video and voice through the Design
// Studio. (The standalone generate_image / _video / _voice classes are not
// registered on any surface.)
const QWEN_TOOLS = [
  'design_generate_icon', 'design_generate_set', 'design_generate_image',
  'design_generate_video', 'design_generate_voice',
];

const names = (reg: ToolRegistry, state?: Record<string, unknown>) =>
  new Set(reg.getSchemas(state).map((s) => s.function.name));

describe('tools that spend a Qwen key', () => {
  const reg = new ToolRegistry();
  reg.registerBuiltins();

  it('are withheld when there is no Qwen key', () => {
    const shown = names(reg, { getProviderKey: (p: string) => (p === 'mistral' ? 'k' : undefined) });
    for (const t of QWEN_TOOLS) expect(shown.has(t), t).toBe(false);
    // Logos and brand kits need no key.
    expect(shown.has('design_generate_logo')).toBe(true);
    expect(shown.has('design_brand_kit')).toBe(true);
  });

  it('are offered when there is one', () => {
    const shown = names(reg, { getProviderKey: (p: string) => (p === 'qwen' ? 'k' : undefined) });
    for (const t of QWEN_TOOLS) expect(shown.has(t), t).toBe(true);
    // The IDE's older field counts too.
    const legacy = names(reg, { qwenApiKey: 'k' });
    for (const t of QWEN_TOOLS) expect(legacy.has(t), t).toBe(true);
  });

  it('every one of them declares the Qwen key', () => {
    for (const t of QWEN_TOOLS) expect(reg.getTool(t)?.requiresProviderKey, t).toBe('qwen');
  });
});
