/**
 * The transcode behind the Library's PNG / JPG downloads.
 *
 * WHAT to offer is decided in core (`@ava/core/authoring/image-formats`) and
 * pinned by a test there — including why a raster image never grows an SVG
 * option. This file is only the part that needs a canvas: turning the pixels
 * we already have into the format that was asked for. Both webviews (VS
 * Code's and WebView2's) decode WebP natively, so there is nothing to ship.
 */

export {
  imageExportOptions as exportOptionsFor,
  isVectorSource,
  originalExt,
  withExt,
  type ImageExportFormat as ExportFormat,
  type ImageExportOption as ExportOption,
} from '@ava/core/authoring/image-formats';

/**
 * Re-encode an image as PNG or JPEG and return it as a data URL.
 *
 * JPEG has no alpha channel, so a matted icon would get a BLACK background by
 * default — the canvas's transparent pixels encode as black. It is composited
 * onto white first, which is what anyone asking for a JPG of an icon expects.
 * PNG keeps transparency.
 *
 * `crossOrigin = 'anonymous'` so a cloud asset (public storage sends CORS *)
 * does not taint the canvas; a source that refuses CORS throws from toDataURL
 * and the caller reports it rather than saving a blank.
 */
export function transcodeImage(src: string, format: 'png' | 'jpg', quality = 0.92): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) throw new Error('Image has no size.');
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable.');
        if (format === 'jpg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png', quality));
      } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); }
    };
    img.onerror = () => reject(new Error('Could not load the image to convert it.'));
    img.src = src;
  });
}
