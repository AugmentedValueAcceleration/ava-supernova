// Markdown → OpenDocument, without a peer dependency.
//
// docx and pdfkit are optional peers that can simply be absent, so the open
// format is the one export that has to work unconditionally — which is only
// true if the zip container we hand-roll is a real zip and the XML inside it
// is real ODF. These tests read the package back rather than trusting the
// writer: mimetype first and uncompressed (a reader identifies the file from
// the opening bytes without unpacking), every part listed in the manifest,
// and the document's own structure surviving the trip.

import { describe, it, expect } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { parseMarkdown } from '../src/tools/authoring/md-parse.js';
import {
  renderOdt, renderOds, ODT_MIMETYPE, ODS_MIMETYPE,
} from '../src/tools/authoring/render-odf.js';
import { renderDocument } from '../src/tools/authoring/index.js';

// ── A minimal zip reader, so the test verifies the bytes and not the writer ──

function readZip(buf: Buffer): Map<string, Buffer> {
  // End of central directory: fixed 22 bytes here, since nothing writes a
  // comment.
  const eocd = buf.length - 22;
  expect(buf.readUInt32LE(eocd)).toBe(0x06054b50);
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(offset)).toBe(0x02014b50);
    const method = buf.readUInt16LE(offset + 10);
    const crc = buf.readUInt32LE(offset + 16);
    const csize = buf.readUInt32LE(offset + 20);
    const usize = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const local = buf.readUInt32LE(offset + 42);
    const name = buf.slice(offset + 46, offset + 46 + nameLen).toString('utf8');

    // Walk to the payload via the local header's own name/extra lengths.
    const localNameLen = buf.readUInt16LE(local + 26);
    const localExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + localNameLen + localExtraLen;
    const raw = buf.slice(start, start + csize);
    const data = method === 8 ? inflateRawSync(raw) : raw;

    expect(data.length, `${name} declared size`).toBe(usize);
    expect(crc, `${name} crc present`).toBeGreaterThanOrEqual(0);
    out.set(name, data);
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/**
 * Not a parser — a bracket-and-tag balance check, which is what actually
 * breaks when you assemble XML by hand: an unescaped `&`, a stray `<`, or a
 * tag closed in the wrong order.
 */
function assertWellFormed(xml: string, label: string): void {
  expect(xml.startsWith('<?xml'), `${label} declaration`).toBe(true);

  // Every raw & must open a character reference.
  const bareAmp = xml.match(/&(?!(#\d+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos);)/);
  expect(bareAmp, `${label} unescaped &: ${bareAmp?.[0]}`).toBeNull();

  const stack: string[] = [];
  const tag = /<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml))) {
    const [, closing, name, attrs, selfClose] = m;
    if (name === 'xml' || attrs.startsWith('?')) continue;
    // Attribute values must be quoted, and quotes must balance.
    expect((attrs.match(/"/g) ?? []).length % 2, `${label} <${name}> quoting`).toBe(0);
    if (selfClose) continue;
    if (closing) {
      expect(stack.pop(), `${label} close order at <${name}>`).toBe(name);
    } else {
      stack.push(name);
    }
  }
  expect(stack, `${label} unclosed tags`).toEqual([]);
}

// ── A document that exercises the whole model ────────────────────────────────

const SAMPLE = `---
title: Quarterly Review & Outlook
subtitle: Prepared for the board
author: Ava
date: 2026-08-21
---

# Summary

A paragraph with **bold**, *italic*, ***both***, \`inline code\`, and a
[link](https://example.com/a?x=1&y=2).

Ampersands & angle brackets < > must survive.[^note]

[^note]: The footnote body, with **emphasis**.

## Numbers

| Region | Revenue | Growth |
| :--- | ---: | :---: |
| EU | 1200.50 | 12% |
| UK | 980 | 8% |

- First item
  - Nested item
- Second item

1. Step one
2. Step two

> A quotation that should stay a quotation.

> [!warning]
> Something worth noticing.

\`\`\`ts
function indented() {
  return "  spaced  ";
}
\`\`\`

---
`;

describe('OpenDocument export', () => {
  const model = parseMarkdown(SAMPLE);
  const fixed = new Date(2026, 7, 21, 12, 0, 0);

  describe('.odt', () => {
    it('is a readable zip whose first entry identifies the format', async () => {
      const odt = await renderOdt(model, { modified: fixed });

      // The ODF rule: `mimetype` first, stored, no extra field — so the type
      // is readable from the stream's opening bytes.
      expect(odt.readUInt32LE(0)).toBe(0x04034b50);
      expect(odt.readUInt16LE(8), 'compression method').toBe(0);
      expect(odt.readUInt16LE(28), 'extra field length').toBe(0);
      const nameLen = odt.readUInt16LE(26);
      expect(odt.slice(30, 30 + nameLen).toString()).toBe('mimetype');
      expect(odt.slice(30 + nameLen, 30 + nameLen + ODT_MIMETYPE.length).toString()).toBe(ODT_MIMETYPE);

      const files = readZip(odt);
      expect([...files.keys()]).toEqual([
        'mimetype', 'META-INF/manifest.xml', 'content.xml', 'styles.xml', 'meta.xml',
      ]);
    });

    it('lists every part in the manifest', async () => {
      const files = readZip(await renderOdt(model, { modified: fixed }));
      const manifest = files.get('META-INF/manifest.xml')!.toString('utf8');
      assertWellFormed(manifest, 'manifest.xml');
      expect(manifest).toContain(`manifest:full-path="/" manifest:version="1.3" manifest:media-type="${ODT_MIMETYPE}"`);
      for (const part of ['content.xml', 'styles.xml', 'meta.xml']) {
        expect(manifest, `manifest lists ${part}`).toContain(`manifest:full-path="${part}"`);
      }
    });

    it('emits well-formed XML for every part', async () => {
      const files = readZip(await renderOdt(model, { modified: fixed }));
      for (const [name, data] of files) {
        if (!name.endsWith('.xml')) continue;
        assertWellFormed(data.toString('utf8'), name);
      }
    });

    it('carries the document structure across', async () => {
      const files = readZip(await renderOdt(model, { modified: fixed }));
      const content = files.get('content.xml')!.toString('utf8');

      expect(content).toContain('<text:p text:style-name="Title">Quarterly Review &amp; Outlook</text:p>');
      expect(content).toContain('<text:h text:style-name="Heading_20_1" text:outline-level="1">Summary</text:h>');
      expect(content).toContain('<text:h text:style-name="Heading_20_2" text:outline-level="2">Numbers</text:h>');

      // Inline runs, including the nested bold+italic case a flat style map
      // would get wrong.
      expect(content).toContain('<text:span text:style-name="T_Bold">bold</text:span>');
      expect(content).toContain('<text:span text:style-name="T_Italic">italic</text:span>');
      expect(content).toContain('<text:span text:style-name="T_BoldItalic">both</text:span>');
      expect(content).toContain('<text:span text:style-name="T_Code">inline code</text:span>');
      expect(content).toContain('xlink:href="https://example.com/a?x=1&amp;y=2"');

      // Structure.
      expect(content).toContain('<text:list text:style-name="L_Bullet">');
      expect(content).toContain('<text:list text:style-name="L_Order">');
      expect(content).toContain('<table:table-header-rows>');
      expect(content).toContain('<text:p text:style-name="Quotations">');
      expect(content).toContain('text:style-name="P_Callout_warning"');
      expect(content).toContain('<text:p text:style-name="P_Hr"/>');
      expect(content).toContain('<text:note text:id="ftn1" text:note-class="footnote">');

      // Every style the walk names must be declared, or the reader silently
      // falls back to defaults and the export looks unstyled.
      const declared = new Set([...content.matchAll(/style:name="([^"]+)"/g)].map((m) => m[1]));
      const styles = files.get('styles.xml')!.toString('utf8');
      for (const m of styles.matchAll(/style:name="([^"]+)"/g)) declared.add(m[1]);
      for (const m of content.matchAll(/text:style-name="([^"]+)"/g)) {
        expect(declared, `style ${m[1]} declared`).toContain(m[1]);
      }
    });

    it('preserves indentation inside code blocks', async () => {
      const files = readZip(await renderOdt(model, { modified: fixed }));
      const content = files.get('content.xml')!.toString('utf8');
      // ODF collapses whitespace, so runs of spaces need explicit markup —
      // without it, every code block loses its shape.
      expect(content).toContain('<text:p text:style-name="P_Code"> <text:s text:c="1"/>return');
    });

    it('aligns table columns from the markdown', async () => {
      const files = readZip(await renderOdt(model, { modified: fixed }));
      const content = files.get('content.xml')!.toString('utf8');
      expect(content).toContain('text:style-name="P_CellRight"');
      expect(content).toContain('text:style-name="P_CellCenter"');
    });

    it('is byte-identical for the same input', async () => {
      const a = await renderOdt(model, { modified: fixed });
      const b = await renderOdt(model, { modified: fixed });
      expect(a.equals(b)).toBe(true);
    });
  });

  describe('.ods', () => {
    it('turns each table into a sheet named after its heading', async () => {
      const files = readZip(await renderOds(model, { modified: fixed }));
      const content = files.get('content.xml')!.toString('utf8');
      assertWellFormed(content, 'ods content.xml');
      expect(content).toContain('<office:spreadsheet>');
      expect(content).toContain('table:name="Numbers"');
    });

    it('writes numbers as numbers and text as text', async () => {
      const files = readZip(await renderOds(model, { modified: fixed }));
      const content = files.get('content.xml')!.toString('utf8');

      // A spreadsheet you can sum is the entire point.
      expect(content).toContain('office:value-type="float" office:value="1200.5"');
      expect(content).toContain('office:value-type="float" office:value="980"');
      // "12%" is not a number — turning it into 12 would be a quiet lie.
      expect(content).toContain('<text:p>12%</text:p>');
      expect(content).not.toContain('office:value="12"');
    });

    it('falls back to one row per block when there is no table', async () => {
      const prose = parseMarkdown('# Notes\n\nJust a paragraph.\n');
      const files = readZip(await renderOds(prose, { modified: fixed }));
      const content = files.get('content.xml')!.toString('utf8');
      expect(content).toContain('table:name="Notes"');
      expect(content).toContain('Just a paragraph.');
    });

    it('identifies itself as a spreadsheet', async () => {
      const ods = await renderOds(model, { modified: fixed });
      const nameLen = ods.readUInt16LE(26);
      expect(ods.slice(30 + nameLen, 30 + nameLen + ODS_MIMETYPE.length).toString()).toBe(ODS_MIMETYPE);
    });
  });

  describe('dispatch', () => {
    it('renders odt and ods without any peer loader', async () => {
      // The reason ODF exists in this codebase: no loadDocx, no loadPdf.
      const odt = await renderDocument(model, 'odt');
      const ods = await renderDocument(model, 'ods');
      expect(Buffer.isBuffer(odt)).toBe(true);
      expect(Buffer.isBuffer(ods)).toBe(true);
    });

    it('still refuses docx and pdf without their peers', async () => {
      await expect(renderDocument(model, 'docx')).rejects.toThrow(/docx/);
      await expect(renderDocument(model, 'pdf')).rejects.toThrow(/pdfkit/);
    });
  });
});
