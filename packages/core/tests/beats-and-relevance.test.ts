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

describe('the day is four or five beats, one of them news', () => {
  const tool = new SuggestBeatsTool();
  const ctx = { cwd: '.', sharedState: { beatStore: { suggest: async () => {} } } } as never;

  const beat = (angle: string, is_news = false) => ({ angle, why: 'because', is_news });

  it('refuses a thin day', async () => {
    const r = await tool.execute({
      beats: [beat('one'), beat('two', true)],
    }, ctx);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/FOUR OR FIVE/);
    // Tells her where to look rather than just refusing.
    expect(r.output).toMatch(/news desk|what shipped/i);
  });

  it('refuses four beats with no news among them', async () => {
    const r = await tool.execute({
      beats: [beat('one'), beat('two'), beat('three'), beat('four')],
    }, ctx);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/No news beat/);
    expect(r.output).toMatch(/Never invent one/);
  });

  it('accepts four with a news beat', async () => {
    const r = await tool.execute({
      beats: [beat('one'), beat('two'), beat('three'), beat('DeepSeek shipped V4.1-Flash-1017', true)],
    }, ctx);
    expect(r.success).toBe(true);
  });

  it('accepts five', async () => {
    const r = await tool.execute({
      beats: [beat('a', true), beat('b'), beat('c'), beat('d'), beat('e')],
    }, ctx);
    expect(r.success).toBe(true);
  });
});
