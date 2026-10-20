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

  it('accepts six as 2/2/2', async () => {
    expect((await tool.execute({ beats: [work('a'), work('b'), news('c'), news('d'), talk('e'), talk('f')] }, ctx)).success).toBe(true);
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

describe('more when he asks, and round the clock', () => {
  // 20 Oct 2026, the operator: slots are "every hour round the clock … when
  // it's night here somewhere else people are waking up", and "upto 6 planned
  // but should be able to still add more if we want".
  const tool = new SuggestBeatsTool();
  let got: Array<Record<string, unknown>> = [];
  const at = (isToday: boolean, hoursLeft: number | null) =>
    ({ cwd: '.', sharedState: { beatStore: { suggest: async (b: never[]) => { got = b; } }, planningDay: { date: '2026-10-20', isToday, hoursLeft } } }) as never;
  const work = (a: string) => ({ angle: a, why: 'w', kind: 'our_work' });
  const news = (a: string) => ({ angle: a, why: 'w', kind: 'news' });
  const talk = (a: string) => ({ angle: a, why: 'w', kind: 'conversation', venue: 'HN thread', position: 'we ship it' });

  it('does not shrink the day late in the evening', async () => {
    const r = await tool.execute({ beats: [news('a'), work('b')] }, at(true, 2));
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/FOUR TO SIX/);
    expect((await tool.execute({ beats: [work('a'), news('b'), talk('c'), work('d')] }, at(true, 2))).success).toBe(true);
  });

  it('takes more than six when the split holds', async () => {
    const eight = [work('a'), work('b'), work('c'), news('d'), news('e'), news('f'), talk('g'), talk('h')];
    expect((await tool.execute({ beats: eight }, at(false, null))).success).toBe(true);
  });

  it('keeps the split equal as the day grows', async () => {
    const r = await tool.execute({ beats: [work('a'), work('b'), work('c'), work('d'), news('e'), talk('f'), talk('g')] }, at(false, null));
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/no kind more than 3 in a day of 7/);
  });

  it('stops at twelve', async () => {
    const many = Array.from({ length: 15 }, (_, i) => [work, news, talk][i % 3](`t${i}`));
    await tool.execute({ beats: many }, at(false, null));
    expect(got.length).toBe(12);
  });
});
