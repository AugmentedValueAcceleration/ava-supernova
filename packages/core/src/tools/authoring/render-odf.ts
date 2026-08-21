/**
 * DocModel → OpenDocument (.odt text, .ods spreadsheet).
 *
 * Walks the same rich model the docx and pdf renderers walk, honouring the
 * same brand tokens, so the three formats are one document in three coats
 * rather than three separate documents. Unlike those two this needs no peer
 * dependency: an ODF file is XML in a zip, and both halves are in Node's
 * standard library (see ./zip.ts). The open format is the one that always
 * works, which is the point of offering it.
 */

import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { Block, Inline, DocModel, ListItem, Align } from './doc-model.js';
import { inlineToPlainText } from './doc-model.js';
import {
  AVA_TITLE_SIZE_PDF, AVA_H1_SIZE_PDF, AVA_H2_SIZE_PDF, AVA_H3_SIZE_PDF, AVA_H4_SIZE_PDF,
  AVA_BODY_SIZE_PDF, AVA_SUBTITLE_SIZE_PDF, AVA_LINK_COLOR, CALLOUT_COLORS, resolveBrand,
  type Brand,
} from '../document-styling.js';
import { getImageSize } from './image-size.js';
import { zipSync, type ZipEntry } from './zip.js';

export interface RenderOdfOptions {
  /** Base directory for resolving relative image paths. */
  baseDir?: string;
  /** Fixed modification time — pass one for byte-reproducible output. */
  modified?: Date;
}

const MONO_FONT = 'Consolas';
/** Usable width between the page margins, in cm — images are capped to it so
 *  an oversized screenshot cannot push the text off the page. */
const CONTENT_WIDTH_CM = 16.5;

// ── XML helpers ──────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escape for a text run. ODF collapses whitespace like HTML, so tabs, newlines
 * and runs of spaces need explicit elements or indentation silently vanishes —
 * which matters most inside code blocks.
 */
function textNode(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\t') { out += '<text:tab/>'; i++; continue; }
    if (ch === '\n') { out += '<text:line-break/>'; i++; continue; }
    if (ch === ' ') {
      let n = 0;
      while (s[i + n] === ' ') n++;
      out += n === 1 ? ' ' : ` <text:s text:c="${n - 1}"/>`;
      i += n;
      continue;
    }
    let j = i;
    while (j < s.length && s[j] !== '\t' && s[j] !== '\n' && s[j] !== ' ') j++;
    out += esc(s.slice(i, j));
    i = j;
  }
  return out;
}

function hex(color: string): string {
  return color.startsWith('#') ? color : `#${color}`;
}

// ── Render context ───────────────────────────────────────────────────────────

interface Ctx {
  brand: Brand;
  baseDir?: string;
  /** Footnote id → 1-based citation number, first-seen order. */
  footnoteNumbers: Map<string, number>;
  footnotes: Record<string, Inline[]>;
  /** Images pulled into the package, in the order encountered. */
  pictures: { name: string; data: Buffer; mime: string }[];
  /** Distinct column counts seen, so each table gets a matching column style. */
  tableCount: number;
}

// ── Inline runs ──────────────────────────────────────────────────────────────

interface RunState { bold: boolean; italic: boolean }

function spanStyle(state: RunState): string | null {
  if (state.bold && state.italic) return 'T_BoldItalic';
  if (state.bold) return 'T_Bold';
  if (state.italic) return 'T_Italic';
  return null;
}

function inlineXml(ctx: Ctx, inlines: Inline[], state: RunState = { bold: false, italic: false }): string {
  let out = '';
  for (const node of inlines) {
    switch (node.type) {
      case 'text': {
        const style = spanStyle(state);
        const body = textNode(node.text);
        out += style ? `<text:span text:style-name="${style}">${body}</text:span>` : body;
        break;
      }
      case 'strong':
        out += inlineXml(ctx, node.inlines, { ...state, bold: true });
        break;
      case 'em':
        out += inlineXml(ctx, node.inlines, { ...state, italic: true });
        break;
      case 'code':
        out += `<text:span text:style-name="T_Code">${textNode(node.text)}</text:span>`;
        break;
      case 'link':
        out += `<text:a xlink:type="simple" xlink:href="${esc(node.href)}">`
          + `<text:span text:style-name="T_Link">${inlineXml(ctx, node.inlines, state)}</text:span></text:a>`;
        break;
      case 'footnoteRef':
        out += footnoteXml(ctx, node.id);
        break;
      case 'break':
        out += '<text:line-break/>';
        break;
    }
  }
  return out;
}

/** ODF carries the note body at the reference point rather than in a separate
 *  part, so the definition is emitted inline the first time it is cited. */
function footnoteXml(ctx: Ctx, id: string): string {
  const n = ctx.footnoteNumbers.get(id);
  if (!n) return '';
  const body = ctx.footnotes[id];
  const inner = body ? inlineXml(ctx, body) : '';
  return `<text:note text:id="ftn${n}" text:note-class="footnote">`
    + `<text:note-citation>${n}</text:note-citation>`
    + `<text:note-body><text:p text:style-name="Footnote">${inner}</text:p></text:note-body>`
    + '</text:note>';
}

// ── Blocks ───────────────────────────────────────────────────────────────────

async function blocksXml(ctx: Ctx, blocks: Block[], model: DocModel): Promise<string> {
  let out = '';
  for (const block of blocks) out += await blockXml(ctx, block, model);
  return out;
}

async function blockXml(ctx: Ctx, block: Block, model: DocModel): Promise<string> {
  switch (block.type) {
    case 'heading':
      return `<text:h text:style-name="Heading_20_${block.level}" text:outline-level="${block.level}">`
        + `${inlineXml(ctx, block.inlines)}</text:h>`;

    case 'paragraph':
      return `<text:p text:style-name="Standard">${inlineXml(ctx, block.inlines)}</text:p>`;

    case 'list':
      return await listXml(ctx, block.ordered, block.items, model);

    case 'table':
      return tableXml(ctx, block.headers, block.rows, block.align);

    case 'blockquote': {
      // Quotation styling lives on the paragraphs, so nested blocks keep their
      // own shape (a list inside a quote stays a list).
      const inner = await blocksXml(ctx, block.blocks, model);
      return inner.replace(/text:style-name="Standard"/g, 'text:style-name="Quotations"');
    }

    case 'callout': {
      const variant = CALLOUT_COLORS[block.variant] ? block.variant : 'note';
      const label = block.title ?? CALLOUT_COLORS[variant].label;
      const inner = await blocksXml(ctx, block.blocks, model);
      const styled = inner.replace(/text:style-name="Standard"/g, `text:style-name="P_Callout_${variant}"`);
      const head = label
        ? `<text:p text:style-name="P_CalloutLabel_${variant}">${textNode(label)}</text:p>`
        : '';
      return head + styled;
    }

    case 'image':
      return await imageXml(ctx, block);

    case 'code':
      // One paragraph per line: ODF has no block-level preformatted container,
      // and a single paragraph with line-breaks loses per-line background.
      return block.text.split('\n')
        .map((line) => `<text:p text:style-name="P_Code">${line ? textNode(line) : ''}</text:p>`)
        .join('');

    case 'pagebreak':
      return '<text:p text:style-name="P_PageBreak"/>';

    case 'hr':
      return '<text:p text:style-name="P_Hr"/>';

    case 'toc':
      return tocXml(model);
  }
}

async function listXml(ctx: Ctx, ordered: boolean, items: ListItem[], model: DocModel): Promise<string> {
  const style = ordered ? 'L_Order' : 'L_Bullet';
  let out = `<text:list text:style-name="${style}">`;
  for (const item of items) {
    out += '<text:list-item>';
    out += `<text:p text:style-name="P_ListItem">${inlineXml(ctx, item.inlines)}</text:p>`;
    if (item.children?.length) out += await blocksXml(ctx, item.children, model);
    out += '</text:list-item>';
  }
  return out + '</text:list>';
}

function cellParaStyle(align: Align | undefined): string {
  return align === 'center' ? 'P_CellCenter' : align === 'right' ? 'P_CellRight' : 'P_Cell';
}

function tableXml(ctx: Ctx, headers: Inline[][], rows: Inline[][][], align?: Align[]): string {
  const cols = Math.max(headers.length, ...rows.map((r) => r.length), 1);
  const name = `Table${++ctx.tableCount}`;

  let out = `<table:table table:name="${name}" table:style-name="Ta_Doc">`;
  out += `<table:table-column table:style-name="Co_Doc" table:number-columns-repeated="${cols}"/>`;

  const cell = (inlines: Inline[] | undefined, i: number, header: boolean) => {
    const style = header ? 'Ce_Head' : 'Ce_Body';
    const para = header ? 'P_CellHead' : cellParaStyle(align?.[i]);
    const body = inlines ? inlineXml(ctx, inlines) : '';
    return `<table:table-cell table:style-name="${style}" office:value-type="string">`
      + `<text:p text:style-name="${para}">${body}</text:p></table:table-cell>`;
  };

  if (headers.length) {
    out += '<table:table-header-rows><table:table-row>';
    for (let i = 0; i < cols; i++) out += cell(headers[i], i, true);
    out += '</table:table-row></table:table-header-rows>';
  }
  for (const row of rows) {
    out += '<table:table-row>';
    for (let i = 0; i < cols; i++) out += cell(row[i], i, false);
    out += '</table:table-row>';
  }
  return out + '</table:table>';
}

async function imageXml(ctx: Ctx, block: Extract<Block, { type: 'image' }>): Promise<string> {
  let data: Buffer;
  try {
    const path = isAbsolute(block.src) ? block.src : resolve(ctx.baseDir ?? '.', block.src);
    data = await readFile(path);
  } catch {
    // A missing image is not worth failing an export over — say so in place,
    // the way a broken <img> shows its alt text.
    const alt = block.alt || block.src;
    return `<text:p text:style-name="P_ImageMissing">[${textNode(alt)}]</text:p>`;
  }

  const size = getImageSize(data);
  if (!size) return `<text:p text:style-name="P_ImageMissing">[${textNode(block.alt || block.src)}]</text:p>`;

  const mime = size.type === 'jpg' ? 'image/jpeg' : `image/${size.type}`;
  const name = `Pictures/image${ctx.pictures.length + 1}.${size.type}`;
  ctx.pictures.push({ name, data, mime });

  // Model widths are pixels; ODF wants physical units. 96dpi is the same
  // assumption the docx renderer makes, so the two agree on scale.
  const pxWidth = block.width || size.width;
  let widthCm = (pxWidth / 96) * 2.54;
  let heightCm = widthCm * (size.height / size.width);
  if (widthCm > CONTENT_WIDTH_CM) {
    heightCm *= CONTENT_WIDTH_CM / widthCm;
    widthCm = CONTENT_WIDTH_CM;
  }

  const title = block.alt ? `<svg:title>${esc(block.alt)}</svg:title>` : '';
  return '<text:p text:style-name="P_Image">'
    + `<draw:frame draw:style-name="Fr_Image" draw:name="Image${ctx.pictures.length}" `
    + `text:anchor-type="as-char" svg:width="${widthCm.toFixed(3)}cm" svg:height="${heightCm.toFixed(3)}cm" draw:z-index="0">`
    + `<draw:image xlink:href="${esc(name)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>`
    + `${title}</draw:frame></text:p>`;
}

/**
 * A real ODF index, not a frozen list: the entry templates let LibreOffice
 * refresh page numbers on open, while the stored body means a reader that
 * never refreshes still shows contents.
 */
function tocXml(model: DocModel): string {
  let templates = '';
  for (let level = 1; level <= 4; level++) {
    templates += `<text:table-of-content-entry-template text:outline-level="${level}" text:style-name="Contents_20_${level}">`
      + '<text:index-entry-chapter/><text:index-entry-text/>'
      + '<text:index-entry-tab-stop style:type="right" style:leader-char="."/>'
      + '<text:index-entry-page-number/></text:table-of-content-entry-template>';
  }

  let body = '<text:index-title text:name="Contents_Head">'
    + '<text:p text:style-name="Contents_20_Heading">Contents</text:p></text:index-title>';
  for (const block of model.blocks) {
    if (block.type !== 'heading') continue;
    body += `<text:p text:style-name="Contents_20_${block.level}">${esc(inlineToPlainText(block.inlines))}</text:p>`;
  }

  return '<text:table-of-content text:style-name="Sect_Toc" text:protected="true" text:name="Contents">'
    + '<text:table-of-content-source text:outline-level="4" text:use-outline-level="true">'
    + '<text:index-title-template text:style-name="Contents_20_Heading">Contents</text:index-title-template>'
    + templates
    + '</text:table-of-content-source>'
    + `<text:index-body>${body}</text:index-body>`
    + '</text:table-of-content>';
}

// ── Style sheets ─────────────────────────────────────────────────────────────

const CONTENT_NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
].join(' ');

function fontFaces(brand: Brand): string {
  return '<office:font-face-decls>'
    + `<style:font-face style:name="${esc(brand.font)}" svg:font-family="${esc(brand.font)}"/>`
    + `<style:font-face style:name="${MONO_FONT}" svg:font-family="${MONO_FONT}" style:font-family-generic="modern" style:font-pitch="fixed"/>`
    + '</office:font-face-decls>';
}

/** Named styles — the ones a user sees in the sidebar and can restyle. */
function stylesXml(brand: Brand): string {
  const base = `style:font-name="${esc(brand.font)}" fo:font-size="${AVA_BODY_SIZE_PDF}pt" fo:color="${hex(brand.bodyColor)}"`;

  const heading = (name: string, level: number, size: number) =>
    `<style:style style:name="${name}" style:family="paragraph" style:parent-style-name="Standard" style:default-outline-level="${level}">`
    + `<style:paragraph-properties fo:margin-top="${level === 1 ? '0.5' : '0.35'}cm" fo:margin-bottom="0.2cm" fo:keep-with-next="always"/>`
    + `<style:text-properties style:font-name="${esc(brand.font)}" fo:font-size="${size}pt" fo:font-weight="bold" fo:color="${hex(brand.headingColor)}"/>`
    + '</style:style>';

  return '<?xml version="1.0" encoding="UTF-8"?>'
    + `<office:document-styles ${CONTENT_NS} office:version="1.3">`
    + fontFaces(brand)
    + '<office:styles>'
    + `<style:style style:name="Standard" style:family="paragraph" style:class="text">`
    + '<style:paragraph-properties fo:margin-bottom="0.25cm" fo:line-height="130%"/>'
    + `<style:text-properties ${base}/></style:style>`

    + '<style:style style:name="Title" style:family="paragraph" style:parent-style-name="Standard">'
    + '<style:paragraph-properties fo:text-align="center" fo:margin-bottom="0.15cm"/>'
    + `<style:text-properties style:font-name="${esc(brand.font)}" fo:font-size="${AVA_TITLE_SIZE_PDF}pt" fo:font-weight="bold" fo:color="${hex(brand.headingColor)}"/></style:style>`

    + '<style:style style:name="Subtitle" style:family="paragraph" style:parent-style-name="Standard">'
    + '<style:paragraph-properties fo:text-align="center" fo:margin-bottom="0.4cm"/>'
    + `<style:text-properties fo:font-size="${AVA_SUBTITLE_SIZE_PDF}pt" fo:font-style="italic" fo:color="${hex(brand.subtitleColor)}"/></style:style>`

    + heading('Heading_20_1', 1, AVA_H1_SIZE_PDF)
    + heading('Heading_20_2', 2, AVA_H2_SIZE_PDF)
    + heading('Heading_20_3', 3, AVA_H3_SIZE_PDF)
    + heading('Heading_20_4', 4, AVA_H4_SIZE_PDF)

    + '<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard">'
    + `<style:paragraph-properties fo:margin-left="0.8cm" fo:margin-right="0.4cm" fo:padding-left="0.3cm" fo:border-left="2pt solid ${hex(CALLOUT_COLORS.quote.bar)}" fo:border-right="none" fo:border-top="none" fo:border-bottom="none"/>`
    + `<style:text-properties fo:font-style="italic" fo:color="${hex(brand.subtitleColor)}"/></style:style>`

    + '<style:style style:name="Preformatted_20_Text" style:family="paragraph" style:parent-style-name="Standard">'
    + '<style:paragraph-properties fo:margin-bottom="0cm" fo:line-height="115%"/>'
    + `<style:text-properties style:font-name="${MONO_FONT}" fo:font-size="9pt"/></style:style>`

    + '<style:style style:name="Footnote" style:family="paragraph" style:parent-style-name="Standard">'
    + '<style:paragraph-properties fo:margin-bottom="0cm"/>'
    + `<style:text-properties fo:font-size="9pt" fo:color="${hex(brand.subtitleColor)}"/></style:style>`

    + '<style:style style:name="Contents_20_Heading" style:family="paragraph" style:parent-style-name="Standard">'
    + '<style:paragraph-properties fo:margin-top="0.4cm" fo:margin-bottom="0.25cm"/>'
    + `<style:text-properties fo:font-size="${AVA_H1_SIZE_PDF}pt" fo:font-weight="bold" fo:color="${hex(brand.headingColor)}"/></style:style>`
    + [1, 2, 3, 4].map((l) =>
      `<style:style style:name="Contents_20_${l}" style:family="paragraph" style:parent-style-name="Standard">`
      + `<style:paragraph-properties fo:margin-left="${(l - 1) * 0.5}cm" fo:margin-bottom="0.1cm">`
      + '<style:tab-stops><style:tab-stop style:position="16.5cm" style:type="right" style:leader-style="dotted" style:leader-text="."/></style:tab-stops>'
      + '</style:paragraph-properties></style:style>').join('')

    + '</office:styles>'
    + '<office:automatic-styles>'
    + '<style:page-layout style:name="PL1"><style:page-layout-properties '
    + 'fo:page-width="21.001cm" fo:page-height="29.7cm" style:print-orientation="portrait" '
    + 'fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2.25cm" fo:margin-right="2.25cm"/></style:page-layout>'
    + '</office:automatic-styles>'
    + '<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="PL1"/></office:master-styles>'
    + '</office:document-styles>';
}

/** Automatic styles — the machine-generated ones the walk above references. */
function automaticStyles(brand: Brand): string {
  const span = (name: string, props: string) =>
    `<style:style style:name="${name}" style:family="text"><style:text-properties ${props}/></style:style>`;

  const callouts = Object.entries(CALLOUT_COLORS).map(([variant, c]) =>
    `<style:style style:name="P_Callout_${variant}" style:family="paragraph" style:parent-style-name="Standard">`
    + `<style:paragraph-properties fo:background-color="${hex(c.fill)}" fo:padding="0.15cm" fo:margin-bottom="0cm" `
    + `fo:border-left="3pt solid ${hex(c.bar)}" fo:border-right="none" fo:border-top="none" fo:border-bottom="none"/>`
    + '</style:style>'
    + `<style:style style:name="P_CalloutLabel_${variant}" style:family="paragraph" style:parent-style-name="Standard">`
    + `<style:paragraph-properties fo:background-color="${hex(c.fill)}" fo:padding="0.15cm" fo:padding-bottom="0cm" fo:margin-top="0.25cm" fo:margin-bottom="0cm" `
    + `fo:border-left="3pt solid ${hex(c.bar)}" fo:border-right="none" fo:border-top="none" fo:border-bottom="none" fo:keep-with-next="always"/>`
    + `<style:text-properties fo:font-weight="bold" fo:color="${hex(c.bar)}"/></style:style>`).join('');

  return span('T_Bold', 'fo:font-weight="bold"')
    + span('T_Italic', 'fo:font-style="italic"')
    + span('T_BoldItalic', 'fo:font-weight="bold" fo:font-style="italic"')
    + span('T_Code', `style:font-name="${MONO_FONT}" fo:font-size="9.5pt" fo:background-color="#f1f5f9"`)
    + span('T_Link', `fo:color="${hex(AVA_LINK_COLOR)}" style:text-underline-style="solid" style:text-underline-width="auto"`)

    + '<style:style style:name="P_Code" style:family="paragraph" style:parent-style-name="Preformatted_20_Text">'
    + '<style:paragraph-properties fo:background-color="#f8fafc" fo:padding-left="0.2cm" fo:padding-right="0.2cm"/></style:style>'

    + '<style:style style:name="P_ListItem" style:family="paragraph" style:parent-style-name="Standard">'
    + '<style:paragraph-properties fo:margin-bottom="0.1cm"/></style:style>'

    + '<style:style style:name="P_PageBreak" style:family="paragraph" style:parent-style-name="Standard">'
    + '<style:paragraph-properties fo:break-before="page"/></style:style>'

    + '<style:style style:name="P_Hr" style:family="paragraph" style:parent-style-name="Standard">'
    + '<style:paragraph-properties fo:border-bottom="1pt solid #d4d4d8" fo:border-top="none" fo:border-left="none" fo:border-right="none" fo:margin-top="0.3cm" fo:margin-bottom="0.3cm"/></style:style>'

    + '<style:style style:name="P_Image" style:family="paragraph" style:parent-style-name="Standard">'
    + '<style:paragraph-properties fo:text-align="center"/></style:style>'
    + '<style:style style:name="P_ImageMissing" style:family="paragraph" style:parent-style-name="Standard">'
    + `<style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-style="italic" fo:color="${hex(brand.subtitleColor)}"/></style:style>`
    + '<style:style style:name="Fr_Image" style:family="graphic">'
    + '<style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline" fo:border="none"/></style:style>'

    // Tables: relative column widths so any column count fits the page.
    + '<style:style style:name="Ta_Doc" style:family="table">'
    + '<style:table-properties style:rel-width="100%" table:align="margins" fo:margin-top="0.2cm" fo:margin-bottom="0.3cm"/></style:style>'
    + '<style:style style:name="Co_Doc" style:family="table-column">'
    + '<style:table-column-properties style:rel-column-width="1*"/></style:style>'
    + '<style:style style:name="Ce_Head" style:family="table-cell">'
    + `<style:table-cell-properties fo:background-color="${hex(CALLOUT_COLORS.note.fill)}" fo:padding="0.12cm" fo:border="0.5pt solid #d4d4d8"/></style:style>`
    + '<style:style style:name="Ce_Body" style:family="table-cell">'
    + '<style:table-cell-properties fo:padding="0.12cm" fo:border="0.5pt solid #e4e4e7"/></style:style>'
    + '<style:style style:name="P_CellHead" style:family="paragraph" style:parent-style-name="Standard">'
    + `<style:paragraph-properties fo:margin-bottom="0cm"/><style:text-properties fo:font-weight="bold" fo:color="${hex(brand.headingColor)}"/></style:style>`
    + ['P_Cell:start', 'P_CellCenter:center', 'P_CellRight:end'].map((pair) => {
      const [name, align] = pair.split(':');
      return `<style:style style:name="${name}" style:family="paragraph" style:parent-style-name="Standard">`
        + `<style:paragraph-properties fo:text-align="${align}" fo:margin-bottom="0cm"/></style:style>`;
    }).join('')

    + callouts

    // Lists: four levels is what the parser can produce.
    + listStyle('L_Bullet', false)
    + listStyle('L_Order', true)
    + '<style:style style:name="Sect_Toc" style:family="section"/>';
}

function listStyle(name: string, ordered: boolean): string {
  let out = `<text:list-style style:name="${name}">`;
  const bullets = ['•', '◦', '▪', '·'];
  for (let level = 1; level <= 4; level++) {
    const indent = `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment">`
      + `<style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.5cm" fo:margin-left="${level * 0.65}cm"/>`
      + '</style:list-level-properties>';
    out += ordered
      ? `<text:list-level-style-number text:level="${level}" style:num-suffix="." style:num-format="1">${indent}</text:list-level-style-number>`
      : `<text:list-level-style-bullet text:level="${level}" text:bullet-char="${bullets[level - 1]}">${indent}</text:list-level-style-bullet>`;
  }
  return out + '</text:list-style>';
}

// ── Package assembly ─────────────────────────────────────────────────────────

function metaXml(model: DocModel): string {
  const m = model.meta;
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + `<office:document-meta ${CONTENT_NS} office:version="1.3"><office:meta>`
    + '<meta:generator>Ava Supernova</meta:generator>'
    + (m.title ? `<dc:title>${esc(m.title)}</dc:title>` : '')
    + (m.subtitle ? `<dc:subject>${esc(m.subtitle)}</dc:subject>` : '')
    + (m.author ? `<meta:initial-creator>${esc(m.author)}</meta:initial-creator><dc:creator>${esc(m.author)}</dc:creator>` : '')
    + (m.date ? `<dc:date>${esc(m.date)}</dc:date>` : '')
    + '</office:meta></office:document-meta>';
}

function manifestXml(mimetype: string, pictures: { name: string; mime: string }[]): string {
  const entry = (path: string, type: string) =>
    `<manifest:file-entry manifest:full-path="${esc(path)}" manifest:media-type="${type}"/>`;
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">'
    + `<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${mimetype}"/>`
    + entry('content.xml', 'text/xml')
    + entry('styles.xml', 'text/xml')
    + entry('meta.xml', 'text/xml')
    + pictures.map((p) => entry(p.name, p.mime)).join('')
    + '</manifest:manifest>';
}

function pack(
  mimetype: string,
  content: string,
  styles: string,
  meta: string,
  pictures: { name: string; data: Buffer; mime: string }[],
  modified?: Date,
): Buffer {
  const entries: ZipEntry[] = [
    // Must be first and uncompressed — a reader sniffs the type from the
    // stream's opening bytes without unpacking anything.
    { name: 'mimetype', data: Buffer.from(mimetype, 'ascii'), store: true },
    { name: 'META-INF/manifest.xml', data: Buffer.from(manifestXml(mimetype, pictures), 'utf8') },
    { name: 'content.xml', data: Buffer.from(content, 'utf8') },
    { name: 'styles.xml', data: Buffer.from(styles, 'utf8') },
    { name: 'meta.xml', data: Buffer.from(meta, 'utf8') },
    ...pictures.map((p) => ({ name: p.name, data: p.data })),
  ];
  return zipSync(entries, modified);
}

function newCtx(model: DocModel, opts: RenderOdfOptions): Ctx {
  const footnoteNumbers = new Map<string, number>();
  let n = 1;
  for (const id of Object.keys(model.meta.footnotes ?? {})) footnoteNumbers.set(id, n++);
  return {
    brand: resolveBrand(model.meta.brand),
    baseDir: opts.baseDir,
    footnoteNumbers,
    footnotes: model.meta.footnotes ?? {},
    pictures: [],
    tableCount: 0,
  };
}

// ── .odt ─────────────────────────────────────────────────────────────────────

export const ODT_MIMETYPE = 'application/vnd.oasis.opendocument.text';

export async function renderOdt(model: DocModel, opts: RenderOdfOptions = {}): Promise<Buffer> {
  const ctx = newCtx(model, opts);
  const { brand } = ctx;

  let body = '';
  if (model.meta.title) body += `<text:p text:style-name="Title">${textNode(model.meta.title)}</text:p>`;
  if (model.meta.subtitle) body += `<text:p text:style-name="Subtitle">${textNode(model.meta.subtitle)}</text:p>`;
  const byline = [model.meta.author, model.meta.date].filter(Boolean).join(' · ');
  if (byline) body += `<text:p text:style-name="Subtitle">${textNode(byline)}</text:p>`;

  // A front-matter `toc: true` means the same thing as a `toc` block, but only
  // when the document did not already place one itself.
  if (model.meta.toc && !model.blocks.some((b) => b.type === 'toc')) body += tocXml(model);

  body += await blocksXml(ctx, model.blocks, model);

  const content = '<?xml version="1.0" encoding="UTF-8"?>'
    + `<office:document-content ${CONTENT_NS} office:version="1.3">`
    + fontFaces(brand)
    + `<office:automatic-styles>${automaticStyles(brand)}</office:automatic-styles>`
    + `<office:body><office:text>${body}</office:text></office:body>`
    + '</office:document-content>';

  return pack(ODT_MIMETYPE, content, stylesXml(brand), metaXml(model), ctx.pictures, opts.modified);
}

// ── .ods ─────────────────────────────────────────────────────────────────────

export const ODS_MIMETYPE = 'application/vnd.oasis.opendocument.spreadsheet';

/** Sheet names cannot carry these, and readers cap the length around 31. */
function sheetName(raw: string, used: Set<string>): string {
  let name = raw.replace(/[[\]*?:/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Sheet';
  let candidate = name;
  let n = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${name} ${n++}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Cells that hold a number become numeric cells, not text — that is the whole
 * difference between a spreadsheet you can sum and a grid of strings. Anything
 * with stray characters stays a string, so "12 units" is not silently 12.
 */
function numericValue(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '');
  if (!trimmed || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function sheetCell(ctx: Ctx, inlines: Inline[] | undefined, header: boolean): string {
  const plain = inlines ? inlineToPlainText(inlines) : '';
  const style = header ? 'Ce_Head' : 'Ce_Body';
  const num = header ? null : numericValue(plain);
  if (num !== null) {
    return `<table:table-cell table:style-name="Ce_Num" office:value-type="float" office:value="${num}">`
      + `<text:p>${textNode(plain)}</text:p></table:table-cell>`;
  }
  const body = inlines ? inlineXml(ctx, inlines) : '';
  return `<table:table-cell table:style-name="${style}" office:value-type="string">`
    + `<text:p>${body}</text:p></table:table-cell>`;
}

export async function renderOds(model: DocModel, opts: RenderOdfOptions = {}): Promise<Buffer> {
  const ctx = newCtx(model, opts);
  const { brand } = ctx;
  const used = new Set<string>();

  // Every table becomes a sheet, named after the heading above it — which is
  // how the document already labels its tables for a reader.
  let heading = model.meta.title ?? '';
  let sheets = '';
  let count = 0;

  for (const block of model.blocks) {
    if (block.type === 'heading') { heading = inlineToPlainText(block.inlines); continue; }
    if (block.type !== 'table') continue;
    count++;

    const cols = Math.max(block.headers.length, ...block.rows.map((r) => r.length), 1);
    let rows = '';
    if (block.headers.length) {
      rows += '<table:table-row>';
      for (let i = 0; i < cols; i++) rows += sheetCell(ctx, block.headers[i], true);
      rows += '</table:table-row>';
    }
    for (const row of block.rows) {
      rows += '<table:table-row>';
      for (let i = 0; i < cols; i++) rows += sheetCell(ctx, row[i], false);
      rows += '</table:table-row>';
    }

    sheets += `<table:table table:name="${esc(sheetName(heading || `Sheet ${count}`, used))}" table:style-name="Ta_Sheet">`
      + `<table:table-column table:style-name="Co_Sheet" table:number-columns-repeated="${cols}" table:default-cell-style-name="Default"/>`
      + rows + '</table:table>';
  }

  // No tables at all — a spreadsheet of nothing helps nobody, so lay the prose
  // out one block per row rather than handing back an empty grid.
  if (count === 0) {
    let rows = '';
    for (const block of model.blocks) {
      const text = blockPlainText(block);
      if (text === null) continue;
      rows += `<table:table-row>${sheetCell(ctx, text ? [{ type: 'text', text }] : undefined, block.type === 'heading')}</table:table-row>`;
    }
    sheets += `<table:table table:name="${esc(sheetName(model.meta.title || 'Document', used))}" table:style-name="Ta_Sheet">`
      + '<table:table-column table:style-name="Co_Sheet" table:default-cell-style-name="Default"/>'
      + rows + '</table:table>';
  }

  const content = '<?xml version="1.0" encoding="UTF-8"?>'
    + `<office:document-content ${CONTENT_NS} office:version="1.3">`
    + fontFaces(brand)
    + '<office:automatic-styles>'
    + automaticStyles(brand)
    + '<style:style style:name="Ta_Sheet" style:family="table"><style:table-properties table:display="true"/></style:style>'
    + '<style:style style:name="Co_Sheet" style:family="table-column"><style:table-column-properties style:column-width="4cm"/></style:style>'
    + '<style:style style:name="Ce_Num" style:family="table-cell"><style:paragraph-properties fo:text-align="end"/></style:style>'
    + '</office:automatic-styles>'
    + `<office:body><office:spreadsheet>${sheets}</office:spreadsheet></office:body>`
    + '</office:document-content>';

  return pack(ODS_MIMETYPE, content, stylesXml(brand), metaXml(model), ctx.pictures, opts.modified);
}

/** Flatten a block to one line for the spreadsheet fallback. null = skip. */
function blockPlainText(block: Block): string | null {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return inlineToPlainText(block.inlines);
    case 'code':
      return block.text;
    case 'list':
      return block.items.map((i) => inlineToPlainText(i.inlines)).join('; ');
    case 'blockquote':
    case 'callout':
      return block.blocks.map(blockPlainText).filter((t) => t !== null).join(' ');
    case 'image':
      return block.alt ?? null;
    default:
      return null;
  }
}
