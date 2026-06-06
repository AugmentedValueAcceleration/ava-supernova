/**
 * Shared document styling kit — single source of truth for the Ava brand
 * applied to every document Ava generates (.docx + .pdf).
 *
 * Why this exists: before this module, `report_generate` produced beautifully
 * branded .docx output (Calibri, Ava purple, real tables with shading) while
 * `document_manage.createDocx` produced unstyled output (no font, no color,
 * no body sizing) — same product, two different quality bars on the same
 * format. This kit unifies them.
 *
 * The optional `docx` and `pdfkit` peer deps are accepted as parameters so
 * this module stays a pure styling/builder layer with no top-level imports.
 * Callers that have already loaded the lib pass it in.
 */

// ── Brand tokens ────────────────────────────────────────────────────────────

/** Body text font. Calibri because it's the modern Word default and
 *  renders consistently on Win/Mac/web Word. Don't use system-default —
 *  that produces different output on every machine. */
export const AVA_FONT = 'Calibri';

/** Ava brand purple. Used for title and all H1 headings. */
export const AVA_HEADING_COLOR = '7c3aed';

/** Soft gray used for subtitle / metadata lines under the title. */
export const AVA_SUBTITLE_COLOR = '666666';

/** Dark text for body content. Pure-black is harsh on screen; near-black
 *  is the modern Word default. */
export const AVA_BODY_COLOR = '202020';

// docx sizes are in half-points (size: 22 = 11pt). PDF sizes are in points.
export const AVA_TITLE_SIZE_DOCX = 52;       // 26pt
export const AVA_H1_SIZE_DOCX = 32;          // 16pt
export const AVA_H2_SIZE_DOCX = 28;          // 14pt
export const AVA_BODY_SIZE_DOCX = 22;        // 11pt
export const AVA_SUBTITLE_SIZE_DOCX = 20;    // 10pt

export const AVA_TITLE_SIZE_PDF = 26;
export const AVA_H1_SIZE_PDF = 16;
export const AVA_H2_SIZE_PDF = 13;
export const AVA_BODY_SIZE_PDF = 11;
export const AVA_SUBTITLE_SIZE_PDF = 10;

/** Standard 1-inch (1440 twips) margins on all sides. Word's default. */
export const AVA_PAGE_MARGINS = {
  top: 1440,
  right: 1440,
  bottom: 1440,
  left: 1440,
};

/** Letter / invoice profile uses wider margins for a more formal look. */
export const AVA_FORMAL_MARGINS = {
  top: 1800,    // 1.25"
  right: 1800,
  bottom: 1800,
  left: 1800,
};

// ── Style profiles per template ─────────────────────────────────────────────

export interface DocumentStyleProfile {
  /** Page margins in twips (docx) or points (pdf — 1pt = 20 twips). */
  margins: { top: number; right: number; bottom: number; left: number };
  /** Whether to render a full cover page (title centered + spacing) or
   *  inline title. Reports and proposals get cover pages; letters and
   *  meeting notes don't. */
  coverPage: boolean;
  /** Whether to render a metadata block under the title (date, period). */
  metadataBlock: boolean;
  /** Whether to render a footer (page number / generated-by line). */
  footer: boolean;
}

export const DEFAULT_PROFILE: DocumentStyleProfile = {
  margins: AVA_PAGE_MARGINS,
  coverPage: true,
  metadataBlock: true,
  footer: false,
};

export const STYLE_PROFILES: Record<string, DocumentStyleProfile> = {
  proposal:      { margins: AVA_PAGE_MARGINS,   coverPage: true,  metadataBlock: true,  footer: false },
  report:        { margins: AVA_PAGE_MARGINS,   coverPage: true,  metadataBlock: true,  footer: false },
  invoice:       { margins: AVA_FORMAL_MARGINS, coverPage: false, metadataBlock: true,  footer: true  },
  letter:        { margins: AVA_FORMAL_MARGINS, coverPage: false, metadataBlock: false, footer: false },
  meeting_notes: { margins: AVA_PAGE_MARGINS,   coverPage: false, metadataBlock: true,  footer: false },
  resume:        { margins: AVA_FORMAL_MARGINS, coverPage: false, metadataBlock: false, footer: false },
  // Editorial / short-form: inline title, no cover page.
  brief:         { margins: AVA_PAGE_MARGINS,   coverPage: false, metadataBlock: true,  footer: false },
  one_pager:     { margins: AVA_PAGE_MARGINS,   coverPage: false, metadataBlock: true,  footer: false },
  article:       { margins: AVA_PAGE_MARGINS,   coverPage: false, metadataBlock: true,  footer: false },
  blog_post:     { margins: AVA_PAGE_MARGINS,   coverPage: false, metadataBlock: true,  footer: false },
  press_release: { margins: AVA_PAGE_MARGINS,   coverPage: false, metadataBlock: true,  footer: false },
  newsletter:    { margins: AVA_PAGE_MARGINS,   coverPage: false, metadataBlock: false, footer: false },
  case_study:    { margins: AVA_PAGE_MARGINS,   coverPage: true,  metadataBlock: true,  footer: false },
  // Academic.
  essay:         { margins: AVA_PAGE_MARGINS,   coverPage: false, metadataBlock: true,  footer: false },
  lab_report:    { margins: AVA_PAGE_MARGINS,   coverPage: true,  metadataBlock: true,  footer: false },
  abstract:      { margins: AVA_PAGE_MARGINS,   coverPage: false, metadataBlock: true,  footer: false },
  // Career.
  cover_letter:  { margins: AVA_FORMAL_MARGINS, coverPage: false, metadataBlock: false, footer: false },
  bio:           { margins: AVA_PAGE_MARGINS,   coverPage: false, metadataBlock: false, footer: false },
};

export function getStyleProfile(template?: string): DocumentStyleProfile {
  if (!template) return DEFAULT_PROFILE;
  return STYLE_PROFILES[template] ?? DEFAULT_PROFILE;
}

// ── DOCX builders ───────────────────────────────────────────────────────────
//
// All DOCX builders take the loaded `docx` module as their first argument so
// this file has no top-level dependency on the optional peer dep. Callers
// that have already done `await import('docx')` pass the module in.

/* eslint-disable @typescript-eslint/no-explicit-any */

export function titleParagraph(docx: any, text: string): any {
  const { Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
  return new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({
        text,
        font: AVA_FONT,
        size: AVA_TITLE_SIZE_DOCX,
        bold: true,
        color: AVA_HEADING_COLOR,
      }),
    ],
  });
}

export function subtitleParagraph(docx: any, text: string): any {
  const { Paragraph, TextRun, AlignmentType } = docx;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [
      new TextRun({
        text,
        font: AVA_FONT,
        size: AVA_SUBTITLE_SIZE_DOCX,
        italics: true,
        color: AVA_SUBTITLE_COLOR,
      }),
    ],
  });
}

export function headingParagraph(docx: any, text: string, level: 1 | 2 = 1): any {
  const { Paragraph, TextRun, HeadingLevel } = docx;
  const size = level === 1 ? AVA_H1_SIZE_DOCX : AVA_H2_SIZE_DOCX;
  const heading = level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
  return new Paragraph({
    heading,
    spacing: { before: 300, after: 200 },
    children: [
      new TextRun({
        text,
        font: AVA_FONT,
        size,
        bold: true,
        color: AVA_HEADING_COLOR,
      }),
    ],
  });
}

export function bodyParagraph(docx: any, text: string): any {
  const { Paragraph, TextRun } = docx;
  return new Paragraph({
    spacing: { after: 120, line: 276 },  // 1.15× line spacing
    children: [
      new TextRun({
        text,
        font: AVA_FONT,
        size: AVA_BODY_SIZE_DOCX,
        color: AVA_BODY_COLOR,
      }),
    ],
  });
}

export function bulletParagraph(docx: any, text: string, level = 0): any {
  const { Paragraph, TextRun } = docx;
  return new Paragraph({
    bullet: { level },
    spacing: { after: 80 },
    children: [
      new TextRun({
        text,
        font: AVA_FONT,
        size: AVA_BODY_SIZE_DOCX,
        color: AVA_BODY_COLOR,
      }),
    ],
  });
}

/** Build a themed table with purple header row, white bold header text,
 *  and proper percentage column widths. */
export function themedTable(
  docx: any,
  spec: { headers: string[]; rows: string[][]; columnWidths?: number[] },
): any {
  const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle } = docx;
  const { headers, rows } = spec;

  const widths = spec.columnWidths
    ?? headers.map(() => Math.floor(100 / headers.length));

  const cellBorder = {
    top:    { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' },
    left:   { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' },
    right:  { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' },
  };

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((label, i) =>
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({
            text: label,
            font: AVA_FONT,
            size: AVA_BODY_SIZE_DOCX,
            bold: true,
            color: 'FFFFFF',
          })],
        })],
        shading: { fill: AVA_HEADING_COLOR },
        width: { size: widths[i], type: WidthType.PERCENTAGE },
        borders: cellBorder,
      })
    ),
  });

  const dataRows = rows.map((row, rowIndex) =>
    new TableRow({
      children: row.map((cell, i) =>
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({
              text: String(cell),
              font: AVA_FONT,
              size: AVA_BODY_SIZE_DOCX,
              color: AVA_BODY_COLOR,
            })],
          })],
          // Subtle alternating row shading for readability in long tables.
          shading: rowIndex % 2 === 0 ? undefined : { fill: 'F5F3FF' },
          width: { size: widths[i], type: WidthType.PERCENTAGE },
          borders: cellBorder,
        })
      ),
    })
  );

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/** Build the section properties block including page margins. Pass to
 *  `new Document({ sections: [{ properties, children }] })`. */
export function sectionProperties(profile: DocumentStyleProfile = DEFAULT_PROFILE) {
  return {
    page: {
      margin: profile.margins,
    },
  };
}

// ── PDF builders ────────────────────────────────────────────────────────────
//
// PDFKit primitives. Same parameter pattern: caller passes the loaded
// document instance (`doc`) to each helper.

/** Draw the title at top of page, centered, in Ava purple. */
export function pdfTitle(doc: any, text: string): void {
  doc.fontSize(AVA_TITLE_SIZE_PDF)
     .font('Helvetica-Bold')
     .fillColor(`#${AVA_HEADING_COLOR}`)
     .text(text, { align: 'center' });
  doc.moveDown(0.5);
}

export function pdfSubtitle(doc: any, text: string): void {
  doc.fontSize(AVA_SUBTITLE_SIZE_PDF)
     .font('Helvetica-Oblique')
     .fillColor(`#${AVA_SUBTITLE_COLOR}`)
     .text(text, { align: 'center' });
  doc.moveDown(0.3);
}

export function pdfHeading(doc: any, text: string, level: 1 | 2 = 1): void {
  const size = level === 1 ? AVA_H1_SIZE_PDF : AVA_H2_SIZE_PDF;
  doc.fontSize(size)
     .font('Helvetica-Bold')
     .fillColor(`#${AVA_HEADING_COLOR}`)
     .text(text);
  doc.moveDown(0.4);
}

export function pdfBody(doc: any, text: string): void {
  doc.fontSize(AVA_BODY_SIZE_PDF)
     .font('Helvetica')
     .fillColor(`#${AVA_BODY_COLOR}`)
     .text(text, { align: 'justify' });
  doc.moveDown(0.5);
}

export function pdfBullet(doc: any, text: string): void {
  doc.fontSize(AVA_BODY_SIZE_PDF)
     .font('Helvetica')
     .fillColor(`#${AVA_BODY_COLOR}`)
     .text(text, {
       indent: 16,
       paragraphGap: 4,
       listType: 'bullet',
     } as any);
}

/** Real PDF table — boxes, borders, header band in Ava purple. Replaces
 *  the previous "join cells with `    |    `" approach which broke as
 *  soon as content had any real width. */
export function pdfTable(
  doc: any,
  spec: { headers: string[]; rows: string[][]; columnWidths?: number[] },
): void {
  const { headers, rows } = spec;
  const startX = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const widths = spec.columnWidths ?? headers.map(() => usableWidth / headers.length);

  const cellPadding = 6;
  const headerHeight = 24;
  const rowHeight = 22;

  let y = doc.y;

  // Header band — Ava purple background, white bold text.
  doc.save();
  doc.fillColor(`#${AVA_HEADING_COLOR}`)
     .rect(startX, y, usableWidth, headerHeight)
     .fill();
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(AVA_BODY_SIZE_PDF);
  let x = startX;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x + cellPadding, y + (headerHeight - AVA_BODY_SIZE_PDF) / 2, {
      width: widths[i] - cellPadding * 2,
      lineBreak: false,
    });
    x += widths[i];
  }
  doc.restore();
  y += headerHeight;

  // Data rows — alternating shading, gray borders.
  for (let r = 0; r < rows.length; r++) {
    if (r % 2 === 1) {
      doc.save();
      doc.fillColor('#F5F3FF').rect(startX, y, usableWidth, rowHeight).fill();
      doc.restore();
    }
    doc.strokeColor('#D0D0D0').lineWidth(0.5)
       .moveTo(startX, y + rowHeight).lineTo(startX + usableWidth, y + rowHeight).stroke();

    doc.fillColor(`#${AVA_BODY_COLOR}`).font('Helvetica').fontSize(AVA_BODY_SIZE_PDF);
    x = startX;
    for (let i = 0; i < rows[r].length; i++) {
      doc.text(String(rows[r][i] ?? ''), x + cellPadding, y + (rowHeight - AVA_BODY_SIZE_PDF) / 2, {
        width: widths[i] - cellPadding * 2,
        lineBreak: false,
        ellipsis: true,
      });
      x += widths[i];
    }
    y += rowHeight;
  }

  // Move the document cursor below the table.
  doc.y = y + 8;
  doc.x = doc.page.margins.left;
}

// ── Rich-document additions (authoring engine) ───────────────────────────────
//
// These extend the brand kit for the Markdown-source authoring engine: deeper
// heading sizes, per-document brand resolution (house style), the callout
// palette, and the ordered-list numbering id. The model-aware builders that
// consume them live in the renderers (authoring/render-docx.ts, render-pdf.ts).

export const AVA_H3_SIZE_DOCX = 26;   // 13pt
export const AVA_H4_SIZE_DOCX = 24;   // 12pt
export const AVA_H3_SIZE_PDF = 12;
export const AVA_H4_SIZE_PDF = 11;

/** Fully-resolved brand for a single document (house-style overrides merged
 *  over the Ava defaults). Colours are 6-digit hex without '#'. */
export interface Brand {
  font: string;
  headingColor: string;
  bodyColor: string;
  subtitleColor: string;
}

/** Merge optional per-document overrides over the Ava brand defaults. */
export function resolveBrand(overrides?: Partial<Brand>): Brand {
  return {
    font: overrides?.font || AVA_FONT,
    headingColor: overrides?.headingColor || AVA_HEADING_COLOR,
    bodyColor: overrides?.bodyColor || AVA_BODY_COLOR,
    subtitleColor: overrides?.subtitleColor || AVA_SUBTITLE_COLOR,
  };
}

/** Per-variant callout palette: tinted fill, accent bar, and default label. */
export const CALLOUT_COLORS: Record<string, { fill: string; bar: string; label: string }> = {
  note:      { fill: 'F5F3FF', bar: '7C3AED', label: 'Note' },
  tip:       { fill: 'ECFDF5', bar: '059669', label: 'Tip' },
  warning:   { fill: 'FFFBEB', bar: 'D97706', label: 'Warning' },
  important: { fill: 'FEF2F2', bar: 'DC2626', label: 'Important' },
  quote:     { fill: 'F8FAFC', bar: '94A3B8', label: '' },
};

/** Hyperlink colour (Word default blue) for rendered links. */
export const AVA_LINK_COLOR = '0563C1';

/** Reference id for the ordered-list numbering config on the docx Document. */
export const AVA_ORDERED_REF = 'ava-ordered';
