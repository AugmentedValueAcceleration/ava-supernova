// Posts always carry tags (the operator's rule, 1 Nov 2026) — every platform
// except Reddit and Discord, where hashtags do nothing or read as spam. Cards
// kept arriving with none, so it is refused at the tool, not asked for.
import { describe, it, expect } from 'vitest';
import { WritePostTool } from '../src/tools/write-post.js';
import { tagsIn } from '../src/social/index.js';
import type { SocialPostInput } from '../src/social/index.js';

function run(args: Record<string, unknown>) {
  const written: SocialPostInput[] = [];
  const postStore = {
    write: async (p: SocialPostInput) => { written.push(p); return { id: 'p1', assetId: null }; },
    recent: async () => [],
  };
  const ctx = { cwd: '.', sharedState: { postStore } } as never;
  return new WritePostTool().execute(args, ctx).then((r) => ({ r, written }));
}

describe('tags always', () => {
  it('refuses an untagged X post and says why', async () => {
    const { r, written } = await run({ platform: 'tweet', content: 'We shipped a Talk switch today.' });
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/no hashtags/i);
    expect(written).toHaveLength(0);
  });

  it('accepts tags written into the content, and keeps them as tags', async () => {
    const { r, written } = await run({ platform: 'bluesky', content: 'Talk before you build. #buildinpublic #opensource' });
    expect(r.success).toBe(true);
    expect(written[0].hashtags).toEqual(['buildinpublic', 'opensource']);
  });

  it('accepts the declared array', async () => {
    const { r } = await run({ platform: 'linkedin', content: 'A note on planning out loud.', hashtags: ['#devtools', 'opensource'] });
    expect(r.success).toBe(true);
  });

  it('leaves Reddit and Discord untagged', async () => {
    expect((await run({ platform: 'reddit', title: 'We added a Talk switch', content: 'Here is why.' })).r.success).toBe(true);
    expect((await run({ platform: 'discord', content: 'New in the extension today.' })).r.success).toBe(true);
  });

  it('does not mistake a heading or a channel for a tag', () => {
    expect(tagsIn([], 'Step #1 is done')).toEqual([]);
    expect(tagsIn([], 'see #1')).toEqual([]);
  });
});
