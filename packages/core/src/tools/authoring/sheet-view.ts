/**
 * A spreadsheet as the document viewer shows it (15 Nov 2026): every sheet,
 * every cell as text, the formula beside the value where there is one, and
 * whether the cell is a number (so the grid right-aligns it).
 *
 * Node-side (the extension host and the IDE sidecar call it), so the viewer
 * itself never needs the spreadsheet library. Read-only.
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { parseCsv } from './export-document.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ViewCell {
  /** What the cell shows. */
  v: string;
  /** The formula, without "=", when the cell has one. */
  f?: string;
  /** A number or a formula giving a number — right-aligned in the grid. */
  n?: boolean;
}

export interface ViewSheet {
  name: string;
  rows: ViewCell[][];
  /** True when the sheet had more rows or columns than the viewer shows. */
  clipped?: boolean;
}

/** Enough for any spreadsheet a person reads; bigger ones open in their app. */
export const SHEET_VIEW_LIMITS = { rows: 2000, cols: 60 } as const;

const fmtNum = (x: number): string =>
  Number.isInteger(x) ? x.toLocaleString('en-GB') : x.toLocaleString('en-GB', { maximumFractionDigits: 6 });

function cellOf(raw: any): ViewCell {
  if (raw == null) return { v: '' };
  if (typeof raw === 'number') return { v: fmtNum(raw), n: true };
  if (raw instanceof Date) return { v: raw.toISOString().slice(0, 10) };
  if (typeof raw === 'object') {
    if ('formula' in raw || 'sharedFormula' in raw) {
      const res = raw.result;
      const f = String(raw.formula ?? raw.sharedFormula ?? '');
      if (typeof res === 'number') return { v: fmtNum(res), f, n: true };
      if (res && typeof res === 'object' && 'error' in res) return { v: String(res.error), f };
      return { v: res == null ? '' : String(res), f };
    }
    if ('richText' in raw) return { v: (raw.richText as Array<{ text: string }>).map((t) => t.text).join('') };
    if ('text' in raw) return { v: String(raw.text) };
    if ('error' in raw) return { v: String(raw.error) };
  }
  return { v: String(raw) };
}

export async function readSheetForView(path: string): Promise<ViewSheet[]> {
  const ext = extname(path).toLowerCase();
  if (ext === '.csv') {
    const { headers, rows } = parseCsv(await readFile(path, 'utf-8'));
    const all = [headers, ...rows];
    const clipped = all.length > SHEET_VIEW_LIMITS.rows || all.some((r) => r.length > SHEET_VIEW_LIMITS.cols);
    return [{
      name: 'Sheet1',
      rows: all.slice(0, SHEET_VIEW_LIMITS.rows).map((r) => r.slice(0, SHEET_VIEW_LIMITS.cols).map((v) => {
        const num = v.trim() !== '' && !Number.isNaN(Number(v));
        return num ? { v, n: true } : { v };
      })),
      clipped,
    }];
  }
  if (ext !== '.xlsx') throw new Error('This spreadsheet type opens in your own app.');

  const mod: any = await import('exceljs');
  const ExcelJS = mod.default?.Workbook ? mod.default : mod;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const out: ViewSheet[] = [];
  workbook.eachSheet((ws: any) => {
    const rows: ViewCell[][] = [];
    let clipped = false;
    const last = Math.min(ws.rowCount ?? 0, SHEET_VIEW_LIMITS.rows);
    if ((ws.rowCount ?? 0) > SHEET_VIEW_LIMITS.rows) clipped = true;
    const width = Math.min(ws.columnCount ?? 0, SHEET_VIEW_LIMITS.cols);
    if ((ws.columnCount ?? 0) > SHEET_VIEW_LIMITS.cols) clipped = true;
    for (let r = 1; r <= last; r++) {
      const row = ws.getRow(r);
      const cells: ViewCell[] = [];
      for (let c = 1; c <= width; c++) cells.push(cellOf(row.getCell(c).value));
      rows.push(cells);
    }
    out.push({ name: String(ws.name), rows, clipped });
  });
  return out;
}
