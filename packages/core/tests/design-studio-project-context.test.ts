import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDesignStudioPrefix } from '../src/agent/system-prompt.js';
import { loadFreshDesignContext } from '../src/agent/design-reinjection.js';

/**
 * The Designer reads the project.
 *
 * ASKED 2026-09-10: "the designer should be able to read a project especially
 * the decision folder." Until 2026-09-14 getDesignStudioPrefix had no slot for
 * it — the coding path loaded Decisions/ on every session and re-injected the
 * design files before every UI edit, while the one persona whose whole job is
 * the look designed from the brand kit alone.
 *
 * These pin the contract both surfaces rely on: the block is present exactly
 * when context is passed, it precedes the brand kit (the project is the more
 * specific of the two), and the reader that feeds it is the same one the
 * coding path uses — so there is one place to get this wrong, not two.
 */

const BRAND = 'Palette: primary #1e40af. Voice: calm, precise.';
const PROJECT = '**Palette (apply as law)** (`Decisions/design/palette.md`)\nprimary: #0d9488 (teal)';

describe('getDesignStudioPrefix — project context', () => {
  it('omits the project block entirely when no project is open', () => {
    const p = getDesignStudioPrefix('an icon please', BRAND, 'icon', undefined, null);
    expect(p).not.toContain('The project you\'re designing for');
    // And the pre-existing shape is untouched: kit, then request.
    expect(p.indexOf('## Their brand kit')).toBeLessThan(p.indexOf('## Their request'));
  });

  it('carries the Decisions content verbatim when a project is open', () => {
    const p = getDesignStudioPrefix('an icon please', BRAND, 'icon', undefined, PROJECT);
    expect(p).toContain('## The project you\'re designing for');
    expect(p).toContain(PROJECT);
  });

  it('places the project BEFORE the brand kit and BEFORE the request', () => {
    // Specific outranks general, and the request stays freshest. If someone
    // reorders these the Designer will read the kit as the last word.
    const p = getDesignStudioPrefix('an icon please', BRAND, 'icon', undefined, PROJECT);
    const proj = p.indexOf('## The project you\'re designing for');
    const kit = p.indexOf('## Their brand kit');
    const req = p.indexOf('## Their request');
    expect(proj).toBeGreaterThan(-1);
    expect(proj).toBeLessThan(kit);
    expect(kit).toBeLessThan(req);
  });

  it('tells her the project wins over the kit, and that reading it is not brand admin', () => {
    // Two rules the rest of the prefix would otherwise fight: "never stop a
    // make for brand admin" must not be read as "ignore the project", and a
    // kit/project conflict must resolve the same way every time.
    const p = getDesignStudioPrefix('an icon please', BRAND, 'icon', undefined, PROJECT);
    expect(p).toMatch(/the project wins/);
    expect(p).toMatch(/not brand admin/);
  });
});

describe('loadFreshDesignContext — the reader both surfaces hand her', () => {
  it('returns null for a project with no Decisions folder', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ava-design-'));
    try {
      expect(await loadFreshDesignContext(root)).toBeNull();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('reads overview and the design files, labelled as law', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ava-design-'));
    try {
      mkdirSync(join(root, 'Decisions', 'design'), { recursive: true });
      writeFileSync(join(root, 'Decisions', 'overview.md'), 'A coffee roastery in Leeds.');
      writeFileSync(join(root, 'Decisions', 'design', 'palette.md'), 'primary: #6b3f2a');
      const ctx = await loadFreshDesignContext(root);
      expect(ctx).toContain('A coffee roastery in Leeds.');
      expect(ctx).toContain('primary: #6b3f2a');
      expect(ctx).toContain('Palette (apply as law)');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
