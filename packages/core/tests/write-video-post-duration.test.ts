// The script has to fit the clip that will actually render.
//
// We hand Wan a finished audio file, so there is no way to offset when speech
// starts — the only lever is making the line short enough to sit inside the
// picture. A voice still talking after the clip stops is the most obviously
// broken thing a short can do.
//
// The word rates here are MEASURED, not assumed: qwen3-tts-instruct-flash on
// the Maia brand voice, timed off returned WAV headers. 2.41 words/sec at the
// slowest. Those numbers belong to that voice — if AVA_BRAND_VOICE changes they
// must be re-measured, not carried over.
//
// The window used to be a single hard-coded 17-22, which only made sense for a
// 10-second clip because 10 seconds was the only length available. Now that
// clips run to 30, the rule scales — and the test that matters most is that at
// 10 seconds it still produces exactly 17-22, so the thing that was learned the
// hard way was generalised rather than replaced.
import { describe, it, expect } from 'vitest';
import { WriteVideoPostTool } from '../src/tools/write-video-post.js';

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
}

const tool = new WriteVideoPostTool();
const store = { write: async () => ({ id: 'x', path: 'x.mp4' }) };
const ctx = { cwd: '.', sharedState: { videoPostStore: store } } as never;

async function attempt(args: Record<string, unknown>) {
  return tool.execute(
    { platform: 'tiktok', visual: 'a still shot', caption: 'a caption', ...args },
    ctx,
  );
}

describe('the voiced word window scales with the clip', () => {
  it('a 10s clip still demands 17-22 words, exactly as measured', async () => {
    const tooShort = await attempt({ duration: 10, script: words(16) });
    expect(tooShort.success).toBe(false);
    expect(tooShort.output).toContain('17-22');

    const tooLong = await attempt({ duration: 10, script: words(23) });
    expect(tooLong.success).toBe(false);
    expect(tooLong.output).toContain('will not fit');

    expect((await attempt({ duration: 10, script: words(20) })).success).toBe(true);
  });

  it('a 30s clip takes a genuinely longer script', async () => {
    // ~55-71 words. A different kind of writing, not a longer version of the
    // same one — which is the point of offering the length at all.
    expect((await attempt({ duration: 30, script: words(65) })).success).toBe(true);
    expect((await attempt({ duration: 30, script: words(20) })).success).toBe(false);
  });

  it('a 15s clip sits between the two', async () => {
    expect((await attempt({ duration: 15, script: words(30) })).success).toBe(true);
    // 22 words filled a 10s clip; in a 15s clip it leaves a third silent.
    expect((await attempt({ duration: 15, script: words(22) })).success).toBe(false);
  });
});

describe('the ceilings are the models’ own', () => {
  it('a food video is capped at 15, because it animates our photograph', async () => {
    // Naming a recipe means image-to-video on wan2.7-i2v, which stops at 15s.
    // A script sized for 30 would overrun the clip that actually renders.
    const r = await attempt({ duration: 30, recipe: 'miso aubergine', script: words(65) });
    expect(r.success).toBe(false);
    expect(r.output).toContain('15s clip');
  });

  it('everything else reaches 30', async () => {
    const r = await attempt({ duration: 45, script: words(65) });
    expect(r.success).toBe(true);
  });
});

describe('a voiced clip is never five seconds', () => {
  it('asking for 5 with a script is raised to 10, not rejected', async () => {
    // The window at 5s is empty: every script short enough to fit is too short
    // for Wan to accept as audio at all. Learned when a six-word line killed
    // every food video with a generic "generation failed".
    const r = await attempt({ duration: 5, script: words(20) });
    expect(r.success).toBe(true);
  });

  it('a silent clip may be short', async () => {
    expect((await attempt({ duration: 5 })).success).toBe(true);
  });
});
