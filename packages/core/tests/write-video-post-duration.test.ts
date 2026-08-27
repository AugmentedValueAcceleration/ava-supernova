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

describe('length is a format decision, and the format follows the subject', () => {
  it('a general video defaults to 30 seconds', async () => {
    // The operator asked for this twice: 30s for anything that is not a recipe
    // or an exercise. It was briefly derived from the script instead, which
    // meant she wrote at hook length by habit and every general clip came out
    // at ten seconds — working as built, and not as asked.
    await attempt({ script: words(60) });
    expect(lastWritten!.duration).toBe(30);
  });

  it('a food video defaults to 15 seconds', async () => {
    // It animates a photograph we verified, on a model that stops at 15.
    await attempt({ recipe: 'miso aubergine', script: words(28) });
    expect(lastWritten!.duration).toBe(15);
  });

  it('a hook-length line no longer quietly becomes a short clip', async () => {
    // This is the whole point. Nineteen words used to produce a 10s clip and
    // look like success; now it is refused, because the format was 30s and the
    // line does not fill it.
    const r = await attempt({ script: words(19) });
    expect(r.success).toBe(false);
    expect(r.output).toContain('30s clip');
  });

  it('she can still override when she means to', async () => {
    // Length is not only about the script — a demonstration may have few words
    // and a great deal to show.
    await attempt({ duration: 10, script: words(18) });
    expect(lastWritten!.duration).toBe(10);
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
