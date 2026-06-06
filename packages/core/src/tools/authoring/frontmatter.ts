/**
 * Front-matter + directive pre-pass for the authoring engine.
 *
 * Markdown can't express document metadata, callouts, page breaks, or
 * footnotes, so we layer a deliberately small extended syntax on top (the
 * pandoc/MyST playbook) and strip it here BEFORE `marked` sees the body:
 *
 *   ---                         YAML-lite front-matter (flat keys + one inline
 *   title: Q3 Proposal            map for `brand`). No js-yaml dependency.
 *   style: proposal
 *   ---
 *
 *   :::callout{type=warning title="Heads up"}   fenced directive → a callout
 *   Payment due in **30 days**.                  block (inner is real markdown)
 *   :::
 *
 *   :::pagebreak                                 a hard page break
 *
 *   [^1]: A footnote definition.                 collected → DocMeta.footnotes
 *
 * Everything else is plain markdown handled by md-parse.ts. These helpers are
 * pure string/structure transforms with no marked dependency, so they're
 * trivially unit-testable.
 */

import type { DocMeta, BrandTokens, CalloutVariant } from './doc-model.js';

// ── Front-matter ─────────────────────────────────────────────────────────────

/** Strip a leading `---\n…\n---` block and parse it into DocMeta. Returns the
 *  remaining body untouched when there's no front-matter. */
export function parseFrontMatter(raw: string): { meta: DocMeta; body: string } {
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(raw);
  if (!m) return { meta: {}, body: stripBom(raw) };
  return { meta: parseYamlLite(m[1]), body: raw.slice(m[0].length) };
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function parseYamlLite(src: string): DocMeta {
  const meta: DocMeta = {};
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    switch (key) {
      case 'title': meta.title = unquote(val); break;
      case 'subtitle': meta.subtitle = unquote(val); break;
      case 'author': meta.author = unquote(val); break;
      case 'date': meta.date = unquote(val); break;
      case 'style':
      case 'styleprofile': meta.styleProfile = unquote(val); break;
      case 'toc': meta.toc = parseBool(val); break;
      case 'brand': { const b = parseBrand(val); if (b) meta.brand = b; break; }
    }
  }
  return meta;
}

function unquote(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseBool(v: string): boolean {
  return /^(true|yes|on|1)$/i.test(v.trim());
}

function stripHash(v: string): string {
  return v.replace(/^#/, '').trim();
}

/** `brand: { headingColor: "0F766E", font: Georgia }` → BrandTokens. A bare
 *  word (`brand: ava`) means "use the defaults" and yields nothing. */
function parseBrand(val: string): BrandTokens | undefined {
  if (!val.startsWith('{')) return undefined;
  const inner = val.replace(/^\{/, '').replace(/\}$/, '').trim();
  if (!inner) return undefined;
  const out: BrandTokens = {};
  for (const pair of inner.split(',')) {
    const i = pair.indexOf(':');
    if (i === -1) continue;
    const k = pair.slice(0, i).trim().toLowerCase();
    const v = unquote(pair.slice(i + 1).trim());
    if (k === 'font') out.font = v;
    else if (k === 'headingcolor') out.headingColor = stripHash(v);
    else if (k === 'bodycolor') out.bodyColor = stripHash(v);
    else if (k === 'subtitlecolor') out.subtitleColor = stripHash(v);
  }
  return Object.keys(out).length ? out : undefined;
}

// ── Footnote definitions ─────────────────────────────────────────────────────

/** Pull `[^id]: text` definition lines out of the body into a map; references
 *  `[^id]` are left in place for the inline parser. */
export function extractFootnoteDefs(body: string): { body: string; defs: Record<string, string> } {
  const defs: Record<string, string> = {};
  const kept: string[] = [];
  const re = /^\[\^([^\]]+)\]:[ \t]?(.*)$/;
  for (const line of body.split(/\r?\n/)) {
    const m = re.exec(line);
    if (m) defs[m[1]] = m[2];
    else kept.push(line);
  }
  return { body: kept.join('\n'), defs };
}

// ── Directives ───────────────────────────────────────────────────────────────

export interface Segment {
  kind: 'markdown' | 'callout' | 'pagebreak';
  /** kind==='markdown' */
  text?: string;
  /** kind==='callout' */
  variant?: CalloutVariant;
  title?: string;
  body?: string;
}

/** Split a body into directive segments and plain-markdown runs. Callout fences
 *  (`:::callout{…}` or `:::warning` … `:::`) and `:::pagebreak` become their own
 *  segments; everything between is markdown for the lexer. */
export function splitDirectives(body: string): Segment[] {
  const lines = body.split(/\r?\n/);
  const segments: Segment[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length) {
      const text = buffer.join('\n');
      if (text.trim()) segments.push({ kind: 'markdown', text });
      buffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const open = /^:::+\s*([A-Za-z][\w-]*)\s*(.*)$/.exec(lines[i].trim());
    if (open) {
      const name = open[1].toLowerCase();
      if (name === 'pagebreak') {
        flush();
        segments.push({ kind: 'pagebreak' });
        continue;
      }
      if (name === 'callout' || isVariantWord(name)) {
        flush();
        const attrs = parseAttrs(open[2]);
        const variant = name === 'callout'
          ? normalizeVariant(attrs.type)
          : normalizeVariant(name);
        const inner: string[] = [];
        i++;
        while (i < lines.length && !/^:::+\s*$/.test(lines[i].trim())) {
          inner.push(lines[i]);
          i++;
        }
        segments.push({ kind: 'callout', variant, title: attrs.title, body: inner.join('\n') });
        continue;
      }
    }
    buffer.push(lines[i]);
  }
  flush();
  return segments;
}

/** Parse `{type=warning title="Heads up"}` (or bare `type=warning`) into a map. */
function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const inner = s.trim().replace(/^\{/, '').replace(/\}$/, '');
  const re = /([A-Za-z][\w-]*)=("([^"]*)"|'([^']*)'|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[2];
  }
  return out;
}

const VARIANTS: CalloutVariant[] = ['note', 'tip', 'warning', 'important', 'quote'];

function isVariantWord(w: string): boolean {
  return VARIANTS.includes(w as CalloutVariant) || w === 'info' || w === 'caution' || w === 'danger';
}

function normalizeVariant(w?: string): CalloutVariant {
  const v = (w ?? '').toLowerCase();
  if (v === 'info') return 'note';
  if (v === 'caution' || v === 'danger') return 'warning';
  return (VARIANTS as string[]).includes(v) ? (v as CalloutVariant) : 'note';
}
