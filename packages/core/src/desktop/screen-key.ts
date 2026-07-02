// Screen fingerprinting (Phase 3A) — "have I seen this screen before?"
// without a model. The host captures a small grayscale thumbnail (32×32) of
// the virtual desktop; this module turns it into a comparable key:
//
//   - aHash (64-bit average hash) — cheap equality prefilter via Hamming
//     distance, so matching against hundreds of stored keys costs microseconds.
//   - SSIM (structural similarity) — the real comparison, run only on the few
//     candidates that survive the prefilter.
//
// Adapted from UI-Voyager's GRSD state-matching (Tencent Hunyuan, arXiv
// 2603.24533): SSIM on grayscale thumbnails is how fork-points pair a failed
// action with a later success ON THE SAME SCREEN.
//
// Consent: the thumbnail is a downscaled screenshot, so hosts must only
// capture it when the user's vision setting allows capture at all. With
// vision off, keying degrades honestly to a textual context key (app+task) —
// see `ctxKey`. Everything here is pure data-in/data-out: no fs, no OS calls,
// unit-testable on any platform.

/** An image-based screen key: 32×32 grayscale + its 64-bit average hash. */
export interface ImageScreenKey {
  kind: 'img';
  /** Hex-encoded 64-bit aHash (16 hex chars). */
  hash: string;
  /** Base64 of the raw grayscale bytes, row-major, w*h long. */
  gray: string;
  w: number;
  h: number;
}

/** A textual fallback key for vision-off hosts: app + normalized task. */
export interface CtxScreenKey {
  kind: 'ctx';
  ctx: string;
}

export type ScreenKey = ImageScreenKey | CtxScreenKey;

/** Default match thresholds — tuned for 32×32 thumbnails. */
export const HAMMING_MAX = 12;  // of 64 bits; generous prefilter
export const SSIM_MIN = 0.82;   // structural agreement required to call it "the same screen"

// ── Key construction ────────────────────────────────────────────────────────

/** Build an image key from raw grayscale bytes (row-major, w*h long). */
export function imageKey(gray: Uint8Array | number[], w: number, h: number): ImageScreenKey {
  const bytes = gray instanceof Uint8Array ? gray : Uint8Array.from(gray);
  if (bytes.length !== w * h) throw new Error(`imageKey: expected ${w * h} bytes, got ${bytes.length}`);
  return {
    kind: 'img',
    hash: averageHash(bytes, w, h),
    gray: bytesToBase64(bytes),
    w,
    h,
  };
}

/** Build the vision-off fallback key. Normalized so identical contexts match. */
export function ctxKey(app: string | undefined, task: string): CtxScreenKey {
  const a = (app || 'unknown').toLowerCase().trim();
  const t = task.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
  return { kind: 'ctx', ctx: `${a}|${t}` };
}

/**
 * 64-bit average hash: mean-pool the image into an 8×8 grid, then each cell
 * contributes one bit (above overall mean = 1). Survives small pixel noise;
 * collapses under layout changes — exactly the prefilter we want.
 */
export function averageHash(gray: Uint8Array, w: number, h: number): string {
  const GRID = 8;
  const cells = new Float64Array(GRID * GRID);
  const cellW = w / GRID;
  const cellH = h / GRID;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      let sum = 0;
      let n = 0;
      const x0 = Math.floor(gx * cellW), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * cellW));
      const y0 = Math.floor(gy * cellH), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * cellH));
      for (let y = y0; y < y1 && y < h; y++) {
        for (let x = x0; x < x1 && x < w; x++) {
          sum += gray[y * w + x];
          n++;
        }
      }
      cells[gy * GRID + gx] = n > 0 ? sum / n : 0;
    }
  }
  const mean = cells.reduce((s, v) => s + v, 0) / cells.length;
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4; b++) {
      nibble = (nibble << 1) | (cells[i + b] > mean ? 1 : 0);
    }
    hex += nibble.toString(16);
  }
  return hex;
}

/** Hamming distance between two hex-encoded hashes (bit differences). */
export function hamming(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length) return Number.MAX_SAFE_INTEGER;
  let dist = 0;
  for (let i = 0; i < hashA.length; i++) {
    let x = parseInt(hashA[i], 16) ^ parseInt(hashB[i], 16);
    while (x) { dist += x & 1; x >>= 1; }
  }
  return dist;
}

/**
 * Global SSIM over two equal-size grayscale images. The standard formula with
 * the usual stabilisation constants (K1=0.01, K2=0.03, L=255), computed over
 * the whole thumbnail — at 32×32 a windowed SSIM adds cost, not signal.
 * Returns 1 for identical images, → 0 as structure diverges.
 */
export function computeSsim(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  const n = a.length;
  let meanA = 0, meanB = 0;
  for (let i = 0; i < n; i++) { meanA += a[i]; meanB += b[i]; }
  meanA /= n; meanB /= n;
  let varA = 0, varB = 0, cov = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    varA += da * da;
    varB += db * db;
    cov += da * db;
  }
  varA /= n - 1; varB /= n - 1; cov /= n - 1;
  const L = 255;
  const c1 = (0.01 * L) ** 2;
  const c2 = (0.03 * L) ** 2;
  return ((2 * meanA * meanB + c1) * (2 * cov + c2)) /
    ((meanA * meanA + meanB * meanB + c1) * (varA + varB + c2));
}

/**
 * Match a current key against stored candidates. Image keys: Hamming
 * prefilter (cheap) then SSIM (real) — best SSIM wins if it clears the
 * threshold. Ctx keys: exact match. Cross-kind never matches. Returns the
 * winning candidate index + score, or null.
 */
export function matchScreen(
  current: ScreenKey,
  candidates: ScreenKey[],
  opts: { hammingMax?: number; ssimMin?: number } = {},
): { index: number; score: number } | null {
  const hMax = opts.hammingMax ?? HAMMING_MAX;
  const sMin = opts.ssimMin ?? SSIM_MIN;

  if (current.kind === 'ctx') {
    const idx = candidates.findIndex(c => c.kind === 'ctx' && c.ctx === current.ctx);
    return idx >= 0 ? { index: idx, score: 1 } : null;
  }

  const curGray = base64ToBytes(current.gray);
  let best: { index: number; score: number } | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    if (cand.kind !== 'img') continue;
    if (cand.w !== current.w || cand.h !== current.h) continue;
    if (hamming(current.hash, cand.hash) > hMax) continue; // prefilter
    const score = computeSsim(curGray, base64ToBytes(cand.gray));
    if (score >= sMin && (!best || score > best.score)) {
      best = { index: i, score };
    }
  }
  return best;
}

// ── Base64 helpers (no Buffer dependency — webview/node agnostic) ──────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += i + 1 < bytes.length ? B64[(((b1 ?? 0) & 15) << 2) | ((b2 ?? 0) >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[(b2 ?? 0) & 63] : '=';
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18)
      | (B64.indexOf(clean[i + 1] ?? 'A') << 12)
      | (B64.indexOf(clean[i + 2] ?? 'A') << 6)
      | B64.indexOf(clean[i + 3] ?? 'A');
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
