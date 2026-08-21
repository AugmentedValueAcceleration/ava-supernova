// Exporting a stored document, and refusing to pretend about the rest.
//
// The Library offers export on two surfaces that call this one function, so
// what it decides is what both mounts do. Two decisions matter enough to hold
// down: which sources are offered at all (a .docx re-rendered as .odt is a
// lossy conversion wearing an export's clothes), and that a spreadsheet export
// produces numbers rather than a grid of strings.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import {
  exportDocument, deriveExportPath, parseCsv,
} from '../src/tools/authoring/export-document.js';
import {
  canExport, targetsFor, DOCUMENT_TARGETS, SPREADSHEET_TARGETS, TARGET_LABELS,
  EXPORTABLE_SOURCE_EXTENSIONS,
} from '../src/tools/authoring/export-formats.js';

/** Pull one part out of an ODF package without a zip library. */
function odfPart(buf: Buffer, want: string): string {
  const eocd = buf.length - 22;
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(offset + 10);
    const csize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const local = buf.readUInt32LE(offset + 42);
    const name = buf.slice(offset + 46, offset + 46 + nameLen).toString('utf8');
    if (name === want) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const raw = buf.slice(start, start + csize);
      return (method === 8 ? inflateRawSync(raw) : raw).toString('utf8');
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`no ${want} in package`);
}

describe('what can be exported', () => {
  it('offers sources it can re-render', () => {
    for (const ext of EXPORTABLE_SOURCE_EXTENSIONS) {
      expect(canExport(`notes${ext}`), ext).toBe(true);
    }
    expect(canExport('/a/b/REPORT.MD'), 'case-insensitive').toBe(true);
  });

  it('refuses built documents rather than converting them', () => {
    // The honest action for one of these is Open or Reveal. Offering "export
    // to .odt" would promise a fidelity we cannot deliver.
    for (const path of ['report.docx', 'book.pdf', 'sheet.xlsx', 'old.doc', 'notes.rtf']) {
      expect(canExport(path), path).toBe(false);
      expect(targetsFor(path), path).toEqual([]);
    }
  });

  it('does not mistake a dotted directory for an extension', () => {
    expect(canExport('/home/a.b/notes')).toBe(false);
    expect(canExport('C:\\work\\v1.2\\plan')).toBe(false);
  });

  it('offers spreadsheet formats for tabular sources and prose formats for prose', () => {
    expect(targetsFor('data.csv')).toEqual(SPREADSHEET_TARGETS);
    expect(targetsFor('report.md')).toEqual(DOCUMENT_TARGETS);
    // Markdown is where documents come FROM; exporting .md as .md is a no-op.
    expect(DOCUMENT_TARGETS).not.toContain('md');
    expect(SPREADSHEET_TARGETS).not.toContain('md');
  });

  it('has a label for every format it offers', () => {
    for (const format of [...DOCUMENT_TARGETS, ...SPREADSHEET_TARGETS]) {
      expect(TARGET_LABELS[format], format).toBeTruthy();
    }
  });

  it('names the output after the source, beside it', () => {
    // join()-shaped, so the assertion holds on both separators.
    expect(deriveExportPath(join('/docs', 'Q3 Review.md'), 'odt')).toBe(join('/docs', 'Q3 Review.odt'));
    expect(deriveExportPath(join('/docs', 'data.csv'), 'ods')).toBe(join('/docs', 'data.ods'));
  });
});

describe('CSV parsing', () => {
  it('handles quotes, doubled quotes and embedded newlines', () => {
    // The embedded newline is the case a split-on-\n parser gets wrong, and
    // it is exactly what a spreadsheet exports when a cell holds a paragraph.
    const { headers, rows } = parseCsv('a,b,c\n1,"has, comma","says ""hi"""\n2,"two\nlines",z\n');
    expect(headers).toEqual(['a', 'b', 'c']);
    expect(rows).toEqual([
      ['1', 'has, comma', 'says "hi"'],
      ['2', 'two\nlines', 'z'],
    ]);
  });

  it('does not invent a trailing empty row', () => {
    expect(parseCsv('a,b\n1,2\n').rows).toEqual([['1', '2']]);
    expect(parseCsv('a,b\n1,2').rows).toEqual([['1', '2']]);
  });
});

describe('exporting', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'ava-export-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('writes an .odt beside its markdown source', async () => {
    const src = join(dir, 'Q3 Review.md');
    await writeFile(src, '---\ntitle: Q3 Review\n---\n\n# Summary\n\nIt went well.\n');

    const result = await exportDocument({ sourcePath: src, format: 'odt' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toBe(join(dir, 'Q3 Review.odt'));

    const content = odfPart(await readFile(result.path), 'content.xml');
    expect(content).toContain('Summary');
    expect(content).toContain('It went well.');
  });

  it('turns a CSV into a spreadsheet with real numbers', async () => {
    const src = join(dir, 'sales.csv');
    await writeFile(src, 'Region,Revenue\nEU,1200.5\nUK,980\n');

    const result = await exportDocument({ sourcePath: src, format: 'ods' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const content = odfPart(await readFile(result.path), 'content.xml');
    expect(content).toContain('<office:spreadsheet>');
    expect(content).toContain('office:value-type="float" office:value="1200.5"');
    expect(content).toContain('office:value-type="float" office:value="980"');
    // The header stays text even though "Revenue" sits above numbers.
    expect(content).toContain('office:value-type="string"');
  });

  it('needs no peer for the open formats', async () => {
    const src = join(dir, 'plain.md');
    await writeFile(src, '# Hello\n');
    // No loadDocx, no loadPdf — this is the reason ODF is here at all.
    expect((await exportDocument({ sourcePath: src, format: 'odt' })).ok).toBe(true);
    expect((await exportDocument({ sourcePath: src, format: 'ods' })).ok).toBe(true);
  });

  it('explains a missing peer instead of throwing', async () => {
    const src = join(dir, 'plain.md');
    await writeFile(src, '# Hello\n');
    const result = await exportDocument({ sourcePath: src, format: 'docx' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/docx/);
  });

  it('refuses a built document by name, not by crashing on its bytes', async () => {
    const src = join(dir, 'already.docx');
    await writeFile(src, 'not really a docx');
    const result = await exportDocument({ sourcePath: src, format: 'odt' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Open or reveal/);
  });

  it('reports a missing source rather than writing an empty file', async () => {
    const result = await exportDocument({ sourcePath: join(dir, 'gone.md'), format: 'odt' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Could not read/);
  });
});
