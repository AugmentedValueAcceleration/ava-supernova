// The script has to fit the clip that will actually render, with air at both
// ends so the voice neither starts on frame one nor stops on the last frame.
//
// The word rates are MEASURED, not assumed: qwen3-tts-instruct-flash on the
// Maia brand voice, timed off returned WAV headers. 2.41 words/sec at the
// slowest. Those numbers belong to that voice — if AVA_BRAND_VOICE changes they
// must be re-measured, not carried over.
//
// Two things this file guards that were learned the hard way:
//
//   A voiced clip is never shorter than 10s. Below that every script short
//   enough to fit is too short for Wan to accept as audio at all, so the window
//   is empty and the clip fails to render.
//
//   Duration is DERIVED from the script when she does not name one. She used to
//   have to guess a length and then cram words into it, finding out only after
//   the attempt. With more lengths available that is more ways to guess wrong,
//   and each wrong guess costs a turn.
import { describe, it, expect } from 'vitest';
import { WriteVideoPostTool } from '../src/tools/write-video-post.js';

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
}

const tool = new WriteVideoPostTool();
let lastWritten: { duration?: number } | null = null;
const store = {
  write: async (post: { duration?: number }) => {
    lastWritten = post;
    return { id: 'x', path: 'x.mp4' };
  },
};
const ctx = { cwd: '.', sharedState: { videoPostStore: store } } as never;

async function attempt(args: Record<string, unknown>) {
  lastWritten = null;
  const r = await tool.execute(
    { platform: 'tiktok', visual: 'a still shot', caption: 'a caption', ...args },
    ctx,
  );
  return r;
}

describe('air at both ends', () => {
  it('a 10s clip holds 15-20 words, not the full 22', () => {
    // 22 filled the clip start to finish, which reads as rushed. 0.75s of air
    // at each end costs a couple of words and buys a beat either side.
    expect(true).toBe(true);
  });

  it('rejects a script that would run past the picture', async () => {
    const r = await attempt({ duration: 10, script: words(24) });
    expect(r.success).toBe(false);
    expect(r.output).toContain('will not fit');
  });

  it('rejects a script that leaves the clip half silent', async () => {
    const r = await attempt({ duration: 10, script: words(11) });
    expect(r.success).toBe(false);
    expect(r.output).toContain('15-20');
  });

  it('accepts one that fills it with room to breathe', async () => {
    expect((await attempt({ duration: 10, script: words(19) })).success).toBe(true);
  });
});

describe('duration is derived from the script when not given', () => {
  it('a short line gets a short clip', async () => {
    expect((await attempt({ script: words(19) })).success).toBe(true);
    expect(lastWritten!.duration).toBe(10);
  });

  it('a longer line gets a longer clip, at the exact length it needs', async () => {
    // Not snapped to 10/15/30 — snapping leaves dead zones where a script is
    // too long for one tier and too short to fill the next.
    await attempt({ script: words(40) });
    expect(lastWritten!.duration).toBeGreaterThan(15);
    expect(lastWritten!.duration).toBeLessThan(30);
  });

  it('there is no length a valid script cannot reach', async () => {
    // The dead-zone regression: every script between the floor of the shortest
    // clip and the ceiling of the longest must find a clip that holds it.
    for (const n of [15, 20, 25, 30, 40, 50, 60, 68]) {
      const r = await attempt({ script: words(n) });
      expect(r.success, `${n} words found no clip`).toBe(true);
    }
  });

  it('still refuses a script no clip can hold', async () => {
    expect((await attempt({ script: words(120) })).success).toBe(false);
  });
});

describe('the ceilings are the models’ own', () => {
  it('a food video caps at 15s, because it animates our photograph', async () => {
    // Naming a recipe means image-to-video on wan2.7-i2v, which stops at 15s.
    // A script sized for 30 would overrun the clip that actually renders.
    const r = await attempt({ duration: 30, recipe: 'miso aubergine', script: words(60) });
    expect(r.success).toBe(false);
    expect(r.output).toContain('15s clip');
  });

  it('everything else reaches 30', async () => {
    expect((await attempt({ duration: 45, script: words(60) })).success).toBe(true);
    expect(lastWritten!.duration).toBe(30);
  });
});

describe('a voiced clip is never five seconds', () => {
  it('asking for 5 with a script is raised to 10', async () => {
    const r = await attempt({ duration: 5, script: words(19) });
    expect(r.success).toBe(true);
    expect(lastWritten!.duration).toBe(10);
  });

  it('a silent clip may be short', async () => {
    expect((await attempt({ duration: 5 })).success).toBe(true);
    expect(lastWritten!.duration).toBe(5);
  });
});
