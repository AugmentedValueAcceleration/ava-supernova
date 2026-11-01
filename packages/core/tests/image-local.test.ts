// Keyless image work on the user's own machine (BYOK plan, 1 Nov 2026) — the
// same matte and the same vtracer engine the server used, with no server.
import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { removeWhiteBackground, vectorizeLogo, decodeImage, matteWhite } from '../src/creative/image-local.js';

/** A red disc with a dark ring on white — a simple logo. */
function logo(): RawPixels {
  const W = 120, H = 120, data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, d = Math.hypot(x - 60, y - 60);
    const [r, g, b] = d < 35 ? [220, 40, 40] : d < 45 ? [20, 20, 30] : [255, 255, 255];
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { width: W, height: H, data };
}
type RawPixels = { width: number; height: number; data: Uint8Array };
const asPng = (img: RawPixels) => { const p = new PNG({ width: img.width, height: img.height }); p.data = Buffer.from(img.data); return PNG.sync.write(p); };

describe('background removal', () => {
  it('clears white, keeps the mark, fades near-white edges', () => {
    const img = { width: 3, height: 1, data: new Uint8Array([255, 255, 255, 255, 220, 40, 40, 255, 230, 230, 230, 255]) };
    matteWhite(img);
    expect(img.data[3]).toBe(0);
    expect(img.data[7]).toBe(255);
    expect(img.data[11]).toBeGreaterThan(0);
    expect(img.data[11]).toBeLessThan(255);
  });

  it('turns a logo on white into a transparent PNG', async () => {
    const { png, removedFraction } = await removeWhiteBackground(asPng(logo()));
    const out = PNG.sync.read(png);
    expect(out.data[3]).toBe(0);                          // corner: was white
    expect(out.data[(60 * 120 + 60) * 4 + 3]).toBe(255);  // centre: the mark
    expect(removedFraction).toBeGreaterThan(0.4);
  });

  it('reads JPEG as well as PNG, and says plainly when it cannot', async () => {
    const jpg = jpeg.encode({ width: 120, height: 120, data: Buffer.from(logo().data) }, 90).data;
    expect((await decodeImage(jpg)).width).toBe(120);
    await expect(decodeImage(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/PNG and JPEG/);
  });
});

describe('logo vectorising', () => {
  it('traces black-and-white as the server did', async () => {
    const svg = await vectorizeLogo(asPng(logo()), 'bw');
    expect(svg).toMatch(/<svg/);
    expect(svg).toMatch(/<path/);
  });

  it('traces colour with the logo\'s own colours', async () => {
    const svg = await vectorizeLogo(asPng(logo()), 'color');
    expect(svg).toMatch(/#DC2828/i);
    expect(svg).toMatch(/#14141E/i);
  });
});
