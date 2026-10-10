// One video, many rooms.
//
// A clip goes to TikTok, Instagram, Shorts and Facebook as the SAME footage —
// the operator cuts it once in Canva, and all four are 1080x1920. What differs
// is the caption and the tags, and the tag policies barely overlap.
//
// Before this, the tool took a single platform, so covering four meant calling
// it four times: four identical storyboards and four identical voiceovers,
// paid for and generated, plus four times the exposure to the image rate limit
// that already drops a still now and then.
import { describe, it, expect } from 'vitest';
import { WriteVideoPostTool } from '../src/tools/write-video-post.js';
import type { VideoPostInput } from '../src/social/index.js';

const tool = new WriteVideoPostTool();
let written: VideoPostInput | null = null;
let writeCalls = 0;

const store = {
  write: async (post: VideoPostInput) => {
    written = post;
    writeCalls++;
    return {
      shots: (post.shots ?? []).map((p) => ({ url: 'https://x/1.jpg', prompt: p })),
      shotErrors: [],
      voiced: true,
    };
  },
};
const ctx = { cwd: '.', sharedState: { videoPostStore: store } } as never;

const SHOTS = ['frame 1: a hand reaches', 'frame 2: the pan at heat', 'frame 3: the plate'];

async function run(args: Record<string, unknown>) {
  written = null;
  writeCalls = 0;
  return tool.execute({ shots: SHOTS, ...args }, ctx);
}

describe('one video, one generation, a caption per platform', () => {
  it('takes every platform in a single call', async () => {
    const r = await run({
      posts: [
        { platform: 'tiktok', caption: 'short and muted', hashtags: ['terminalsetup'] },
        { platform: 'instagram', caption: 'the reel version', hashtags: ['cli', 'devsetup', 'terminal'] },
        { platform: 'youtube', caption: 'the shorts version', hashtags: ['Shorts', 'cli'] },
        { platform: 'facebook', caption: 'the plain-language version', hashtags: [] },
      ],
    });
    expect(r.success).toBe(true);
    // ONE write. Four calls would be four storyboards and four reads.
    expect(writeCalls).toBe(1);
    expect(written!.variants.map((v) => v.platform)).toEqual(['tiktok', 'instagram', 'youtube', 'facebook']);
  });

  it('keeps each platform its own caption and tags', async () => {
    await run({
      posts: [
        { platform: 'tiktok', caption: 'muted in two seconds', hashtags: ['terminalsetup'] },
        { platform: 'instagram', caption: 'a different piece of writing', hashtags: ['cli', 'devtools', 'terminal'] },
      ],
    });
    const [tiktok, instagram] = written!.variants;
    expect(tiktok.caption).toContain('muted in two seconds');
    expect(instagram.caption).toContain('a different piece of writing');
    expect(tiktok.hashtags).toEqual(['terminalsetup']);
    expect(instagram.hashtags).toEqual(['cli', 'devtools', 'terminal']);
  });

  it('shares the storyboard and the script across all of them', async () => {
    await run({
      // 22 words — well inside the band a 15-second clip is held to, with
      // room to stay there if the brand voice slows again. This test is
      // about the script being SHARED, not about the length rule.
      script: 'Ava runs in your terminal now. No editor, no window, just a prompt that answers and waits. Type ava in any project.',
      posts: [
        { platform: 'tiktok', caption: 'a' },
        { platform: 'facebook', caption: 'b' },
      ],
    });
    // The footage lives once on the input, not per variant — which is what
    // lets the store generate it a single time.
    expect(written!.shots).toEqual(SHOTS);
    expect(written!.script).toContain('Ava runs in your terminal now');
  });

  it('appends the tagline and the link to EVERY caption, not just the first', async () => {
    await run({
      posts: [
        { platform: 'tiktok', caption: 'one' },
        { platform: 'instagram', caption: 'two' },
      ],
    });
    for (const v of written!.variants) {
      expect(v.caption).toContain('avasupernova.com');
      expect(v.caption).toContain('Every plan is the whole product');
    }
  });

  it('checks each caption against ITS OWN platform limit', async () => {
    // Instagram caps at 2,200 and Facebook at 63,206, so the same caption can
    // be fine in one room and refused in the other. A single shared check
    // would have to use the smallest cap and would reject captions that are
    // perfectly legal where they are going.
    const long = 'x'.repeat(2_500);
    const r = await run({
      posts: [
        { platform: 'facebook', caption: long },
        { platform: 'instagram', caption: long },
      ],
    });
    expect(r.success).toBe(false);
    expect(r.output).toContain('instagram');
    expect(r.output).not.toContain('facebook caption is');
  });

  it('refuses a missing platform rather than guessing one', async () => {
    const r = await run({ posts: [{ caption: 'no home' }] });
    expect(r.success).toBe(false);
    expect(r.output).toContain('needs a platform');
  });

  it('refuses a platform it does not know', async () => {
    const r = await run({ posts: [{ platform: 'myspace', caption: 'hello' }] });
    expect(r.success).toBe(false);
    expect(r.output).toContain('myspace');
  });

  it('refuses two captions for the same platform', async () => {
    const r = await run({
      posts: [
        { platform: 'tiktok', caption: 'one' },
        { platform: 'tiktok', caption: 'two' },
      ],
    });
    expect(r.success).toBe(false);
    expect(r.output).toContain('tiktok');
  });

  it('names the platform that is missing a caption', async () => {
    const r = await run({
      posts: [
        { platform: 'tiktok', caption: 'fine' },
        { platform: 'facebook', caption: '' },
      ],
    });
    expect(r.success).toBe(false);
    expect(r.output).toContain('facebook');
  });

  it('still accepts the old single-platform shape', async () => {
    // A call already in flight when this shipped must not fail on the way
    // through.
    const r = await run({ platform: 'tiktok', caption: 'the legacy shape', hashtags: ['cli'] });
    expect(r.success).toBe(true);
    expect(written!.variants).toHaveLength(1);
    expect(written!.variants[0].platform).toBe('tiktok');
    expect(written!.variants[0].caption).toContain('the legacy shape');
  });
});
