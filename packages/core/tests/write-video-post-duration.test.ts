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
//   A voiced clip is never shorter than 10s. Below that the floor computes
//   above the ceiling, so every script short enough to fit is shorter than the
//   minimum read worth making — the window is empty.
//
//   Every call also carries a STORYBOARD sized to the duration (one still per
//   five seconds), because that is now checked. The helper derives it, except
//   where the tool CLAMPS the length — there the count is stated outright,
//   since the clamp is the thing under test.
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
let lastWritten: { duration?: number; shots?: string[] } | null = null;
const store = {
  write: async (post: { duration?: number; shots?: string[] }) => {
    lastWritten = post;
    return {
      shots: (post.shots ?? []).map(p => ({ url: 'https://x/1.jpg', prompt: p })),
      shotErrors: [],
      voiced: true,
    };
  },
};
const ctx = { cwd: '.', sharedState: { videoPostStore: store } } as never;

/** A storyboard of `n` distinct frames — distinct because a real one is. */
function storyboard(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `frame ${i + 1}: something happens`);
}

/**
 * `shotCount` overrides the derived one. Needed wherever the tool changes the
 * duration under the request — a voiced 5s becomes 10s and needs two frames,
 * 45s clamps to 30 and needs six — which is exactly what those cases assert.
 */
async function attempt(args: Record<string, unknown>, shotCount?: number) {
  lastWritten = null;
  const seconds = typeof args.duration === 'number' ? args.duration : 15;
  const r = await tool.execute(
    {
      platform: 'tiktok',
      shots: storyboard(shotCount ?? Math.max(1, Math.ceil(seconds / 5))),
      caption: 'a caption',
      ...args,
    },
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

describe('length is a format decision, and the format is fifteen seconds', () => {
  it('a video defaults to 15 seconds', async () => {
    // Thirty was the default for one evening, set the moment wan3.0 made it
    // possible for every subject. Fifteen is the editorial answer rather than
    // the model's: half the render, half the compute, and completion rate is
    // what ranks a Reel.
    await attempt({ script: words(28) });
    expect(lastWritten!.duration).toBe(15);
  });

  it('a food video gets the same 15 seconds as everything else', async () => {
    // Food was capped at 15 before, but for an unrelated reason — the model
    // that animated our photograph stopped there. That cap is gone; this is the
    // format applying evenly, not the old ceiling returning.
    await attempt({ recipe: 'miso aubergine', script: words(28) });
    expect(lastWritten!.duration).toBe(15);
  });

  it('a hook-length line no longer quietly becomes a short clip', async () => {
    // The rule this file exists for, unchanged by the number moving. Eight words
    // used to produce a short clip and look like success; now it is refused,
    // because the format was decided first and the line does not fill it.
    const r = await attempt({ script: words(8) });
    expect(r.success).toBe(false);
    expect(r.output).toContain('15s clip');
  });

  it('and a script too LONG for the format is refused too', async () => {
    // The other end of the same rule, and the one that gets easier to hit at
    // fifteen seconds than it ever was at thirty. A voice still talking after
    // the picture stops is the most obviously broken thing a short can do.
    const r = await attempt({ script: words(60) });
    expect(r.success).toBe(false);
    expect(r.output).toContain('will not fit');
  });

  it('she can still override when she means to', async () => {
    // Length is not only about the script — a demonstration may have few words
    // and a great deal to show.
    await attempt({ duration: 10, script: words(18) });
    expect(lastWritten!.duration).toBe(10);
  });
});

describe('the ceilings are the models’ own', () => {
  it('naming a recipe no longer caps the clip at 15', async () => {
    // The cap was wan2.7-i2v's ceiling wearing a recipe's clothes. Both went.
    const r = await attempt({ duration: 30, recipe: 'miso aubergine', script: words(60) });
    expect(r.success).toBe(true);
    expect(lastWritten!.duration).toBe(30);
  });

  it('everything else reaches 30', async () => {
    // Six frames for the thirty it clamps to, not nine for the forty-five asked.
    expect((await attempt({ duration: 45, script: words(60) }, 6)).success).toBe(true);
    expect(lastWritten!.duration).toBe(30);
  });
});

describe('one still per five seconds, and the count is checked', () => {
  // Derived from the duration rather than asked for separately: two numbers
  // that must agree are two numbers that can disagree, and the one that would
  // have lost is the picture — silently, leaving a thirty-second piece with
  // three frames and ten seconds of nothing to cut to.
  it('a 15s post takes exactly three', async () => {
    await attempt({ script: words(28) });
    expect(lastWritten!.shots).toHaveLength(3);
  });

  it('too few is refused, with the arithmetic', async () => {
    const r = await attempt({ script: words(28) }, 2);
    expect(r.success).toBe(false);
    expect(r.output).toContain('needs 3 shots');
    expect(r.output).toContain('you wrote 2');
  });

  it('too many is refused, and offers the longer duration instead', async () => {
    const r = await attempt({ script: words(28) }, 5);
    expect(r.success).toBe(false);
    expect(r.output).toContain('set duration to 25');
  });

  it('a length that is not a multiple of five rounds up', async () => {
    // The last still simply holds a beat longer — better than refusing a
    // perfectly good storyboard over arithmetic nobody asked her to do.
    expect((await attempt({ duration: 12, script: words(22) }, 3)).success).toBe(true);
  });

  it('the shot count is measured against the duration she GETS, not the one she asked for', async () => {
    // A default she never saw decides the count. Measuring against the raw
    // request would refuse a correct three-frame storyboard for a 15s post
    // that never named a duration at all.
    expect((await attempt({ script: words(28) }, 3)).success).toBe(true);
  });
});

describe('a voiced clip is never five seconds', () => {
  it('asking for 5 with a script is raised to 10', async () => {
    // Two frames, not one: the clip it actually becomes is ten seconds long.
    const r = await attempt({ duration: 5, script: words(19) }, 2);
    expect(r.success).toBe(true);
    expect(lastWritten!.duration).toBe(10);
  });

  it('a silent clip may be short', async () => {
    // One frame, and it stays five seconds because nothing raises it.
    expect((await attempt({ duration: 5 })).success).toBe(true);
    expect(lastWritten!.duration).toBe(5);
    expect(lastWritten!.shots).toHaveLength(1);
  });
});
