/**
 * Markdown(-extended) → DocModel.
 *
 * The single entry point is `parseMarkdown(raw)`. It runs the front-matter /
 * directive / footnote pre-pass (frontmatter.ts), then maps a `marked` token
 * stream onto the rich Block/Inline model (doc-model.ts). marked is a hard core
 * dependency, so parsing always works on every surface; only the renderers need
 * the optional docx/pdfkit peers.
 *
 * marked's tokens carry nested `tokens` arrays at every level (a heading's
 * inline runs, a list item's children), which is exactly what the model needs —
 * so the mapping is a structural walk, not a re-parse.
 */

import { marked } from 'marked';
import type { Block, Inline, ListItem, DocModel, Align, CalloutVariant } from './doc-model.js';
import { parseFrontMatter, extractFootnoteDefs, splitDirectives } from './frontmatter.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function parseMarkdown(raw: string): DocModel {
  const { meta, body } = parseFrontMatter(raw);
  const { body: noFootnotes, defs } = extractFootnoteDefs(body);

  const blocks: Block[] = [];
  for (const seg of splitDirectives(noFootnotes)) {
    if (seg.kind === 'pagebreak') {
      blocks.push({ type: 'pagebreak' });
    } else if (seg.kind === 'callout') {
      blocks.push({
        type: 'callout',
        variant: seg.variant ?? 'note',
        title: seg.title,
        blocks: parseBlocks(seg.body ?? ''),
      });
    } else if (seg.text) {
      blocks.push(...parseBlocks(seg.text));
    }
  }

  // Footnote definitions: parse each definition string as inline markdown.
  if (Object.keys(defs).length) {
    meta.footnotes = {};
    for (const [id, text] of Object.entries(defs)) {
      meta.footnotes[id] = parseInlineString(text);
    }
  }

  // Lift a leading H1 into the title when front-matter didn't set one, so a
  // plain markdown doc still gets a proper cover/title.
  if (!meta.title && blocks[0]?.type === 'heading' && blocks[0].level === 1) {
    meta.title = inlinePlain(blocks[0].inlines);
    blocks.shift();
  }

  return { meta, blocks };
}

// ── Block mapping ────────────────────────────────────────────────────────────

function parseBlocks(src: string): Block[] {
  const tokens = marked.lexer(src);
  const out: Block[] = [];
  for (const t of tokens as any[]) {
    const block = blockFromToken(t);
    if (block) out.push(...(Array.isArray(block) ? block : [block]));
  }
  return out;
}

function blockFromToken(t: any): Block | Block[] | null {
  switch (t.type) {
    case 'heading':
      return { type: 'heading', level: clampLevel(t.depth), inlines: inlinesFrom(t.tokens) };

    case 'paragraph': {
      // Standalone image → image block (with optional {width=N}).
      const img = asStandaloneImage(t.tokens);
      if (img) return img;
      // [[toc]] / [toc] marker → table of contents.
      if (isTocMarker(t.text)) return { type: 'toc' };
      return { type: 'paragraph', inlines: inlinesFrom(t.tokens) };
    }

    case 'list':
      return {
        type: 'list',
        ordered: !!t.ordered,
        items: (t.items ?? []).map(mapListItem),
      };

    case 'table':
      return {
        type: 'table',
        headers: (t.header ?? []).map((c: any) => inlinesFrom(c.tokens)),
        rows: (t.rows ?? []).map((row: any[]) => row.map((c: any) => inlinesFrom(c.tokens))),
        align: (t.align ?? []).map((a: string | null): Align => (a as Align) ?? 'left'),
      };

    case 'blockquote': {
      const variant = leadingCalloutVariant(t.text);
      const inner = parseBlocks(stripBlockquoteMarkers(t.raw ?? t.text ?? ''));
      // A blockquote whose first line is `[!NOTE]`-style becomes a callout.
      return variant
        ? { type: 'callout', variant, blocks: inner }
        : { type: 'blockquote', blocks: inner };
    }

    case 'code':
      return { type: 'code', lang: t.lang || undefined, text: t.text ?? '' };

    case 'hr':
      return { type: 'hr' };

    case 'space':
    case 'html':
      return null;

    default:
      // Fallback: render any unknown block as a paragraph of its raw text.
      if (t.tokens) return { type: 'paragraph', inlines: inlinesFrom(t.tokens) };
      if (t.text) return { type: 'paragraph', inlines: [{ type: 'text', text: t.text }] };
      return null;
  }
}

function mapListItem(item: any): ListItem {
  const inlines: Inline[] = [];
  const children: Block[] = [];
  for (const child of (item.tokens ?? []) as any[]) {
    if (child.type === 'text') {
      // The item's own text line — may carry nested inline tokens.
      inlines.push(...(child.tokens ? inlinesFrom(child.tokens) : splitText(child.text ?? '')));
    } else {
      const block = blockFromToken(child);
      if (block) children.push(...(Array.isArray(block) ? block : [block]));
    }
  }
  return children.length ? { inlines, children } : { inlines };
}

// ── Inline mapping ───────────────────────────────────────────────────────────

function inlinesFrom(tokens: any[] | undefined): Inline[] {
  const out: Inline[] = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'text':
      case 'escape':
        out.push(...(t.tokens ? inlinesFrom(t.tokens) : splitText(t.text ?? '')));
        break;
      case 'strong':
        out.push({ type: 'strong', inlines: inlinesFrom(t.tokens) });
        break;
      case 'em':
        out.push({ type: 'em', inlines: inlinesFrom(t.tokens) });
        break;
      case 'del':
        // No strikethrough in the model — keep the inner content.
        out.push(...inlinesFrom(t.tokens));
        break;
      case 'codespan':
        out.push({ type: 'code', text: t.text ?? '' });
        break;
      case 'link':
        out.push({ type: 'link', href: t.href ?? '', inlines: t.tokens ? inlinesFrom(t.tokens) : splitText(t.text ?? '') });
        break;
      case 'image':
        // Inline image → fall back to its alt text (block images are hoisted).
        if (t.text) out.push({ type: 'text', text: t.text });
        break;
      case 'br':
        out.push({ type: 'break' });
        break;
      case 'html':
        break;
      default:
        if (t.text) out.push({ type: 'text', text: t.text });
    }
  }
  return out;
}

/** Split a raw text string on footnote references `[^id]`. */
function splitText(text: string): Inline[] {
  if (!text.includes('[^')) return text ? [{ type: 'text', text }] : [];
  const out: Inline[] = [];
  const re = /\[\^([^\]]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    out.push({ type: 'footnoteRef', id: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

/** Parse a short markdown string to inlines (footnote definitions, etc.). */
export function parseInlineString(src: string): Inline[] {
  const tokens = marked.lexer(src.trim());
  const first = (tokens as any[])[0];
  if (first?.type === 'paragraph') return inlinesFrom(first.tokens);
  return splitText(src.trim());
}

// ── Small helpers ────────────────────────────────────────────────────────────

function clampLevel(depth: number): 1 | 2 | 3 | 4 {
  if (depth <= 1) return 1;
  if (depth >= 4) return 4;
  return depth as 2 | 3;
}

function asStandaloneImage(tokens: any[] | undefined): Block | null {
  if (!tokens || tokens.length === 0) return null;
  const first = tokens[0];
  if (first.type !== 'image') return null;
  // Any trailing tokens must be empty/whitespace or a {width=N} attribute.
  let width: number | undefined;
  for (const t of tokens.slice(1)) {
    const text = (t.text ?? t.raw ?? '').trim();
    if (!text) continue;
    const w = /^\{[^}]*\bwidth=(\d+)[^}]*\}$/.exec(text);
    if (w) { width = Number(w[1]); continue; }
    return null; // real trailing content → not a standalone image
  }
  return { type: 'image', src: first.href ?? '', alt: first.text || undefined, width };
}

function isTocMarker(text: string): boolean {
  return /^\[\[?toc\]?\]$/i.test((text ?? '').trim());
}

function inlinePlain(inlines: Inline[]): string {
  return inlines.map(n => {
    if (n.type === 'text' || n.type === 'code') return n.text;
    if (n.type === 'strong' || n.type === 'em' || n.type === 'link') return inlinePlain(n.inlines);
    return '';
  }).join('');
}

/** GitHub-style `> [!WARNING]` alerts inside a blockquote → callout variant. */
function leadingCalloutVariant(text: string | undefined): CalloutVariant | null {
  const m = /^\s*\[!(\w+)\]/.exec(text ?? '');
  if (!m) return null;
  const v = m[1].toLowerCase();
  if (v === 'note') return 'note';
  if (v === 'tip') return 'tip';
  if (v === 'warning' || v === 'caution') return 'warning';
  if (v === 'important') return 'important';
  return null;
}

function stripBlockquoteMarkers(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map(l => l.replace(/^\s*>\s?/, ''))
    .filter(l => !/^\s*\[!\w+\]\s*$/.test(l)) // drop the [!NOTE] marker line
    .join('\n');
}
