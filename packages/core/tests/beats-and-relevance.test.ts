// Two rules the operator asked for on 19 Oct 2026, both of which had been
// guidance and neither of which held as guidance.
//
//  1. A video's clip must be ABOUT the video. Well-made, off-topic footage was
//     coming back: a model that has just written a vivid shot does not go back
//     and check it against the subject, however firmly the schema asks.
//  2. The day's briefing is FOUR OR FIVE beats, at least one anchored to real
//     news. It kept arriving as two safe evergreen angles about ourselves,
//     which only ever reaches people already looking at us.

import { describe, it, expect } from 'vitest';
import { WriteVideoPostTool } from '../src/tools/write-video-post.js';
import { SuggestBeatsTool } from '../src/tools/suggest-beats.js';

const videoCtx = {
  cwd: '.',
  sharedState: {
    videoPostStore: {
      write: async () => ({ clipUrl: 'https://x/clip.mp4', voiced: true }),
    },
  },
} as never;

const POSTS = [{ platform: 'tiktok', caption: 'a caption' }];

describe('the clip has to be about the thing', () => {
  const tool = new WriteVideoPostTool();

  it('refuses a shot that shares nothing with the subject', async () => {
    const r = await tool.execute({
      posts: POSTS,
      subject: 'Ava runs offline with no API key',
      // Beautiful. Entirely unrelated. This is the exact failure reported.
      shot: 'a sunset over calm water, gulls drifting, the horizon glowing orange',
    }, videoCtx);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/does not show the subject/i);
    // The refusal has to say what to do, not just that it said no.
    expect(r.output).toMatch(/what this idea LOOKS like/i);
  });

  it('accepts a shot that actually depicts the subject', async () => {
    const r = await tool.execute({
      posts: POSTS,
      subject: 'Ava runs offline with no API key',
      shot: 'a laptop offline, the wifi icon crossed out, code completing on screen as a hand lifts away from the keyboard',
      // 15-20 words, because the duration rule enforces its own band and a
      // short script is refused before the relevance check is ever reached.
      script: 'No wifi. No API key. The agent keeps working right there on your own machine, offline, exactly as before.',
    }, videoCtx);
    expect(r.success).toBe(true);
  });

  it('requires a subject at all', async () => {
    const r = await tool.execute({
      posts: POSTS,
      shot: 'a hand lifts the pan as steam rises',
    }, videoCtx);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/requires `subject`/);
  });

  // The check is deliberately crude — one shared content word passes. A
  // stricter rule would start refusing good metaphors, which is a worse
  // failure than letting a loose one through.
  it('lets a metaphor through on one shared word', async () => {
    const r = await tool.execute({
      posts: POSTS,
      subject: 'the pantry turns what you already have into a recipe',
      shot: 'a nearly empty pantry shelf, a hand sweeping three tins together as the light shifts',
    }, videoCtx);
    expect(r.success).toBe(true);
  });
});

describe('the day is four or five beats, split equally three ways', () => {
  // 20 Oct 2026, the operator: "talking about yourself is the wrong message —
  // people at times want a break from the whole look-at-me posts."
  const tool = new SuggestBeatsTool();
  let got: Array<Record<string, unknown>> = [];
  const ctx = { cwd: '.', sharedState: { beatStore: { suggest: async (b: never[]) => { got = b; } } } } as never;

  const work = (angle: string) => ({ angle, why: 'because', kind: 'our_work' });
  const news = (angle: string) => ({ angle, why: 'because', kind: 'news' });
  const talk = (angle: string, extra: Record<string, string> = { venue: 'r/ExperiencedDevs thread on agents', position: 'we ship one, and here is what broke' }) =>
    ({ angle, why: 'because', kind: 'conversation', ...extra });

  it('refuses a thin day', async () => {
    const r = await tool.execute({ beats: [work('one'), news('two')] }, ctx);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/FOUR TO SIX/);
  });

  it('accepts six as 2/2/2 and refuses seven', async () => {
    const six = [work('a'), work('b'), news('c'), news('d'), talk('e'), talk('f')];
    expect((await tool.execute({ beats: six }, ctx)).success).toBe(true);
    // Anything past six is cut, so a seventh never reaches the check.
    await tool.execute({ beats: [...six, work('g')] }, ctx);
    expect(got.length).toBe(6);
  });

  it('accepts 2/1/1 and 2/2/1', async () => {
    expect((await tool.execute({ beats: [work('a'), work('b'), news('c'), talk('d')] }, ctx)).success).toBe(true);
    expect((await tool.execute({ beats: [work('a'), news('b'), news('c'), talk('d'), talk('e')] }, ctx)).success).toBe(true);
  });

  it('refuses a day with no news, and says never invent one', async () => {
    const r = await tool.execute({ beats: [work('a'), work('b'), talk('c'), talk('d')] }, ctx);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/No news beat/);
    expect(r.output).toMatch(/Never invent one/);
  });

  it('refuses a day with no conversation, and says where to look', async () => {
    const r = await tool.execute({ beats: [work('a'), work('b'), news('c'), news('d')] }, ctx);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/No conversation beat/);
    expect(r.output).toMatch(/Reddit and Hacker News/);
  });

  it('refuses three about ourselves out of five', async () => {
    const r = await tool.execute({ beats: [work('a'), work('b'), work('c'), news('d'), talk('e')] }, ctx);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/Too many our work/);
  });

  it('refuses a beat with no kind', async () => {
    const r = await tool.execute({ beats: [work('a'), { angle: 'x', why: 'w' }, news('c'), talk('d')] }, ctx);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/needs a `kind`/);
  });

  // An older caller that only knows is_news is read as news, not refused.
  it('reads is_news as kind news', async () => {
    const r = await tool.execute({ beats: [work('a'), work('b'), { angle: 'c', why: 'w', is_news: true }, talk('d')] }, ctx);
    expect(r.success).toBe(true);
    expect(got[2]).toMatchObject({ kind: 'news', is_news: true });
  });

  // A neutral take in a live argument gets scrolled past.
  it('refuses a conversation beat without a venue or a side', async () => {
    const noSide = await tool.execute({ beats: [work('a'), work('b'), news('c'), talk('d', { venue: 'HN thread' })] }, ctx);
    expect(noSide.success).toBe(false);
    expect(noSide.output).toMatch(/needs BOTH/);
    const noVenue = await tool.execute({ beats: [work('a'), work('b'), news('c'), talk('d', { position: 'we disagree' })] }, ctx);
    expect(noVenue.success).toBe(false);
  });
});

describe('what she says about a beat reaches the operator', () => {
  // `format` was in the schema and dropped in execute, so "the form IS the
  // idea" never arrived however clearly she had said it.
  it('keeps format, needs_video, kind, venue and position', async () => {
    let got: Array<Record<string, unknown>> = [];
    const ctx = { cwd: '.', sharedState: { beatStore: { suggest: async (b: never[]) => { got = b; } } } } as never;
    const r = await new SuggestBeatsTool().execute({
      beats: [
        { angle: 'a', why: 'w', kind: 'news' },
        { angle: 'b', why: 'w', kind: 'our_work', needs_video: true, format: '30s piece to camera' },
        { angle: 'c', why: 'w', kind: 'our_work', format: '   ' },
        { angle: 'd', why: 'w', kind: 'conversation', venue: 'HN thread on V4 pricing', position: 'cheap is not the point' },
      ],
    }, ctx);
    expect(r.success).toBe(true);
    expect(got[0]).toMatchObject({ kind: 'news', is_news: true });
    expect(got[1]).toMatchObject({ needs_video: true, format: '30s piece to camera' });
    // Blank is absent, not an empty form.
    expect('format' in got[2]).toBe(false);
    expect(got[3]).toMatchObject({ venue: 'HN thread on V4 pricing', position: 'cheap is not the point' });
  });

  // Venue and position belong to conversation beats; elsewhere they are noise.
  it('drops venue and position from other kinds', async () => {
    let got: Array<Record<string, unknown>> = [];
    const ctx = { cwd: '.', sharedState: { beatStore: { suggest: async (b: never[]) => { got = b; } } } } as never;
    await new SuggestBeatsTool().execute({
      beats: [
        { angle: 'a', why: 'w', kind: 'news', venue: 'x', position: 'y' },
        { angle: 'b', why: 'w', kind: 'our_work' },
        { angle: 'c', why: 'w', kind: 'our_work' },
        { angle: 'd', why: 'w', kind: 'conversation', venue: 'v', position: 'p' },
      ],
    }, ctx);
    expect('venue' in got[0]).toBe(false);
    expect('position' in got[0]).toBe(false);
  });
});

describe('planning what is left of today', () => {
  // 20 Oct 2026, the operator: at nearly 6pm "she would know ... so won't
  // need a full day's worth of posts".
  const tool = new SuggestBeatsTool();
  const at = (slotsLeft: number | null, isToday = true) =>
    ({ cwd: '.', sharedState: { beatStore: { suggest: async () => {} }, planningDay: { date: '2026-10-20', isToday, slotsLeft } } }) as never;
  const work = (angle: string) => ({ angle, why: 'w', kind: 'our_work' });
  const news = (angle: string) => ({ angle, why: 'w', kind: 'news' });

  it('accepts one topic when one slot is left', async () => {
    expect((await tool.execute({ beats: [news('a')] }, at(1))).success).toBe(true);
  });

  it('refuses more topics than slots left', async () => {
    const r = await tool.execute({ beats: [news('a'), work('b'), work('c')] }, at(2));
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/2 posting slots left today/);
  });

  it('does not spend two of a few slots on the same kind', async () => {
    const r = await tool.execute({ beats: [work('a'), work('b')] }, at(2));
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/no two of the same/);
    expect((await tool.execute({ beats: [work('a'), news('b')] }, at(2))).success).toBe(true);
  });

  it('says to plan tomorrow when no slots are left', async () => {
    const r = await tool.execute({ beats: [news('a')] }, at(0));
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/planning tomorrow/);
  });

  it('holds a future day to the full four to six', async () => {
    const r = await tool.execute({ beats: [news('a'), work('b')] }, at(null, false));
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/FOUR TO SIX/);
  });
});
