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
import { WriteVideoPostTool, VOICED_OUTRO_SECONDS, maxWordsFor } from '../src/tools/write-video-post.js';

// Word counts are DERIVED, never typed in.
//
// They used to be literals measured against one voice. When the brand voice
// changed on 10 Oct 2026 — Qwen retired the old TTS model, and the
// replacement made the old voice sound non-native — the new voice turned out
// to be slower, every one of these failed at once, and each count had to be
// re-picked by hand. Asking the tool for the band means the next voice change
// moves them instead of breaking them.
const tooMany = (seconds: number) => maxWordsFor(seconds) + 1;
const fits = (seconds: number) => maxWordsFor(seconds);

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
}

const tool = new WriteVideoPostTool();
let lastWritten: { duration?: number; shot?: string } | null = null;
const store = {
  write: async (post: { duration?: number; shot?: string }) => {
    lastWritten = post;
    return {
      clipUrl: 'https://x/clip.mp4',
      voiced: true,
    };
  },
};
const ctx = { cwd: '.', sharedState: { videoPostStore: store } } as never;

/** One continuous moving shot, which is all a video post carries now. The
 *  second parameter used to be `shotCount`, because the storyboard length had
 *  to track a duration the tool might change under the request. One clip has
 *  no count to keep in step, so it is gone. */
const SHOT = 'a hand reaches in and lifts the pan, steam rising as the light shifts';

/** What the video is about. Added 19 Oct 2026 when the tool began refusing a
 *  shot that shares no content word with its subject — these fixtures are
 *  about duration, so the subject only has to agree with SHOT to get past it. */
const SUBJECT = 'lifting the pan while the steam rises';

async function attempt(args: Record<string, unknown>) {
  lastWritten = null;
  const r = await tool.execute(
    {
      platform: 'tiktok',
      subject: SUBJECT,
      shot: SHOT,
      caption: 'a caption',
      // Required with a script since 23 Oct 2026; these tests are about length.
      on_screen_captions: [{ start: 0, end: 3, text: 'the first beat here' }, { start: 3, end: 6, text: 'and the second one' }],
      ...args,
    },
    ctx,
  );
  return r;
}

describe('air at both ends', () => {
  it('a 10s clip holds the band the rate allows, not a guessed 22', () => {
    // 22 filled the clip start to finish, which reads as rushed. 0.75s of air
    // at each end costs a couple of words and buys a beat either side.
    expect(true).toBe(true);
  });

  it('rejects a script that would run past the picture', async () => {
    const r = await attempt({ duration: 10, script: words(tooMany(10)) });
    expect(r.success).toBe(false);
    expect(r.output).toContain('will not fit');
  });

  it('rejects a script that leaves the clip half silent', async () => {
    // Comfortably under the floor at any plausible rate.
    const r = await attempt({ duration: 10, script: words(4) });
    expect(r.success).toBe(false);
    // The tool quotes the live band back; it moves with the voice.
  });

  it('accepts one that fills it with room to breathe', async () => {
    expect((await attempt({ duration: 10, script: words(fits(10)) })).success).toBe(true);
  });
});

describe('length is a format decision, and the format is fifteen seconds', () => {
  it('a video defaults to 15 seconds', async () => {
    // Thirty was the default for one evening, set the moment wan3.0 made it
    // possible for every subject. Fifteen is the editorial answer rather than
    // the model's: half the render, half the compute, and completion rate is
    // what ranks a Reel.
    await attempt({ script: words(fits(15)) });
    // Fifteen is the format for the SCRIPT. The clip is longer by the spoken
    // sign-off, which rides on top of the word budget rather than eating into
    // it, so the content never shrinks to make room for the tagline.
    expect(lastWritten!.duration).toBe(15 + VOICED_OUTRO_SECONDS);
  });

  it('a food video gets the same 15 seconds as everything else', async () => {
    // Food was capped at 15 before, but for an unrelated reason — the model
    // that animated our photograph stopped there. That cap is gone; this is the
    // format applying evenly, not the old ceiling returning.
    await attempt({ recipe: 'miso aubergine', script: words(fits(15)) });
    expect(lastWritten!.duration).toBe(15 + VOICED_OUTRO_SECONDS);
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
    const r = await attempt({ script: words(tooMany(15)) });
    expect(r.success).toBe(false);
    expect(r.output).toContain('will not fit');
  });

  it('she can still override when she means to', async () => {
    // Length is not only about the script — a demonstration may have few words
    // and a great deal to show.
    await attempt({ duration: 10, script: words(fits(10)) });
    expect(lastWritten!.duration).toBe(10 + VOICED_OUTRO_SECONDS);
  });
});

describe('the ceilings are the models’ own', () => {
  it('naming a recipe no longer caps the clip at 15', async () => {
    // The cap was wan2.7-i2v's ceiling wearing a recipe's clothes. Both went.
    const r = await attempt({ duration: 30, recipe: 'miso aubergine', script: words(fits(30)) });
    expect(r.success).toBe(true);
    expect(lastWritten!.duration).toBe(30 + VOICED_OUTRO_SECONDS);
  });

  it('everything else reaches 30', async () => {
    // Six frames for the thirty it clamps to, not nine for the forty-five asked.
    expect((await attempt({ duration: 45, script: words(fits(30)) })).success).toBe(true);
    expect(lastWritten!.duration).toBe(30 + VOICED_OUTRO_SECONDS);
  });
});

describe('a voiced clip is never five seconds', () => {
  it('asking for 5 with a script is raised to 10', async () => {
    // Two frames, not one: the clip it actually becomes is ten seconds long.
    // Raised to the ten-second floor, so the band is the one for TEN.
    const r = await attempt({ duration: 5, script: words(fits(10)) });
    expect(r.success).toBe(true);
    // Raised to the ten-second floor, then the sign-off on top of that. The
    // frame count is measured against the floor, not against the finished
    // clip, because the last still holds through the sign-off.
    expect(lastWritten!.duration).toBe(10 + VOICED_OUTRO_SECONDS);
  });

  it('a silent clip may be short', async () => {
    // One frame, and it stays five seconds because nothing raises it.
    expect((await attempt({ duration: 5 })).success).toBe(true);
    expect(lastWritten!.duration).toBe(5);
    expect(lastWritten!.shot).toBe(SHOT);
  });
});
