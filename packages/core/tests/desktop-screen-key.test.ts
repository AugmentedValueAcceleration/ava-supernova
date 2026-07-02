/**
 * 0G regression suite — Phase 3A: screen fingerprinting math.
 * Pure functions; if these break, fork-point matching silently degrades.
 */
import { describe, it, expect } from 'vitest';
import {
  imageKey, ctxKey, averageHash, hamming, computeSsim, matchScreen,
  bytesToBase64, base64ToBytes,
} from '../src/desktop/screen-key.js';

const W = 32, H = 32;

/** Deterministic synthetic screen: a vertical gradient with a bright "window"
 *  rectangle. Shifting the rectangle simulates a different screen layout. */
function synthScreen(rectX: number, rectY: number, noise = 0): Uint8Array {
  const px = new Uint8Array(W * H);
  let seed = 42;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = Math.floor((y / H) * 120); // gradient background
      if (x >= rectX && x < rectX + 12 && y >= rectY && y < rectY + 10) v = 230; // the "window"
      if (noise > 0) v = Math.max(0, Math.min(255, v + Math.floor((rand() - 0.5) * 2 * noise)));
      px[y * W + x] = v;
    }
  }
  return px;
}

describe('base64 round-trip (no Buffer dependency)', () => {
  it('encodes and decodes losslessly, including non-multiple-of-3 lengths', () => {
    for (const len of [0, 1, 2, 3, 100, 1024]) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37) % 256);
      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    }
  });
});

describe('averageHash + hamming', () => {
  it('identical screens hash identically', () => {
    const a = synthScreen(4, 4);
    expect(averageHash(a, W, H)).toBe(averageHash(synthScreen(4, 4), W, H));
  });

  it('small noise keeps the hash close (prefilter survives pixel jitter)', () => {
    const clean = averageHash(synthScreen(4, 4), W, H);
    const noisy = averageHash(synthScreen(4, 4, 10), W, H);
    expect(hamming(clean, noisy)).toBeLessThanOrEqual(6);
  });

  it('a moved window changes the hash substantially', () => {
    const a = averageHash(synthScreen(2, 2), W, H);
    const b = averageHash(synthScreen(18, 18), W, H);
    expect(hamming(a, b)).toBeGreaterThan(6);
  });
});

describe('computeSsim', () => {
  it('identical images score 1', () => {
    const a = synthScreen(4, 4);
    expect(computeSsim(a, synthScreen(4, 4))).toBeCloseTo(1, 5);
  });

  it('light noise stays above the match threshold', () => {
    expect(computeSsim(synthScreen(4, 4), synthScreen(4, 4, 8))).toBeGreaterThan(0.82);
  });

  it('a different layout falls below the threshold', () => {
    expect(computeSsim(synthScreen(2, 2), synthScreen(18, 18))).toBeLessThan(0.82);
  });
});

describe('matchScreen', () => {
  it('finds the same screen among candidates (noise-tolerant)', () => {
    const current = imageKey(synthScreen(4, 4, 5), W, H);
    const candidates = [
      imageKey(synthScreen(18, 18), W, H),
      imageKey(synthScreen(4, 4), W, H),   // the match
      imageKey(synthScreen(10, 20), W, H),
    ];
    const m = matchScreen(current, candidates);
    expect(m?.index).toBe(1);
    expect(m!.score).toBeGreaterThan(0.82);
  });

  it('returns null when nothing matches', () => {
    const current = imageKey(synthScreen(2, 2), W, H);
    expect(matchScreen(current, [imageKey(synthScreen(18, 18), W, H)])).toBeNull();
  });

  it('ctx keys match exactly and never cross kinds', () => {
    const c = ctxKey('Notepad', 'open the file  menu');
    expect(matchScreen(c, [ctxKey('notepad', 'open the file menu')])).toEqual({ index: 0, score: 1 });
    expect(matchScreen(c, [imageKey(synthScreen(4, 4), W, H)])).toBeNull();
  });
});
