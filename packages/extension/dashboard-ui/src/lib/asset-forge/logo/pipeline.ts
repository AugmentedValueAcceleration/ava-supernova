// ─── Logo pipeline (webview side) ────────────────────────────────────────────
//
// The two host round-trips the logo make needs: trace a symbol raster → SVG
// (server vtracer, host-proxied because the webview has no platform key), and
// load a bundled wordmark font's bytes (host reads the file → base64, CSP-free —
// no fetch). Symbol GENERATION reuses the shared asset_forge lane in
// DesignStudio (its own pending flag), so it's not here.

import { post } from '../../../App';
import * as opentype from 'opentype.js';
import { parseFont } from './wordmark';
import { WORDMARK_FONTS } from './fonts';

/** One-shot request/response over the window message channel. */
function once<T>(
  match: (m: Record<string, unknown>) => boolean,
  extract: (m: Record<string, unknown>) => T,
  send: () => void,
  timeoutMs = 120000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      const m = e.data as Record<string, unknown>;
      if (!m || !match(m)) return;
      clearTimeout(timer);
      window.removeEventListener('message', handler);
      try { resolve(extract(m)); } catch (err) { reject(err instanceof Error ? err : new Error(String(err))); }
    };
    const timer = setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('Timed out')); }, timeoutMs);
    window.addEventListener('message', handler);
    send();
  });
}

/** Trace a flat symbol raster (data URL) → clean SVG via the server vectorizer. */
export function vectorizeSymbol(imageUrl: string, mode: 'bw' | 'color' = 'bw'): Promise<string> {
  return once<string>(
    (m) => m.type === 'asset_forge_vectorize_result',
    (m) => { if (!m.success || !m.svg) throw new Error((m.error as string) || 'Vectorize failed'); return m.svg as string; },
    () => post({ type: 'asset_forge_vectorize', imageUrl, mode } as never),
  );
}

const bytesCache = new Map<string, Uint8Array>();

/** Fetch a bundled font's raw bytes (host reads the file → base64). Cached. */
async function loadFontBytes(file: string): Promise<Uint8Array> {
  const cached = bytesCache.get(file);
  if (cached) return cached;
  const base64 = await once<string>(
    (m) => m.type === 'logo_font_loaded' && m.file === file,
    (m) => { if (!m.success || !m.base64) throw new Error((m.error as string) || 'Font load failed'); return m.base64 as string; },
    () => post({ type: 'load_logo_font', file } as never),
  );
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  bytesCache.set(file, bytes);
  return bytes;
}

const fontCache = new Map<string, opentype.Font>();

/** Load a bundled wordmark font by filename as a parsed opentype Font. Cached. */
export async function loadFont(file: string): Promise<opentype.Font> {
  const cached = fontCache.get(file);
  if (cached) return cached;
  const bytes = await loadFontBytes(file);
  const font = parseFont(bytes.buffer as ArrayBuffer);
  fontCache.set(file, font);
  return font;
}

const registeredFaces = new Set<string>();

/** Register the bundled wordmark fonts as FontFaces — straight from bytes, so no
 *  url()/font-src and no CSP change. Lets the font picker render each name IN its
 *  own typeface. Best-effort per font; a failure just falls back to system text. */
export async function registerWordmarkFonts(): Promise<void> {
  await Promise.all(WORDMARK_FONTS.map(async (f) => {
    if (registeredFaces.has(f.id)) return;
    try {
      const bytes = await loadFontBytes(f.file);
      const face = new FontFace(f.id, bytes as BufferSource);
      await face.load();
      (document as unknown as { fonts: FontFaceSet }).fonts.add(face);
      registeredFaces.add(f.id);
    } catch { /* skip a font that won't register */ }
  }));
}
