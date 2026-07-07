// ─── Client-side image compression ───────────────────────────────────────────
//
// Encode a data-URL image to WebP entirely in the webview (Chromium's canvas
// encoder), so saved assets are ~25–35% smaller with ZERO native dependencies —
// no `sharp`, no per-platform binaries. Chromium supports lossless WebP with
// alpha at quality 1.0 (for flat art / transparent icons) and high-quality
// lossy below that (for photographic images).
//
// Everything here is best-effort: on ANY failure — a non-image URL, a
// cross-origin source that taints the canvas, an unsupported codec, or a result
// that isn't actually smaller — it returns the ORIGINAL data URL unchanged, so a
// save can never break because compression didn't help.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

/**
 * Compress a data-URL image to WebP. Returns a WebP data URL when it's valid and
 * smaller, otherwise the original untouched.
 *
 * @param quality 0–1. Use 1.0 for lossless (icons/flat art with alpha); ~0.9 for
 *                photographic images.
 */
export async function toWebp(dataUrl: string, quality = 0.9): Promise<string> {
  try {
    // Only local raster data can be canvas-encoded. Remote URLs would taint the
    // canvas and throw on export; SVGs and non-images aren't ours to touch.
    if (!dataUrl.startsWith('data:image/')) return dataUrl;

    const img = await loadImage(dataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return dataUrl;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0);

    const out = canvas.toDataURL('image/webp', quality);
    // Chromium falls back to PNG if it can't honour the request — only adopt a
    // genuine WebP, and only when it actually saved space.
    if (!out.startsWith('data:image/webp')) return dataUrl;
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}
