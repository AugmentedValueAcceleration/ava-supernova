/**
 * Canonical document model for Ava's authoring engine.
 *
 * This is the rich AST that sits between Markdown (the editable source of
 * truth) and the rendered artifacts (.docx / .pdf / normalized .md). It mirrors
 * the structure of a `marked` token stream — block-level nodes that each carry
 * inline-level children — so the parser maps onto it cleanly, and the renderers
 * walk it without re-parsing.
 *
 * It deliberately replaces the old flat `DocumentContent` ({ title, sections:
 * [{ heading, text, list, table }] }) which had no inline formatting, capped
 * headings at H2, and could not express ordered/nested lists, callouts, images,
 * footnotes, or page breaks. `legacyToDocModel` bridges the old shape so
 * existing callers (e.g. report_generate) keep working during migration.
 */

import type { DocumentContent } from '../document-templates.js';

// ── Inline level ─────────────────────────────────────────────────────────────

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; inlines: Inline[] }
  | { type: 'em'; inlines: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; inlines: Inline[] }
  | { type: 'footnoteRef'; id: string }
  | { type: 'break' };

// ── Block level ──────────────────────────────────────────────────────────────

export type Align = 'left' | 'center' | 'right';
export type CalloutVariant = 'note' | 'tip' | 'warning' | 'important' | 'quote';

export interface ListItem {
  inlines: Inline[];
  /** Nested blocks (sub-lists, paragraphs) under this item. */
  children?: Block[];
}

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; inlines: Inline[] }
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'table'; headers: Inline[][]; rows: Inline[][][]; align?: Align[] }
  | { type: 'blockquote'; blocks: Block[] }
  | { type: 'callout'; variant: CalloutVariant; title?: string; blocks: Block[] }
  | { type: 'image'; src: string; alt?: string; width?: number }
  | { type: 'code'; lang?: string; text: string }
  | { type: 'pagebreak' }
  | { type: 'hr' }
  | { type: 'toc' };

// ── Document metadata (front-matter) ─────────────────────────────────────────

/** Per-document brand overrides ("house style"). Anything omitted falls back
 *  to the Ava brand defaults in document-styling.ts. Colours are 6-digit hex
 *  WITHOUT the leading '#', matching the document-styling token convention. */
export interface BrandTokens {
  font?: string;
  headingColor?: string;
  bodyColor?: string;
  subtitleColor?: string;
}

export interface DocMeta {
  title?: string;
  subtitle?: string;
  author?: string;
  date?: string;
  /** Selects a DocumentStyleProfile (e.g. 'proposal', 'letter') for margins,
   *  cover page, footer. Defaults to the standard profile. */
  styleProfile?: string;
  /** House-style brand overrides merged over the Ava defaults. */
  brand?: BrandTokens;
  /** Render a table of contents where a `toc` block (or the front-matter flag)
   *  asks for one. */
  toc?: boolean;
  /** Footnote definitions, keyed by id, collected by the parser pre-pass. */
  footnotes?: Record<string, Inline[]>;
}

export interface DocModel {
  meta: DocMeta;
  blocks: Block[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap a plain string as a single text inline. */
export function textInline(text: string): Inline[] {
  return text ? [{ type: 'text', text }] : [];
}

/** Flatten an inline tree back to plain text (for TOC entries, alt text,
 *  headings used as anchors, etc.). */
export function inlineToPlainText(inlines: Inline[]): string {
  let out = '';
  for (const n of inlines) {
    switch (n.type) {
      case 'text':
      case 'code':
        out += n.text;
        break;
      case 'strong':
      case 'em':
      case 'link':
        out += inlineToPlainText(n.inlines);
        break;
      case 'break':
        out += ' ';
        break;
      case 'footnoteRef':
        break;
    }
  }
  return out;
}

/**
 * Bridge the legacy flat `DocumentContent` shape onto the rich model so existing
 * producers (report_generate, the old document_manage create path) can render
 * through the new engine unchanged. Each legacy section's `text` is split on
 * blank lines into paragraphs; `list` becomes an unordered list; `table` carries
 * straight across. No inline formatting is inferred — legacy text was plain.
 */
export function legacyToDocModel(content?: DocumentContent): DocModel {
  const blocks: Block[] = [];
  for (const section of content?.sections ?? []) {
    if (section.heading) {
      blocks.push({ type: 'heading', level: 1, inlines: textInline(section.heading) });
    }
    if (section.text) {
      for (const para of section.text.split(/\n{2,}/)) {
        const trimmed = para.trim();
        if (trimmed) blocks.push({ type: 'paragraph', inlines: textInline(trimmed) });
      }
    }
    if (section.list) {
      blocks.push({
        type: 'list',
        ordered: false,
        items: section.list.map(item => ({ inlines: textInline(item) })),
      });
    }
    if (section.table) {
      blocks.push({
        type: 'table',
        headers: section.table.headers.map(h => textInline(h)),
        rows: section.table.rows.map(row => row.map(cell => textInline(cell))),
      });
    }
  }
  return { meta: { title: content?.title }, blocks };
}
