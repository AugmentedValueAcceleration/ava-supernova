import { describe, it, expect } from 'vitest';
import {
  videoCreditCost,
  VIDEO_CREDITS_PER_SECOND,
  VIDEO_ANCHOR_SECONDS,
  VIDEO_GEN_CREDITS,
} from '../src/billing/credits.js';

/**
 * Video used to be charged flat across duration, which was fine while 5 and 10
 * seconds were the only options and untenable the moment wan3.0 reached 30 — a
 * 6× spread on one price. Charging by the second is what let the user-facing
 * ceiling come off.
 *
 * The promise made when it changed was that NOTHING anyone generates today
 * costs more than it did. That promise is what these tests hold.
 */
describe('a video is charged by its length as well as its resolution', () => {
  it('a ten-second clip costs exactly what it always did', () => {
    // The anchor. Every old flat price was quoting ten seconds, so the rates
    // are those prices ÷ 10 — which means this row cannot move. If it ever
    // does, someone has repriced existing usage without saying so.
    expect(videoCreditCost(480, 10)).toBe(100);
    expect(videoCreditCost(720, 10)).toBe(150);
    expect(videoCreditCost(1080, 10)).toBe(300);
  });

  it('a five-second clip is HALF what it used to be, not the same', () => {
    // The direction people forget. Pricing by length has to cut the short end
    // as well as raise the long one, or it is not pricing by length — it is a
    // price rise wearing its clothes.
    expect(videoCreditCost(720, 5)).toBe(75);
    expect(videoCreditCost(1080, 5)).toBe(150);
  });

  it('nothing at or under the old ceiling got more expensive', () => {
    // The whole promise, stated as a sweep rather than three examples.
    for (const sr of [480, 720, 1080] as const) {
      const wasFlat = VIDEO_GEN_CREDITS[String(sr) as '480' | '720' | '1080'];
      for (let secs = 1; secs <= VIDEO_ANCHOR_SECONDS; secs++) {
        expect(videoCreditCost(sr, secs)).toBeLessThanOrEqual(wasFlat);
      }
    }
  });

  it('thirty seconds costs six times five seconds, because it is six times the work', () => {
    expect(videoCreditCost(720, 30)).toBe(450);
    expect(videoCreditCost(720, 30)).toBe(videoCreditCost(720, 5) * 6);
  });

  it('1080p stays twice 720p at every length', () => {
    for (const secs of [2, 5, 10, 15, 30]) {
      expect(videoCreditCost(1080, secs)).toBe(videoCreditCost(720, secs) * 2);
    }
  });

  it('a caller that reports no length is charged the old flat price', () => {
    // Not every caller knows the duration — a submit-time pre-flight, or a
    // status payload with no usage block. Falling back to the anchor reproduces
    // the previous behaviour exactly rather than guessing cheap and eating it.
    expect(videoCreditCost(720)).toBe(150);
    expect(videoCreditCost(720, undefined)).toBe(150);
    expect(videoCreditCost(720, null)).toBe(150);
    expect(videoCreditCost(720, 0)).toBe(150);
    expect(videoCreditCost(720, Number.NaN)).toBe(150);
  });

  it('refuses to bill beyond the model ceiling', () => {
    // A caller cannot ask for 300 seconds and be billed for 300 seconds: the
    // model stops at 30, so anything past that is a bad number, not a big job.
    expect(videoCreditCost(720, 300)).toBe(videoCreditCost(720, 30));
  });

  it('an unknown resolution bills at the 720p rate rather than free', () => {
    // The failure that matters is the one that costs us nothing to make and
    // charges nothing for it.
    expect(videoCreditCost('weird' as unknown as number, 10)).toBe(150);
    expect(videoCreditCost(null, 10)).toBe(150);
  });

  it('the rates are the old prices divided by the anchor, not new numbers', () => {
    // Stops the table being "tidied" into round figures that quietly reprice
    // everything. The relationship IS the pricing decision.
    expect(VIDEO_CREDITS_PER_SECOND['480'] * VIDEO_ANCHOR_SECONDS).toBe(100);
    expect(VIDEO_CREDITS_PER_SECOND['720'] * VIDEO_ANCHOR_SECONDS).toBe(150);
    expect(VIDEO_CREDITS_PER_SECOND['1080'] * VIDEO_ANCHOR_SECONDS).toBe(300);
  });
});
