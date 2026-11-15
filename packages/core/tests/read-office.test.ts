import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPdfText, readDocxText } from '../src/tools/authoring/read-office.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

async function makePdf(text: string): Promise<Buffer> {
  const PDFDocument: any = ((await import('pdfkit')) as any).default;
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.text(text);
    doc.end();
  });
}

describe('reading Word and PDF files (pdf-parse v2 regression, 14 Nov 2026)', () => {
  it('reads the text and page count of a real PDF', async () => {
    const r = await readPdfText(await makePdf('Quarterly report for the board'));
    expect(r.text).toContain('Quarterly report for the board');
    expect(r.pages).toBe(1);
  });

  it('reads the text of a real Word file', async () => {
    const docx: any = await import('docx');
    const buf = await docx.Packer.toBuffer(new docx.Document({ sections: [{ children: [new docx.Paragraph('Dear Sam, thank you for your letter.')] }] }));
    const file = join(mkdtempSync(join(tmpdir(), 'ava-read-')), 'letter.docx');
    writeFileSync(file, buf);
    const r = await readDocxText(file);
    expect(r.text).toContain('Dear Sam, thank you for your letter.');
  });

  it('a file that is not a PDF fails with a reason, not a crash', async () => {
    await expect(readPdfText(new TextEncoder().encode('not a pdf'))).rejects.toThrow();
  });
});
