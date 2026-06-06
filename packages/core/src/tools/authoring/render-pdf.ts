/**
 * DocModel → .pdf.
 *
 * Walks the rich model with pdfkit (procedural, top-to-bottom). pdfkit is
 * passed in via `loadPdf` (optional-peer pattern). PDF has no native footnotes
 * or auto-TOC, so footnotes become an endnotes section and the TOC is a simple
 * contents list (no page numbers in v1). Reuses the brand tokens + the existing
 * `pdfTable` builder from document-styling.ts.
 */

import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { Block, Inline, DocModel, ListItem } from './doc-model.js';
import { inlineToPlainText } from './doc-model.js';
import {
  AVA_TITLE_SIZE_PDF, AVA_H1_SIZE_PDF, AVA_H2_SIZE_PDF, AVA_H3_SIZE_PDF, AVA_H4_SIZE_PDF,
  AVA_BODY_SIZE_PDF, AVA_SUBTITLE_SIZE_PDF, AVA_LINK_COLOR,
  CALLOUT_COLORS, resolveBrand, getStyleProfile, pdfTable,
  type Brand,
} from '../document-styling.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RenderPdfOptions {
  loadPdf: () => Promise<any>;
  baseDir?: string;
}

const H_SIZE_PDF = [0, AVA_H1_SIZE_PDF, AVA_H2_SIZE_PDF, AVA_H3_SIZE_PDF, AVA_H4_SIZE_PDF];

interface PdfCtx {
  doc: any;
  brand: Brand;
  footnoteNumbers: Map<string, number>;
  baseDir?: string;
}

export async function renderPdf(model: DocModel, opts: RenderPdfOptions): Promise<Buffer> {
  const pdfkit = await opts.loadPdf();
  const PDFDocument = pdfkit.default || pdfkit;
  const brand = resolveBrand(model.meta.brand);
  const profile = getStyleProfile(model.meta.styleProfile);
  const margins = {
    top: profile.margins.top / 20, right: profile.margins.right / 20,
    bottom: profile.margins.bottom / 20, left: profile.margins.left / 20,
  };

  const footnoteNumbers = new Map<string, number>();
  if (model.meta.footnotes) {
    let n = 1;
    for (const id of Object.keys(model.meta.footnotes)) footnoteNumbers.set(id, n++);
  }

  // Pre-load images (async) so the procedural walk stays synchronous.
  const images = await loadImages(model.blocks, opts.baseDir);

  return new Promise<Buffer>((resolvePromise) => {
    const doc = new PDFDocument({ margins, size: 'A4', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolvePromise(Buffer.concat(chunks)));

    const ctx: PdfCtx = { doc, brand, footnoteNumbers, baseDir: opts.baseDir };

    // Title / subtitle / meta.
    if (model.meta.title) {
      doc.font('Helvetica-Bold').fontSize(AVA_TITLE_SIZE_PDF).fillColor(`#${brand.headingColor}`).text(model.meta.title, { align: 'center' });
      doc.moveDown(0.4);
    }
    if (model.meta.subtitle) {
      doc.font('Helvetica-Oblique').fontSize(AVA_SUBTITLE_SIZE_PDF).fillColor(`#${brand.subtitleColor}`).text(model.meta.subtitle, { align: 'center' });
      doc.moveDown(0.3);
    }
    const metaLine = [model.meta.author, model.meta.date].filter(Boolean).join('  ·  ');
    if (metaLine && profile.metadataBlock) {
      doc.font('Helvetica').fontSize(AVA_SUBTITLE_SIZE_PDF).fillColor(`#${brand.subtitleColor}`).text(metaLine, { align: 'center' });
      doc.moveDown(0.8);
    }

    if (model.meta.toc) renderToc(ctx, model.blocks);

    for (const block of model.blocks) renderBlock(block, ctx, images, 0);

    renderFootnotes(ctx, model.meta.footnotes);

    doc.end();
  });
}

// ── Block rendering ──────────────────────────────────────────────────────────

function renderBlock(block: Block, ctx: PdfCtx, images: Map<string, Buffer>, indent: number): void {
  const { doc, brand } = ctx;
  switch (block.type) {
    case 'heading':
      doc.moveDown(0.3);
      pdfInline(ctx, block.inlines, { size: H_SIZE_PDF[block.level], color: brand.headingColor, bold: true, indent });
      doc.moveDown(0.2);
      break;

    case 'paragraph':
      pdfInline(ctx, block.inlines, { indent });
      doc.moveDown(0.4);
      break;

    case 'list':
      renderList(block.items, block.ordered, ctx, images, indent);
      break;

    case 'table':
      doc.moveDown(0.2);
      pdfTable(doc, {
        headers: block.headers.map(h => inlineToPlainText(h)),
        rows: block.rows.map(r => r.map(c => inlineToPlainText(c))),
      });
      doc.moveDown(0.4);
      break;

    case 'blockquote': {
      const x0 = doc.page.margins.left + indent;
      const yStart = doc.y;
      for (const b of block.blocks) renderBlock(b, ctx, images, indent + 18);
      doc.save().strokeColor('#D0D0D0').lineWidth(2).moveTo(x0 + 4, yStart).lineTo(x0 + 4, doc.y - 4).stroke().restore();
      break;
    }

    case 'callout':
      renderCallout(block, ctx, images, indent);
      break;

    case 'image':
      renderImage(block, ctx, images);
      break;

    case 'code':
      doc.moveDown(0.2);
      doc.font('Courier').fontSize(AVA_BODY_SIZE_PDF - 1).fillColor('#24292F')
        .text(block.text, doc.page.margins.left + indent + 8, doc.y, { width: usableWidth(doc) - indent - 16 });
      doc.moveDown(0.5);
      break;

    case 'pagebreak':
      doc.addPage();
      break;

    case 'hr': {
      doc.moveDown(0.3);
      const y = doc.y;
      doc.save().strokeColor('#D0D0D0').lineWidth(0.5).moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).stroke().restore();
      doc.moveDown(0.5);
      break;
    }

    case 'toc':
      // Inline [[toc]] markers are handled by the front-matter flag; ignore here.
      break;
  }
}

function renderList(items: ListItem[], ordered: boolean, ctx: PdfCtx, images: Map<string, Buffer>, indent: number): void {
  const { doc } = ctx;
  items.forEach((item, i) => {
    const marker = ordered ? `${i + 1}.` : '•';
    const x = doc.page.margins.left + indent + 16;
    doc.font('Helvetica').fontSize(AVA_BODY_SIZE_PDF).fillColor('#666666').text(marker, x - 14, doc.y, { continued: false, width: 14 });
    // Move cursor back up to render the item text beside the marker.
    pdfInline(ctx, item.inlines, { indent: indent + 16 });
    doc.moveDown(0.2);
    if (item.children?.length) {
      for (const child of item.children) {
        if (child.type === 'list') renderList(child.items, child.ordered, ctx, images, indent + 18);
        else renderBlock(child, ctx, images, indent + 18);
      }
    }
  });
  doc.moveDown(0.2);
}

function renderCallout(block: Extract<Block, { type: 'callout' }>, ctx: PdfCtx, images: Map<string, Buffer>, indent: number): void {
  const { doc } = ctx;
  const pal = CALLOUT_COLORS[block.variant] ?? CALLOUT_COLORS.note;
  const x0 = doc.page.margins.left + indent;
  doc.moveDown(0.2);
  const yStart = doc.y;
  const label = block.title ?? pal.label;
  if (label) {
    doc.font('Helvetica-Bold').fontSize(AVA_BODY_SIZE_PDF).fillColor(`#${pal.bar}`).text(label, x0 + 12, doc.y);
    doc.moveDown(0.1);
  }
  for (const b of block.blocks) renderBlock(b, ctx, images, indent + 12);
  // Accent bar down the left edge of the callout.
  doc.save().strokeColor(`#${pal.bar}`).lineWidth(3).moveTo(x0 + 1.5, yStart).lineTo(x0 + 1.5, doc.y - 4).stroke().restore();
  doc.moveDown(0.3);
}

function renderImage(block: Extract<Block, { type: 'image' }>, ctx: PdfCtx, images: Map<string, Buffer>): void {
  const { doc } = ctx;
  const data = images.get(block.src);
  doc.moveDown(0.2);
  if (data) {
    const w = Math.min(block.width ?? 360, usableWidth(doc));
    try { doc.image(data, { width: w }); } catch { /* skip bad image */ }
  } else {
    doc.font('Helvetica-Oblique').fontSize(AVA_SUBTITLE_SIZE_PDF).fillColor('#999999').text(`[image: ${block.alt || block.src}]`);
  }
  doc.moveDown(0.4);
}

function renderToc(ctx: PdfCtx, blocks: Block[]): void {
  const { doc, brand } = ctx;
  doc.font('Helvetica-Bold').fontSize(AVA_H1_SIZE_PDF).fillColor(`#${brand.headingColor}`).text('Contents');
  doc.moveDown(0.3);
  for (const b of blocks) {
    if (b.type === 'heading') {
      doc.font('Helvetica').fontSize(AVA_BODY_SIZE_PDF).fillColor(`#${brand.bodyColor}`)
        .text(inlineToPlainText(b.inlines), { indent: (b.level - 1) * 14 });
    }
  }
  doc.addPage();
}

function renderFootnotes(ctx: PdfCtx, footnotes?: Record<string, Inline[]>): void {
  const { doc, brand } = ctx;
  if (!footnotes || !ctx.footnoteNumbers.size) return;
  doc.moveDown(0.5);
  const y = doc.y;
  doc.save().strokeColor('#D0D0D0').lineWidth(0.5).moveTo(doc.page.margins.left, y).lineTo(doc.page.margins.left + 160, y).stroke().restore();
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(AVA_SUBTITLE_SIZE_PDF).fillColor(`#${brand.subtitleColor}`).text('Notes');
  doc.moveDown(0.2);
  for (const [id, inl] of Object.entries(footnotes)) {
    const num = ctx.footnoteNumbers.get(id);
    doc.font('Helvetica').fontSize(AVA_SUBTITLE_SIZE_PDF).fillColor(`#${brand.bodyColor}`).text(`${num}. ${inlineToPlainText(inl)}`);
  }
}

// ── Inline rendering ─────────────────────────────────────────────────────────

interface PdfInlineOpts { size?: number; color?: string; bold?: boolean; indent?: number; align?: string; }

function pdfInline(ctx: PdfCtx, inlines: Inline[], opts?: PdfInlineOpts): void {
  const { doc } = ctx;
  const segs = flattenInline(inlines, ctx);
  if (!segs.length) { doc.text(''); return; }
  const size = opts?.size ?? AVA_BODY_SIZE_PDF;
  const baseColor = opts?.color ?? ctx.brand.bodyColor;

  segs.forEach((s, i) => {
    const last = i === segs.length - 1;
    doc.font(s.code ? 'Courier' : pdfFont(!!opts?.bold || !!s.bold, !!s.italic))
      .fontSize(s.foot ? size - 3 : size)
      .fillColor(s.link ? `#${AVA_LINK_COLOR}` : `#${baseColor}`);
    const o: any = { continued: !last };
    if (opts?.indent != null && i === 0) o.indent = opts.indent;
    if (opts?.align && i === 0) o.align = opts.align;
    if (s.link) { o.link = s.link; o.underline = true; } else { o.link = null; o.underline = false; }
    doc.text(s.text, o);
  });
}

interface Seg { text: string; bold?: boolean; italic?: boolean; code?: boolean; link?: string; foot?: boolean; }

function flattenInline(nodes: Inline[], ctx: PdfCtx, bold = false, italic = false, link?: string, out: Seg[] = []): Seg[] {
  for (const n of nodes) {
    switch (n.type) {
      case 'text': out.push({ text: n.text, bold, italic, link }); break;
      case 'strong': flattenInline(n.inlines, ctx, true, italic, link, out); break;
      case 'em': flattenInline(n.inlines, ctx, bold, true, link, out); break;
      case 'code': out.push({ text: n.text, code: true, bold, italic }); break;
      case 'link': flattenInline(n.inlines, ctx, bold, italic, n.href, out); break;
      case 'footnoteRef': {
        const num = ctx.footnoteNumbers.get(n.id);
        if (num != null) out.push({ text: `[${num}]`, foot: true, bold, italic });
        break;
      }
      case 'break': out.push({ text: '\n', bold, italic }); break;
    }
  }
  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pdfFont(bold: boolean, italic: boolean): string {
  if (bold && italic) return 'Helvetica-BoldOblique';
  if (bold) return 'Helvetica-Bold';
  if (italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

function usableWidth(doc: any): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

async function loadImages(blocks: Block[], baseDir?: string): Promise<Map<string, Buffer>> {
  const map = new Map<string, Buffer>();
  const srcs = new Set<string>();
  const gather = (bs: Block[]) => {
    for (const b of bs) {
      if (b.type === 'image') srcs.add(b.src);
      if (b.type === 'blockquote' || b.type === 'callout') gather(b.blocks);
      if (b.type === 'list') for (const it of b.items) if (it.children) gather(it.children);
    }
  };
  gather(blocks);
  for (const src of srcs) {
    try {
      const path = isAbsolute(src) ? src : resolve(baseDir ?? process.cwd(), src);
      map.set(src, await readFile(path));
    } catch { /* leave missing; renderImage shows a placeholder */ }
  }
  return map;
}
