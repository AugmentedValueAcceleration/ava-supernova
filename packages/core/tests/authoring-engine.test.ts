import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../src/tools/authoring/md-parse.js';
import { renderMarkdown } from '../src/tools/authoring/render-md.js';
import { renderDocx } from '../src/tools/authoring/render-docx.js';
import { renderPdf } from '../src/tools/authoring/render-pdf.js';
import type { Block } from '../src/tools/authoring/doc-model.js';
import { inlineToPlainText } from '../src/tools/authoring/doc-model.js';

const FIXTURE = `---
title: Test Doc
author: Ada
style: report
toc: true
brand: { headingColor: "0F766E", font: Georgia }
---

# Intro

A paragraph with **bold**, *italic*, \`code\`, and a [link](https://example.com).[^1]

## Details

1. First
2. Second
   - nested a
   - nested b

| Name | Score |
| :--- | ---: |
| Ada | 10 |

:::warning{title="Careful"}
Mind the **gap**.
:::

![logo](logo.png){width=120}

:::pagebreak

> [!NOTE]
> A note blockquote.

[^1]: The footnote text.
`;

function find(blocks: Block[], type: Block['type']): Block | undefined {
  return blocks.find(b => b.type === type);
}

describe('authoring engine — parse', () => {
  const model = parseMarkdown(FIXTURE);

  it('parses front-matter into metadata', () => {
    expect(model.meta.title).toBe('Test Doc');
    expect(model.meta.author).toBe('Ada');
    expect(model.meta.styleProfile).toBe('report');
    expect(model.meta.toc).toBe(true);
    expect(model.meta.brand?.headingColor).toBe('0F766E');
    expect(model.meta.brand?.font).toBe('Georgia');
  });

  it('keeps a body H1 as a heading (title came from front-matter)', () => {
    const h = model.blocks.find(b => b.type === 'heading' && b.level === 1);
    expect(h && h.type === 'heading' && inlineToPlainText(h.inlines)).toBe('Intro');
  });

  it('parses inline formatting (bold, italic, code, link, footnote ref)', () => {
    const para = model.blocks.find(b => b.type === 'paragraph');
    expect(para?.type).toBe('paragraph');
    const kinds = para && para.type === 'paragraph' ? para.inlines.map(i => i.type) : [];
    expect(kinds).toContain('strong');
    expect(kinds).toContain('em');
    expect(kinds).toContain('code');
    expect(kinds).toContain('link');
    expect(kinds).toContain('footnoteRef');
  });

  it('parses ordered list with a nested unordered list', () => {
    const list = model.blocks.find(b => b.type === 'list');
    expect(list?.type).toBe('list');
    if (list?.type === 'list') {
      expect(list.ordered).toBe(true);
      expect(list.items.length).toBe(2);
      const nested = list.items[1].children?.find(c => c.type === 'list');
      expect(nested?.type).toBe('list');
      if (nested?.type === 'list') expect(nested.ordered).toBe(false);
    }
  });

  it('parses a table with column alignment', () => {
    const table = find(model.blocks, 'table');
    expect(table?.type).toBe('table');
    if (table?.type === 'table') {
      expect(table.headers.map(h => inlineToPlainText(h))).toEqual(['Name', 'Score']);
      expect(table.align).toEqual(['left', 'right']);
    }
  });

  it('parses a callout directive with title and variant', () => {
    const callout = model.blocks.find(b => b.type === 'callout' && b.variant === 'warning');
    expect(callout?.type).toBe('callout');
    if (callout?.type === 'callout') expect(callout.title).toBe('Careful');
  });

  it('parses a GitHub-style alert blockquote into a callout', () => {
    const note = model.blocks.find(b => b.type === 'callout' && b.variant === 'note');
    expect(note?.type).toBe('callout');
  });

  it('parses a standalone image with width', () => {
    const img = find(model.blocks, 'image');
    expect(img?.type).toBe('image');
    if (img?.type === 'image') {
      expect(img.src).toBe('logo.png');
      expect(img.width).toBe(120);
    }
  });

  it('parses a page break directive', () => {
    expect(find(model.blocks, 'pagebreak')?.type).toBe('pagebreak');
  });

  it('collects footnote definitions', () => {
    expect(model.meta.footnotes?.['1']).toBeTruthy();
    expect(inlineToPlainText(model.meta.footnotes!['1'])).toBe('The footnote text.');
  });
});

describe('authoring engine — markdown round-trip', () => {
  it('canonical markdown is a fixed point under parse→render', () => {
    const md1 = renderMarkdown(parseMarkdown(FIXTURE));
    const md2 = renderMarkdown(parseMarkdown(md1));
    expect(md2).toBe(md1);
  });
});

describe('authoring engine — render smoke', () => {
  const model = parseMarkdown(FIXTURE);

  it('renders a non-trivial .docx (zip container)', async () => {
    const buf = await renderDocx(model, { loadDocx: () => import('docx') });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(2000);
    // .docx is a zip — starts with the PK local-file-header signature.
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('renders a non-trivial .pdf', async () => {
    const buf = await renderPdf(model, { loadPdf: () => import('pdfkit') });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
