// Documentation translation layer.
//
// English lives in content/*.ts (source of truth). The other 19 locales are
// generated translations stored in i18n/translations.ts, keyed by a stable
// per-block key. Renderers call getPages(locale) and receive the corpus with
// every translatable text swapped for its translation — falling back to
// English per-block whenever a translation is missing, so a partial run never
// shows blank or broken pages.
//
// Code blocks and `facts` blocks are never translated (code is code; facts are
// live data tables rendered from the typed data files).

import type { DocPage, DocBlock } from './types.js';
import { DOC_TRANSLATIONS } from './i18n/translations.js';

/** Stable key for a translatable string within a page. */
function pageKey(pageId: string): string {
  return `${pageId}#title`;
}

/** Every translatable [key, englishText] pair in a block. */
function blockEntries(pageId: string, idx: number, b: DocBlock): Array<[string, string]> {
  const base = `${pageId}#${idx}`;
  switch (b.type) {
    case 'paragraph': return [[`${base}#p`, b.text]];
    case 'heading': return [[`${base}#h`, b.text]];
    case 'list': return b.items.map((it, i) => [`${base}#li${i}`, it]);
    case 'callout': return [[`${base}#c`, b.text]];
    case 'link': return [[`${base}#a`, b.text]];
    case 'table': {
      const e: Array<[string, string]> = [];
      b.headers.forEach((h, c) => e.push([`${base}#th${c}`, h]));
      b.rows.forEach((r, ri) => r.forEach((cell, ci) => e.push([`${base}#td${ri}.${ci}`, cell])));
      return e;
    }
    default: return []; // code, facts — never translated
  }
}

/** Apply a translation dict to one block, English fallback per field. */
function applyBlock(pageId: string, idx: number, b: DocBlock, dict: Record<string, string>): DocBlock {
  const base = `${pageId}#${idx}`;
  const t = (k: string, fallback: string): string => dict[k] ?? fallback;
  switch (b.type) {
    case 'paragraph': return { ...b, text: t(`${base}#p`, b.text) };
    case 'heading': return { ...b, text: t(`${base}#h`, b.text) };
    case 'list': return { ...b, items: b.items.map((it, i) => t(`${base}#li${i}`, it)) };
    case 'callout': return { ...b, text: t(`${base}#c`, b.text) };
    case 'link': return { ...b, text: t(`${base}#a`, b.text) };
    case 'table': return {
      ...b,
      headers: b.headers.map((h, c) => t(`${base}#th${c}`, h)),
      rows: b.rows.map((r, ri) => r.map((cell, ci) => t(`${base}#td${ri}.${ci}`, cell))),
    };
    default: return b; // code, facts unchanged
  }
}

/**
 * Every translatable [key, englishText] pair across the given pages. Used by
 * the translate script to know what to send to the model. Order is stable.
 */
export function docTranslatableEntries(pages: DocPage[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const p of pages) {
    out.push([pageKey(p.id), p.title]);
    p.body.forEach((b, i) => { for (const e of blockEntries(p.id, i, b)) out.push(e); });
  }
  return out;
}

/** Locales we have (or can have) doc translations for. */
export function availableDocLocales(): string[] {
  return Object.keys(DOC_TRANSLATIONS);
}

/**
 * Return the corpus localized to `locale`. English (or an unknown locale)
 * returns the pages untouched. Otherwise each block's text is swapped for its
 * translation with per-block English fallback.
 */
export function localizePages(pages: DocPage[], locale: string | undefined): DocPage[] {
  if (!locale || locale === 'en') return pages;
  const dict = DOC_TRANSLATIONS[locale];
  if (!dict) return pages;
  return pages.map(p => ({
    ...p,
    title: dict[pageKey(p.id)] ?? p.title,
    body: p.body.map((b, i) => applyBlock(p.id, i, b, dict)),
  }));
}
