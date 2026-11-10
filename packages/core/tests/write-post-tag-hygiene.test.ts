// Tags that break once posted, and the same card written twice (Posts fresh
// start, 10 Nov 2026). Both happened on real posts: "#local-first" went out as
// "#local", a Discord message was tagged "#help", and one LinkedIn post was
// written three times on 4 Nov.
import { describe, it, expect } from 'vitest';
import { WritePostTool } from '../src/tools/write-post.js';
import { tagProblems, camelTag } from '../src/social/index.js';
import type { SocialPostInput } from '../src/social/index.js';

function tool() {
  const written: SocialPostInput[] = [];
  const postStore = {
    write: async (p: SocialPostInput) => { written.push(p); return { id: `p${written.length}`, assetId: null }; },
    recent: async () => [],
  };
  const sharedState: Record<string, unknown> = { postStore };
  const t = new WritePostTool();
  return { written, run: (args: Record<string, unknown>) => t.execute(args, { cwd: '.', sharedState } as never) };
}

describe('tag hygiene', () => {
  it('writes multi-word tags in CamelCase', () => {
    expect(camelTag('local-first')).toBe('LocalFirst');
    expect(camelTag('#build in public')).toBe('BuildInPublic');
  });

  it('flags a hyphenated tag in the text, which posts cut short', () => {
    const p = tagProblems(['local'], 'Your memory stays put. #local-first');
    expect(p.join(' ')).toMatch(/posts as "#local"/);
    expect(p.join(' ')).toMatch(/#LocalFirst/);
  });

  it('flags a declared tag with a space or hyphen, a repeat, and a channel name', () => {
    expect(tagProblems(['local-first'], '').join(' ')).toMatch(/#LocalFirst/);
    expect(tagProblems(['b3d', 'B3D'], '').join(' ')).toMatch(/twice/);
    expect(tagProblems(['help'], '').join(' ')).toMatch(/Discord channel/);
  });

  it('passes clean tags', () => {
    expect(tagProblems(['b3d', 'GameDev', 'Blender3D'], 'Built in Blender. #b3d #GameDev')).toEqual([]);
  });

  it('refuses a post with a broken tag, and writes nothing', async () => {
    const t = tool();
    const r = await t.run({ platform: 'bluesky', content: 'Memory stays on your machine. #local-first', hashtags: ['local-first'] });
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/LocalFirst/);
    expect(t.written).toHaveLength(0);
  });
});

describe('no duplicate cards', () => {
  const args = { platform: 'linkedin', subject: 'the disclosure gap', content: 'A post about it. #OpenSource', hashtags: ['OpenSource'] };

  it('refuses the same platform and subject twice in a row', async () => {
    const t = tool();
    expect((await t.run(args)).success).toBe(true);
    const again = await t.run(args);
    expect(again.success).toBe(false);
    expect(again.output).toMatch(/already wrote/);
    expect(t.written).toHaveLength(1);
  });

  it('refuses a second post for the platform even when the subject is reworded', async () => {
    const t = tool();
    await t.run(args);
    const again = await t.run({ ...args, subject: 'Disclosure gap, reworded' });
    expect(again.success).toBe(false);
    expect(t.written).toHaveLength(1);
  });

  it('allows a named other version', async () => {
    const t = tool();
    await t.run(args);
    expect((await t.run({ ...args, variant: 'shorter' })).success).toBe(true);
    expect(t.written).toHaveLength(2);
  });

  it('allows the same subject on another platform', async () => {
    const t = tool();
    await t.run(args);
    expect((await t.run({ ...args, platform: 'facebook' })).success).toBe(true);
  });
});
