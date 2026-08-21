/**
 * Export a stored document to a chosen format.
 *
 * The Library is where documents are kept, exported and opened, and both the
 * extension and the IDE mount that same tab. This module is the shared body
 * behind both mounts: one place that decides what can be exported, what the
 * output is called, and what a failure says. Two hosts calling one function is
 * the only version of "one feature, two mounts" that does not quietly drift.
 *
 * Only sources we can faithfully re-render are exportable. A `.docx` is not
 * offered as an `.odt` here, because that is a conversion with fidelity loss
 * dressed up as an export — the honest answer for an already-built file is
 * Open or Reveal, not a second lossy copy of it.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import type { DocModel, Inline } from './doc-model.js';
import { textInline } from './doc-model.js';
import { parseMarkdown } from './md-parse.js';
import { renderDocument, type RenderOptions } from './index.js';
// The format question is answered in a dependency-free leaf, because the
// webviews need the same answer and cannot import this file.
import { canExport, type RenderTarget } from './export-formats.js';

export interface ExportRequest {
  /** Absolute path of the source document. */
  sourcePath: string;
  format: RenderTarget;
  /** Absolute output path. Defaults to the source's name with a new extension. */
  outPath?: string;
  loadDocx?: () => Promise<unknown>;
  loadPdf?: () => Promise<unknown>;
}

export type ExportResult =
  | { ok: true; path: string; bytes: number }
  | { ok: false; error: string };

/** Where the export lands: beside its source, which is how `document_author
 *  build` already behaves, so an exported file stays in the Library. */
export function deriveExportPath(sourcePath: string, format: RenderTarget): string {
  const dir = dirname(sourcePath);
  const stem = basename(sourcePath, extname(sourcePath));
  // join, not string concatenation: on Windows the source arrives with
  // backslashes and a hand-built '/' would hand back a mixed-separator path
  // that every later comparison gets subtly wrong.
  return join(dir, `${stem}.${format}`);
}

export async function exportDocument(req: ExportRequest): Promise<ExportResult> {
  const ext = extname(req.sourcePath).toLowerCase();
  if (!canExport(req.sourcePath)) {
    return { ok: false, error: `${ext || 'This file'} cannot be exported — it is already a built document. Open or reveal it instead.` };
  }

  let source: string;
  try {
    source = await readFile(req.sourcePath, 'utf8');
  } catch (e) {
    return { ok: false, error: `Could not read ${basename(req.sourcePath)}: ${(e as Error).message}` };
  }

  const model = ext === '.csv' ? csvToModel(source, basename(req.sourcePath, ext)) : parseMarkdown(source);

  const opts: RenderOptions = {
    loadDocx: req.loadDocx,
    loadPdf: req.loadPdf,
    baseDir: dirname(req.sourcePath),
  };

  let rendered: Buffer | string;
  try {
    rendered = await renderDocument(model, req.format, opts);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const outPath = req.outPath ?? deriveExportPath(req.sourcePath, req.format);
  const data = typeof rendered === 'string' ? Buffer.from(rendered, 'utf8') : rendered;
  try {
    await writeFile(outPath, data);
  } catch (e) {
    return { ok: false, error: `Could not write ${basename(outPath)}: ${(e as Error).message}` };
  }
  return { ok: true, path: outPath, bytes: data.length };
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * RFC 4180 enough: quoted fields, doubled quotes, and — the case a
 * split-on-newline parser gets wrong — newlines inside quoted fields.
 */
export function parseCsv(raw: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  const endField = () => { row.push(field); field = ''; started = false; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quoted) {
      if (ch === '"' && raw[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"' && !started) { quoted = true; started = true; continue; }
    if (ch === ',') { endField(); continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { endRow(); continue; }
    field += ch;
    started = true;
  }
  // A trailing newline ends the last row; anything else means one is still open.
  if (field !== '' || row.length > 0) endRow();

  const headers = rows.shift() ?? [];
  return { headers, rows };
}

/** A CSV is a single table; wrapping it in a DocModel lets it reach every
 *  renderer, so the same file can leave as .ods, .docx or .pdf. */
function csvToModel(raw: string, title: string): DocModel {
  const { headers, rows } = parseCsv(raw);
  const cells = (values: string[]): Inline[][] => values.map((v) => textInline(v));
  return {
    meta: { title },
    blocks: [{
      type: 'table',
      headers: cells(headers),
      rows: rows.map(cells),
    }],
  };
}
