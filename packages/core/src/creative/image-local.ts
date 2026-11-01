/**
 * Image work that needs no API key, done on the user's own machine.
 *
 * Background removal and logo vectorising ran on our server for the Design
 * Studio. Neither uses AI and neither needs a key, so with Ava going fully
 * bring-your-own-key (1 Nov 2026) they run locally instead: offline, nothing
 * sent anywhere, and no server to be up.
 *
 * Same algorithms as the server, so the results match what users had:
 *   - background removal: the white-threshold matte (threshold 240, softness 40)
 *   - vectorising: vtracer, the engine the server used, as its WebAssembly
 *     build — the server's native module ships one binary per platform, which
 *     a VS Code extension cannot reasonably carry. Measured 1 Nov: a colour
 *     test logo came back with its exact colours, in ~13 ms.
 *
 * Decoding is pure JavaScript (pngjs, jpeg-js) — PNG and JPEG cover what Qwen
 * and Wan produce. The server used sharp, a native module, for the same job.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RawImage { width: number; height: number; data: Uint8Array }

function isPng(b: Uint8Array): boolean {
  return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}
function isJpeg(b: Uint8Array): boolean {
  return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

/** Decode a PNG or JPEG to RGBA pixels. */
export async function decodeImage(buf: Uint8Array): Promise<RawImage> {
  if (isPng(buf)) {
    const { PNG } = await import('pngjs');
    const png = PNG.sync.read(Buffer.from(buf));
    return { width: png.width, height: png.height, data: png.data };
  }
  if (isJpeg(buf)) {
    const jpeg = await import('jpeg-js');
    const img = (jpeg.default ?? jpeg).decode(Buffer.from(buf), { useTArray: true, formatAsRGBA: true });
    return { width: img.width, height: img.height, data: img.data };
  }
  throw new Error('Only PNG and JPEG images can be processed on this machine.');
}

/** Encode RGBA pixels as a PNG. */
export async function encodePng(img: RawImage): Promise<Buffer> {
  const { PNG } = await import('pngjs');
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  return PNG.sync.write(png);
}

/** Pull image bytes out of a data URL. */
export function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1];
  if (!b64) throw new Error('Not a data URL');
  return Buffer.from(b64, 'base64');
}

/**
 * Strip a flat white/light background to transparency, in place.
 * White (≥ threshold on every channel) goes fully clear; near-white edges fade
 * by how white they are, which keeps anti-aliasing smooth.
 */
export function matteWhite(img: RawImage, threshold = 240, edgeSoftness = 40): { removed: number } {
  const th = Math.min(255, Math.max(0, threshold));
  const edgeTh = th - Math.min(255, Math.max(0, edgeSoftness));
  const d = img.data;
  let removed = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r >= th && g >= th && b >= th) {
      d[i + 3] = 0;
      removed++;
    } else if (r >= edgeTh && g >= edgeTh && b >= edgeTh) {
      const whiteness = (r + g + b) / 3;
      d[i + 3] = Math.max(0, Math.min(255, Math.round(255 * (1 - (whiteness - edgeTh) / (255 - edgeTh)))));
      removed++;
    }
  }
  return { removed };
}

/** Background removal on encoded image bytes → transparent PNG. */
export async function removeWhiteBackground(
  buf: Uint8Array,
  opts: { threshold?: number; edgeSoftness?: number } = {},
): Promise<{ png: Buffer; removedFraction: number }> {
  const img = await decodeImage(buf);
  const { removed } = matteWhite(img, opts.threshold ?? 240, opts.edgeSoftness ?? 40);
  return { png: await encodePng(img), removedFraction: removed / (img.width * img.height) };
}

/** Composite onto solid white — a matted symbol traces cleanly with no near-white noise. */
export function flattenOnWhite(img: RawImage): void {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    d[i] = Math.round(d[i] * a + 255 * (1 - a));
    d[i + 1] = Math.round(d[i + 1] * a + 255 * (1 - a));
    d[i + 2] = Math.round(d[i + 2] * a + 255 * (1 - a));
    d[i + 3] = 255;
  }
}

interface Vectorizer {
  vectorizeSync(png: Buffer, config: unknown): string;
  ColorMode: { Binary: unknown };
  Hierarchical: { Stacked: unknown };
  PathSimplifyMode: { Spline: unknown };
  Preset: { Poster: unknown };
}
let vectorizer: Vectorizer | null = null;

/**
 * Loaded on first use: the WebAssembly module is ~11 MB and most sessions
 * never vectorise. The SYNC entry point on purpose — this build's async path
 * fails inside its worker pool (the runtime it was built against has moved
 * on), and a logo traces in milliseconds, so there is nothing to wait for.
 */
function loadVectorizer(): Vectorizer {
  if (!vectorizer) {
    // Vendored (see vendor/vectorizer/README.md): the npm package declares a
    // wasm32 CPU, so npm refuses to install it on x64. Two places it can be:
    //   - bundled into an app (the extension, the IDE sidecar): the build puts
    //     a self-contained copy in `vectorizer/` beside the bundle. A CommonJS
    //     bundle has an empty import.meta, so __dirname is the only way there.
    //   - core itself from npm or the workspace: relative to dist/creative/.
    const candidates: string[] = [];
    if (typeof __dirname !== 'undefined') candidates.push(join(__dirname, 'vectorizer', 'vectorizer.cjs'));
    try {
      candidates.push(fileURLToPath(new URL('../../vendor/vectorizer/vectorizer.wasi.cjs', import.meta.url)));
    } catch { /* bundled: no import.meta */ }
    const found = candidates.find((c) => existsSync(c));
    if (!found) throw new Error('The logo vectoriser is missing from this install — please report it on Discord.');
    const req = createRequire(typeof __filename !== 'undefined' ? __filename : import.meta.url);
    vectorizer = req(found) as Vectorizer;
  }
  return vectorizer;
}

/**
 * Trace a logo to SVG. `bw` is the server's tuned logo trace (a high speckle
 * filter drops stray specks, splines keep curves smooth); `color` is vtracer's
 * Poster preset.
 */
export async function vectorizeLogo(buf: Uint8Array, mode: 'bw' | 'color' = 'bw'): Promise<string> {
  const img = await decodeImage(buf);
  flattenOnWhite(img);
  const flat = await encodePng(img);
  const v = loadVectorizer();
  const config = mode === 'color' ? v.Preset.Poster : {
    colorMode: v.ColorMode.Binary,
    hierarchical: v.Hierarchical.Stacked,
    filterSpeckle: 16,
    colorPrecision: 6,
    layerDifference: 16,
    mode: v.PathSimplifyMode.Spline,
    cornerThreshold: 60,
    lengthThreshold: 4,
    maxIterations: 10,
    spliceThreshold: 45,
  };
  return v.vectorizeSync(flat, config);
}
