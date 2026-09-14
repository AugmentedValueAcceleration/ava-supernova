/**
 * Which formats a Library image can be downloaded as — and nothing else.
 *
 * Dependency-free on purpose, for the same reason export-formats.ts is: this
 * answer is needed by two webview bundles (no Node, no DOM at import time) and
 * pinned by a test in core. The transcode that actually MAKES a PNG or JPG
 * needs a canvas, so it lives in each surface; the decision of what to offer
 * lives here, once.
 *
 * The Studio saves what the image model returns, which is WebP, and the store
 * is deliberately honest about it (a .webp is a .webp, never a mislabelled
 * .jpg). So "download" gave you WebP and nothing else. People want PNG for
 * anything with transparency and JPG for a photo going somewhere size matters,
 * and neither exists on disk — they are made from the pixels.
 *
 * SVG is the one format that is NOT made, and on purpose. SVG is vector.
 * Logos and flat Library icons already ARE SVG — the engine composes exact
 * geometry — so for those the SVG download is the real file. A generated
 * finish (glass, clay, metal) or a key-art frame is raster, and there is no
 * honest SVG of a photograph: wrapping the bitmap in an <svg> tag is a PNG in
 * a costume, and auto-tracing turns it into a posterised blob. So SVG is
 * offered when the source is vector, and not otherwise. That is what the
 * formats are, not a limit of ours.
 */

export type ImageExportFormat = 'original' | 'svg' | 'png' | 'jpg';

export interface ImageExportOption {
  format: ImageExportFormat;
  label: string;
  /** File extension the saved file gets. */
  ext: string;
}

const VECTOR_EXT = /\.svg$/i;

/** The path part of a URL, a data: URL's type, or the string itself. */
function pathOf(src: string): string {
  if (src.startsWith('data:')) return '';
  try { return new URL(src, 'http://x').pathname; } catch { return src; }
}

/** True when the asset's bytes are SVG — by extension, or by a declared type. */
export function isVectorSource(src: string | undefined, mime?: string | null): boolean {
  if (mime && /svg/i.test(mime)) return true;
  if (!src) return false;
  if (src.startsWith('data:image/svg')) return true;
  return VECTOR_EXT.test(pathOf(src));
}

/** The extension the ORIGINAL bytes carry, so "Original" keeps it. */
export function originalExt(src: string | undefined, fallback = 'webp'): string {
  if (!src) return fallback;
  if (src.startsWith('data:')) {
    const m = src.match(/^data:image\/([a-z0-9+.-]+)/i);
    if (!m) return fallback;
    const t = m[1].toLowerCase();
    return t === 'jpeg' ? 'jpg' : t === 'svg+xml' ? 'svg' : t;
  }
  const m = pathOf(src).match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : fallback;
}

/**
 * Which downloads to offer for an image.
 *   vector → SVG (the original) · PNG · JPG
 *   raster → Original (as saved) · PNG · JPG   (the original's own format is
 *            not offered twice: a PNG source gets Original (PNG) and JPG)
 * Non-image kinds get Original alone, from the caller.
 */
export function imageExportOptions(src: string | undefined, mime?: string | null): ImageExportOption[] {
  if (isVectorSource(src, mime)) {
    return [
      { format: 'svg', label: 'SVG', ext: 'svg' },
      { format: 'png', label: 'PNG', ext: 'png' },
      { format: 'jpg', label: 'JPG', ext: 'jpg' },
    ];
  }
  const ext = originalExt(src);
  const opts: ImageExportOption[] = [{ format: 'original', label: `Original (${ext.toUpperCase()})`, ext }];
  if (ext !== 'png') opts.push({ format: 'png', label: 'PNG', ext: 'png' });
  if (ext !== 'jpg' && ext !== 'jpeg') opts.push({ format: 'jpg', label: 'JPG', ext: 'jpg' });
  return opts;
}

/** Swap the extension on a filename, keeping the stem. */
export function withExt(filename: string, ext: string): string {
  const stem = filename.replace(/\.[a-z0-9]+$/i, '');
  return `${stem || 'download'}.${ext}`;
}
