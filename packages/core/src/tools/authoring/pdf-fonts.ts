/**
 * Fonts for PDFs in every one of Ava's languages (Documents 1.0, 15 Nov 2026).
 *
 * installPdfFonts(doc, text) does two things to a pdfkit document:
 *
 *   1. The standard names ('Helvetica', 'Helvetica-Bold', …) are pointed at
 *      Noto Sans, which covers every Latin accent (Polish, Turkish,
 *      Vietnamese), Cyrillic and Greek — so every existing call writes those
 *      correctly, tables included, with no other change.
 *   2. doc.text is wrapped: text holding Arabic, Devanagari, Thai, Chinese,
 *      Japanese or Korean is split into runs and each run is written in the
 *      font for its script, then the font is put back.
 *
 * The fonts come from AVA_FONTS_DIR (the extension and the IDE set it to the
 * fonts they ship), else the build cache beside core. Bold Chinese, Japanese
 * and Korean come from ~/.ava/fonts when the person has downloaded them.
 * With no fonts at all the PDF is written as before — the caller can ask
 * missingScripts() and say so plainly rather than hand back a garbled file.
 */

import { existsSync } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPTIONAL_FONTS } from './font-manifest.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Script = 'latin' | 'arabic' | 'devanagari' | 'thai' | 'cjk';
export type CjkFace = 'sc' | 'tc' | 'jp' | 'kr';

/** The script of one character, or null for a neutral one (space, digit, punctuation). */
export function scriptOf(ch: string): Script | null {
  const c = ch.codePointAt(0) ?? 0;
  if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f) || (c >= 0x08a0 && c <= 0x08ff) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff)) return 'arabic';
  if ((c >= 0x0900 && c <= 0x097f) || (c >= 0xa8e0 && c <= 0xa8ff)) return 'devanagari';
  if (c >= 0x0e00 && c <= 0x0e7f) return 'thai';
  if ((c >= 0x1100 && c <= 0x11ff) || (c >= 0x2e80 && c <= 0x2fdf) || (c >= 0x3000 && c <= 0x30ff) || (c >= 0x3130 && c <= 0x318f)
    || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff)
    || (c >= 0xff00 && c <= 0xffef) || (c >= 0x20000 && c <= 0x2fa1f)) return 'cjk';
  if (/[\p{L}]/u.test(ch)) return 'latin';
  return null;
}

/** Text in runs of one script each; neutral characters stay with the run they sit in. */
export function splitByScript(text: string): Array<{ script: Script; text: string }> {
  const out: Array<{ script: Script; text: string }> = [];
  for (const ch of Array.from(text)) {
    const s = scriptOf(ch);
    const last = out[out.length - 1];
    if (!last) { out.push({ script: s ?? 'latin', text: ch }); continue; }
    if (s === null || s === last.script) { last.text += ch; continue; }
    // A run that so far holds only neutral characters takes the script of what follows.
    if (scriptOf(Array.from(last.text).find((x) => scriptOf(x) !== null) ?? '') === null) { last.script = s; last.text += ch; continue; }
    out.push({ script: s, text: ch });
  }
  return out;
}

/** Which Chinese/Japanese/Korean letterforms a document wants. */
export function cjkFaceFor(text: string, lang?: string): CjkFace {
  if (lang) {
    const l = lang.toLowerCase();
    if (l.startsWith('ja')) return 'jp';
    if (l.startsWith('ko')) return 'kr';
    if (l === 'zh-tw' || l === 'zh-hk' || l.startsWith('zh-hant')) return 'tc';
    if (l.startsWith('zh')) return 'sc';
  }
  if (/[぀-ヿ]/.test(text)) return 'jp';
  if (/[가-힯ᄀ-ᇿ]/.test(text)) return 'kr';
  return 'sc';
}

/** Mostly right-to-left text (Arabic): a paragraph that should sit on the right. */
export function isMostlyRtl(text: string): boolean {
  let rtl = 0, ltr = 0;
  for (const ch of text) { const s = scriptOf(ch); if (s === 'arabic') rtl++; else if (s) ltr++; }
  return rtl > 0 && rtl >= ltr;
}

// ── Where the fonts are ──────────────────────────────────────────────────────

/** Ava's own folder for downloaded fonts (the optional pack). */
export function userFontsDir(): string {
  return join(process.env.AVA_HOME || join(homedir(), '.ava'), 'fonts');
}

function bundledFontsDir(): string | null {
  const candidates: string[] = [];
  if (process.env.AVA_FONTS_DIR) candidates.push(process.env.AVA_FONTS_DIR);
  try {
    // Unbundled core (tests, the dev host's sidecar): the build cache beside the package.
    const here = dirname(fileURLToPath(import.meta.url));
    candidates.push(join(here, '..', '..', '..', '.fonts-cache'), join(here, '..', '..', '.fonts-cache'));
  } catch { /* bundled as CommonJS: AVA_FONTS_DIR is set by the host */ }
  return candidates.find((d) => existsSync(join(d, 'NotoSans-Regular.ttf'))) ?? null;
}

// ── Into a pdfkit document ───────────────────────────────────────────────────

/**
 * Give a pdfkit document fonts for every script in `allText`. Returns false
 * (and changes nothing) when no fonts are installed.
 */
export function installPdfFonts(doc: any, allText: string, lang?: string): boolean {
  const dir = bundledFontsDir();
  if (!dir) return false;
  const f = (name: string) => join(dir, name);
  // 1. Latin / Cyrillic / Greek / Vietnamese. Registered under their own names
  //    and swapped in for the standard ones below: pdfkit caches its built-in
  //    'Helvetica' when the document is created, so re-registering that name
  //    is silently ignored for regular text (found in testing, 15 Nov 2026).
  const LATIN: Record<string, string> = {
    Helvetica: 'ava-latin', 'Helvetica-Bold': 'ava-latin-bold', 'Helvetica-Oblique': 'ava-latin-italic', 'Helvetica-BoldOblique': 'ava-latin-bolditalic',
  };
  doc.registerFont('ava-latin', f('NotoSans-Regular.ttf'));
  doc.registerFont('ava-latin-bold', f('NotoSans-Bold.ttf'));
  doc.registerFont('ava-latin-italic', f('NotoSans-Italic.ttf'));
  doc.registerFont('ava-latin-bolditalic', f('NotoSans-BoldItalic.ttf'));

  // 2. The other scripts, only when the document uses them.
  const needs = new Set(splitByScript(allText).map((r) => r.script));
  const face = cjkFaceFor(allText, lang);
  const boldCjk = join(userFontsDir(), 'NotoSansCJK-Bold.ttc');
  const fonts: Partial<Record<Script, { regular: string; bold: string }>> = {};
  if (needs.has('arabic')) {
    doc.registerFont('ava-arabic', f('NotoSansArabic-Regular.ttf'));
    doc.registerFont('ava-arabic-bold', f('NotoSansArabic-Bold.ttf'));
    fonts.arabic = { regular: 'ava-arabic', bold: 'ava-arabic-bold' };
  }
  if (needs.has('devanagari')) {
    doc.registerFont('ava-deva', f('NotoSansDevanagari-Regular.ttf'));
    doc.registerFont('ava-deva-bold', f('NotoSansDevanagari-Bold.ttf'));
    fonts.devanagari = { regular: 'ava-deva', bold: 'ava-deva-bold' };
  }
  if (needs.has('thai')) {
    doc.registerFont('ava-thai', f('NotoSansThai-Regular.ttf'));
    doc.registerFont('ava-thai-bold', f('NotoSansThai-Bold.ttf'));
    fonts.thai = { regular: 'ava-thai', bold: 'ava-thai-bold' };
  }
  if (needs.has('cjk') && existsSync(f('NotoSansCJK-Regular.ttc'))) {
    doc.registerFont('ava-cjk', f('NotoSansCJK-Regular.ttc'), `NotoSansCJK${face}-Regular`);
    // Real bold only with the optional pack; otherwise bold prints at regular weight.
    if (existsSync(boldCjk)) doc.registerFont('ava-cjk-bold', boldCjk, `NotoSansCJK${face}-Bold`);
    fonts.cjk = { regular: 'ava-cjk', bold: existsSync(boldCjk) ? 'ava-cjk-bold' : 'ava-cjk' };
  }
  // Track the font each call asks for, so a run can switch away and back;
  // the standard names become Noto Sans.
  const origFont = doc.font.bind(doc);
  let current = 'ava-latin';
  doc.font = (src: any, ...rest: any[]) => {
    if (typeof src === 'string') { current = LATIN[src] ?? src; return origFont(current, ...rest); }
    return origFont(src, ...rest);
  };
  doc.font('Helvetica');
  if (!Object.keys(fonts).length) return true;

  const origText = doc.text.bind(doc);
  doc.text = (text: any, x?: any, y?: any, options?: any) => {
    const str = text == null ? '' : String(text);
    const runs = splitByScript(str);
    if (runs.every((r) => r.script === 'latin' || !fonts[r.script])) return origText(text, x, y, options);
    // pdfkit takes (text, options) or (text, x, y, options).
    let opts: any = options;
    let px: any = x, py: any = y;
    if (typeof x === 'object' && x !== null) { opts = x; px = undefined; py = undefined; }
    const base = current;
    const bold = /bold/i.test(base);
    runs.forEach((run, i) => {
      const last = i === runs.length - 1;
      const pick = run.script === 'latin' ? base : (fonts[run.script]?.[bold ? 'bold' : 'regular'] ?? base);
      origFont(pick);
      const o = { ...(opts ?? {}), continued: last ? Boolean(opts?.continued) : true };
      if (i === 0 && px !== undefined) origText(run.text, px, py, o);
      else origText(run.text, o);
    });
    origFont(base);
    current = base;
    return doc;
  };
  return true;
}

/** Scripts in the text that this build cannot write into a PDF. */
export function missingScripts(text: string): Script[] {
  const dir = bundledFontsDir();
  const used = new Set(splitByScript(text).map((r) => r.script));
  if (dir) return existsSync(join(dir, 'NotoSansCJK-Regular.ttc')) || !used.has('cjk') ? [] : ['cjk'];
  // No fonts: the built-in ones cover Western European letters only.
  const latinBeyond = Array.from(text).some((ch) => scriptOf(ch) === 'latin' && (ch.codePointAt(0) ?? 0) > 0xff);
  return [...used].filter((s) => s !== 'latin' || latinBeyond);
}

// ── The optional pack (bold Chinese, Japanese and Korean) ────────────────────

export interface OptionalFontsStatus { installed: boolean; sizeBytes: number }

export async function optionalFontsStatus(): Promise<OptionalFontsStatus> {
  const sizeBytes = OPTIONAL_FONTS.reduce((n, f) => n + f.size, 0);
  for (const f of OPTIONAL_FONTS) {
    try { if ((await stat(join(userFontsDir(), f.file))).size !== f.size) return { installed: false, sizeBytes }; } catch { return { installed: false, sizeBytes }; }
  }
  return { installed: true, sizeBytes };
}

/**
 * Download the optional pack into ~/.ava/fonts. Every file is checked against
 * its SHA-256 before it is kept; a wrong or damaged download is thrown away.
 */
export async function downloadOptionalFonts(onProgress?: (done: number, total: number) => void): Promise<void> {
  const dir = userFontsDir();
  await mkdir(dir, { recursive: true });
  const total = OPTIONAL_FONTS.reduce((n, f) => n + f.size, 0);
  let done = 0;
  for (const f of OPTIONAL_FONTS) {
    const res = await fetch(f.url);
    if (!res.ok || !res.body) throw new Error(`The font download failed (${res.status}).`);
    const chunks: Uint8Array[] = [];
    const reader = res.body.getReader();
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      chunks.push(value);
      done += value.length;
      onProgress?.(Math.min(done, total), total);
    }
    const bytes = Buffer.concat(chunks);
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== f.size || sha !== f.sha256) throw new Error('The downloaded font did not match the expected file, so it was not kept.');
    const tmp = join(dir, `${f.file}.part`);
    await writeFile(tmp, bytes);
    await rename(tmp, join(dir, f.file));
  }
}

export async function removeOptionalFonts(): Promise<void> {
  for (const f of OPTIONAL_FONTS) await rm(join(userFontsDir(), f.file), { force: true });
}
