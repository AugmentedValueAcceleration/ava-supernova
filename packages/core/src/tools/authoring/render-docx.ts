/**
 * DocModel → .docx (Word).
 *
 * Walks the rich model and assembles a branded Word document using the `docx`
 * library, honouring per-document house-style brand overrides. The library is
 * passed in via `loadDocx` (the optional-peer pattern), so this module has no
 * hard dependency on it. Reuses the brand tokens + profiles from
 * document-styling.ts.
 */

import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { Block, Inline, DocModel, ListItem } from './doc-model.js';
import { inlineToPlainText } from './doc-model.js';
import {
  AVA_TITLE_SIZE_DOCX, AVA_H1_SIZE_DOCX, AVA_H2_SIZE_DOCX, AVA_H3_SIZE_DOCX, AVA_H4_SIZE_DOCX,
  AVA_BODY_SIZE_DOCX, AVA_SUBTITLE_SIZE_DOCX, AVA_LINK_COLOR, AVA_ORDERED_REF,
  CALLOUT_COLORS, resolveBrand, sectionProperties, getStyleProfile,
  type Brand,
} from '../document-styling.js';
import { getImageSize } from './image-size.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RenderDocxOptions {
  /** Loads the `docx` peer dependency. */
  loadDocx: () => Promise<any>;
  /** Base directory for resolving relative image paths. */
  baseDir?: string;
}

const H_SIZE = [0, AVA_H1_SIZE_DOCX, AVA_H2_SIZE_DOCX, AVA_H3_SIZE_DOCX, AVA_H4_SIZE_DOCX];

export async function renderDocx(model: DocModel, opts: RenderDocxOptions): Promise<Buffer> {
  const docx = await opts.loadDocx();
  const { Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat } = docx;
  const brand = resolveBrand(model.meta.brand);
  const profile = getStyleProfile(model.meta.styleProfile);

  // Footnote id (string) → docx number (1-based), preserving first-seen order.
  const footnoteNumbers = new Map<string, number>();
  if (model.meta.footnotes) {
    let n = 1;
    for (const id of Object.keys(model.meta.footnotes)) footnoteNumbers.set(id, n++);
  }
  const ctx: BuildCtx = { docx, brand, footnoteNumbers, baseDir: opts.baseDir };

  const children: any[] = [];

  // Cover / title.
  if (model.meta.title) {
    children.push(new Paragraph({
      heading: docx.HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: model.meta.subtitle ? 80 : 200 },
      children: [new TextRun({ text: model.meta.title, font: brand.font, size: AVA_TITLE_SIZE_DOCX, bold: true, color: brand.headingColor })],
    }));
  }
  if (model.meta.subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 120 },
      children: [new TextRun({ text: model.meta.subtitle, font: brand.font, size: AVA_SUBTITLE_SIZE_DOCX, italics: true, color: brand.subtitleColor })],
    }));
  }
  const metaLine = [model.meta.author, model.meta.date].filter(Boolean).join('  ·  ');
  if (metaLine && profile.metadataBlock) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 240 },
      children: [new TextRun({ text: metaLine, font: brand.font, size: AVA_SUBTITLE_SIZE_DOCX, color: brand.subtitleColor })],
    }));
  }

  // Table of contents (Word fills it on open / field update).
  if (model.meta.toc) children.push(...tocField(ctx));

  // Body — images need async file loads, so build sequentially.
  for (const block of model.blocks) {
    const built = await buildBlock(block, ctx);
    children.push(...built);
  }

  // Footnote definitions.
  let footnotes: Record<number, { children: any[] }> | undefined;
  if (model.meta.footnotes && footnoteNumbers.size) {
    footnotes = {};
    for (const [id, inl] of Object.entries(model.meta.footnotes)) {
      const num = footnoteNumbers.get(id)!;
      footnotes[num] = { children: [new Paragraph({ children: inlineRuns(ctx, inl, { size: AVA_SUBTITLE_SIZE_DOCX }) })] };
    }
  }

  const numbering = {
    config: [{
      reference: AVA_ORDERED_REF,
      levels: [0, 1, 2, 3].map(level => ({
        level,
        format: LevelFormat.DECIMAL,
        text: `%${level + 1}.`,
        alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
      })),
    }],
  };

  const doc = new Document({
    numbering,
    ...(footnotes ? { footnotes } : {}),
    features: { updateFields: !!model.meta.toc },
    sections: [{ properties: sectionProperties(profile), children }],
  });
  return Packer.toBuffer(doc);
}

// ── Build context ────────────────────────────────────────────────────────────

interface BuildCtx {
  docx: any;
  brand: Brand;
  footnoteNumbers: Map<string, number>;
  baseDir?: string;
}

interface RunBase { size?: number; color?: string; bold?: boolean; italics?: boolean; font?: string; }

// ── Inline runs ──────────────────────────────────────────────────────────────

function inlineRuns(ctx: BuildCtx, inlines: Inline[], base?: RunBase): any[] {
  const { docx, brand } = ctx;
  const { TextRun, ExternalHyperlink, FootnoteReferenceRun } = docx;
  const size = base?.size ?? AVA_BODY_SIZE_DOCX;
  const color = base?.color ?? brand.bodyColor;
  const font = base?.font ?? brand.font;
  const runs: any[] = [];

  const walk = (nodes: Inline[], bold: boolean, italics: boolean) => {
    for (const n of nodes) {
      switch (n.type) {
        case 'text':
          runs.push(new TextRun({ text: n.text, font, size, color, bold, italics }));
          break;
        case 'strong': walk(n.inlines, true, italics); break;
        case 'em': walk(n.inlines, bold, true); break;
        case 'code':
          runs.push(new TextRun({ text: n.text, font: 'Consolas', size, color, bold, italics }));
          break;
        case 'link':
          runs.push(new ExternalHyperlink({
            link: n.href,
            children: [new TextRun({ text: inlineToPlainText(n.inlines) || n.href, font, size, color: AVA_LINK_COLOR, underline: {} })],
          }));
          break;
        case 'footnoteRef': {
          const num = ctx.footnoteNumbers.get(n.id);
          if (num != null && FootnoteReferenceRun) runs.push(new FootnoteReferenceRun(num));
          break;
        }
        case 'break':
          runs.push(new TextRun({ break: 1 }));
          break;
      }
    }
  };
  walk(inlines, base?.bold ?? false, base?.italics ?? false);
  return runs.length ? runs : [new TextRun({ text: '', font, size, color })];
}

// ── Block builders ───────────────────────────────────────────────────────────

async function buildBlock(block: Block, ctx: BuildCtx): Promise<any[]> {
  const { docx, brand } = ctx;
  const { Paragraph, TextRun, BorderStyle } = docx;

  switch (block.type) {
    case 'heading': {
      const levels = [null, docx.HeadingLevel.HEADING_1, docx.HeadingLevel.HEADING_2, docx.HeadingLevel.HEADING_3, docx.HeadingLevel.HEADING_4];
      return [new Paragraph({
        heading: levels[block.level],
        spacing: { before: 280, after: 160 },
        children: inlineRuns(ctx, block.inlines, { size: H_SIZE[block.level], color: brand.headingColor, bold: true }),
      })];
    }
    case 'paragraph':
      return [new Paragraph({ spacing: { after: 120, line: 276 }, children: inlineRuns(ctx, block.inlines) })];

    case 'list':
      return buildListItems(block.items, block.ordered, 0, ctx);

    case 'table':
      return [buildTable(block, ctx)];

    case 'blockquote': {
      const inner = (await Promise.all(block.blocks.map(b => buildBlock(b, ctx)))).flat();
      // Apply the quote bar/indent to each child paragraph.
      return inner.map((p: any) => p);
    }

    case 'callout':
      return [await buildCallout(block, ctx)];

    case 'image':
      return [await buildImage(block, ctx)];

    case 'code':
      return [new Paragraph({
        spacing: { before: 80, after: 120 },
        shading: { fill: 'F3F4F6' },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'D0D0D0', space: 8 } },
        children: block.text.split('\n').map((line, i) => new TextRun({ text: line, font: 'Consolas', size: AVA_BODY_SIZE_DOCX, color: '24292F', break: i === 0 ? 0 : 1 })),
      })];

    case 'pagebreak':
      return [new Paragraph({ children: [new docx.PageBreak()] })];

    case 'hr':
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D0D0D0', space: 1 } }, spacing: { after: 120 }, children: [new TextRun({ text: '' })] })];

    case 'toc':
      return tocField(ctx);
  }
}

function buildListItems(items: ListItem[], ordered: boolean, level: number, ctx: BuildCtx): any[] {
  const { docx } = ctx;
  const { Paragraph } = docx;
  const out: any[] = [];
  for (const item of items) {
    const props: any = { spacing: { after: 80 }, children: inlineRuns(ctx, item.inlines) };
    if (ordered) props.numbering = { reference: AVA_ORDERED_REF, level: Math.min(level, 3) };
    else props.bullet = { level: Math.min(level, 3) };
    out.push(new Paragraph(props));
    if (item.children?.length) {
      for (const child of item.children) {
        if (child.type === 'list') {
          out.push(...buildListItems(child.items, child.ordered, level + 1, ctx));
        } else {
          // Non-list child (paragraph) under a list item — indent it.
          out.push(new Paragraph({ indent: { left: 720 * (level + 1) }, spacing: { after: 80 }, children: inlineRuns(ctx, (child as any).inlines ?? []) }));
        }
      }
    }
  }
  return out;
}

function buildTable(block: Extract<Block, { type: 'table' }>, ctx: BuildCtx): any {
  const { docx, brand } = ctx;
  const { Paragraph, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } = docx;
  const ncol = block.headers.length || 1;
  const width = Math.floor(100 / ncol);
  const b = { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' };
  const cellBorders = { top: b, bottom: b, left: b, right: b };
  const alignFor = (i: number) => {
    const a = block.align?.[i];
    return a === 'center' ? AlignmentType.CENTER : a === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT;
  };
  const headerRow = new TableRow({
    tableHeader: true,
    children: block.headers.map((h, i) => new TableCell({
      children: [new Paragraph({ alignment: alignFor(i), children: inlineRuns(ctx, h, { bold: true, color: 'FFFFFF' }) })],
      shading: { fill: brand.headingColor }, width: { size: width, type: WidthType.PERCENTAGE }, borders: cellBorders,
    })),
  });
  const dataRows = block.rows.map((row, r) => new TableRow({
    children: row.map((cell, i) => new TableCell({
      children: [new Paragraph({ alignment: alignFor(i), children: inlineRuns(ctx, cell) })],
      shading: r % 2 === 1 ? { fill: 'F5F3FF' } : undefined, width: { size: width, type: WidthType.PERCENTAGE }, borders: cellBorders,
    })),
  }));
  return new Table({ rows: [headerRow, ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE } });
}

async function buildCallout(block: Extract<Block, { type: 'callout' }>, ctx: BuildCtx): Promise<any> {
  const { docx, brand } = ctx;
  const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle } = docx;
  const pal = CALLOUT_COLORS[block.variant] ?? CALLOUT_COLORS.note;
  const inner: any[] = [];
  const label = block.title ?? pal.label;
  if (label) inner.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: label, bold: true, font: brand.font, size: AVA_BODY_SIZE_DOCX, color: pal.bar })] }));
  const childBlocks = (await Promise.all(block.blocks.map(b => buildBlock(b, ctx)))).flat();
  inner.push(...childBlocks);
  const thin = { style: BorderStyle.SINGLE, size: 2, color: pal.fill };
  const cell = new TableCell({
    children: inner,
    shading: { fill: pal.fill },
    margins: { top: 100, bottom: 100, left: 160, right: 160 },
    borders: { left: { style: BorderStyle.SINGLE, size: 24, color: pal.bar }, top: thin, bottom: thin, right: thin },
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
  return new Table({ rows: [new TableRow({ children: [cell] })], width: { size: 100, type: WidthType.PERCENTAGE } });
}

async function buildImage(block: Extract<Block, { type: 'image' }>, ctx: BuildCtx): Promise<any> {
  const { docx } = ctx;
  const { Paragraph, TextRun, ImageRun, AlignmentType } = docx;
  try {
    const path = isAbsolute(block.src) ? block.src : resolve(ctx.baseDir ?? process.cwd(), block.src);
    const data = await readFile(path);
    const size = getImageSize(data);
    const targetW = Math.min(block.width ?? size?.width ?? 400, 600);
    const ratio = size && size.width ? size.height / size.width : 0.66;
    const targetH = Math.round(targetW * ratio);
    return new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 },
      children: [new ImageRun({ data, type: size?.type ?? 'png', transformation: { width: targetW, height: targetH } })],
    });
  } catch {
    // Missing/unreadable image → a caption placeholder, never a crash.
    return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: `[image: ${block.alt || block.src}]`, italics: true, color: '999999' })] });
  }
}

function tocField(ctx: BuildCtx): any[] {
  const { docx } = ctx;
  const { TableOfContents, Paragraph } = docx;
  return [new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-4' }), new Paragraph({ children: [] })];
}
