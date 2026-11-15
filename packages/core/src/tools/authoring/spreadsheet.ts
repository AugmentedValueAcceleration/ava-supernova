/**
 * Real spreadsheets (Documents 1.0 Part 3, 15 Nov 2026).
 *
 * The old writer put every value in as text: "900" could not be summed, there
 * were no formulas, no formats, and the header was a fixed blue. A spreadsheet
 * someone will use — a budget, a tracker, an invoice — needs:
 *
 *   - numbers stored as numbers and dates as dates, so they sort and add up;
 *   - formulas ("=SUM(B2:B6)") kept as formulas, with their results worked
 *     out (formula-eval.ts) so Ava and the viewer read 1,640, not a blank;
 *   - a totals row when asked, made of real SUM formulas;
 *   - number formats per column (currency, percent, date, whole numbers);
 *   - a frozen, filterable header in the house style's colour;
 *   - several sheets.
 *
 * Node-side; uses exceljs (bundled in both apps since Part 1).
 */

import { evaluateFormula, colNumber, parseRef } from './formula-eval.js';
import type { BrandTokens } from './doc-model.js';
import { addCharts, type ChartSpec, type ChartCells } from './xlsx-charts.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type CellInput = string | number | boolean | null;
export type ColumnFormat = 'text' | 'number' | 'integer' | 'currency' | 'percent' | 'date';

export interface ColumnSpec {
  format?: ColumnFormat;
  /** For currency: GBP (default), USD, EUR, or any symbol. */
  currency?: string;
  width?: number;
}

export interface SheetSpec {
  name: string;
  headers: string[];
  rows: CellInput[][];
  /** Per column, in header order. Missing = worked out from the values. */
  columns?: ColumnSpec[];
  /** A totals row: SUM of these columns (header names or letters). */
  totals?: { label?: string; columns: string[] };
  /** Freeze the header row (default true). */
  freeze?: boolean;
  /** Charts on this sheet: column, bar, line or pie, from ranges on it. */
  charts?: ChartSpec[];
}

const SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', JPY: '¥', INR: '₹' };

export function numberFormat(col: ColumnSpec | undefined): string | undefined {
  switch (col?.format) {
    case 'currency': {
      const sym = SYMBOL[(col.currency ?? 'GBP').toUpperCase()] ?? col.currency ?? '£';
      return `"${sym}"#,##0.00`;
    }
    case 'percent': return '0.0%';
    case 'integer': return '#,##0';
    case 'number': return '#,##0.00';
    case 'date': return 'dd mmm yyyy';
    default: return undefined;
  }
}

const PLAIN_NUMBER = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;

/** What goes in the cell: a number, a date, a formula, or text. */
export function cellValue(raw: CellInput, col?: ColumnSpec): number | string | boolean | Date | { formula: string } | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw;
  const s = String(raw).trim();
  if (s.startsWith('=') && s.length > 1) return { formula: s.slice(1) };
  const f = col?.format;
  if (f === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return s;
  }
  if (f === 'percent' && /^-?\d+(\.\d+)?\s*%$/.test(s)) return Number(s.replace('%', '')) / 100;
  if (f === 'currency' || f === 'number' || f === 'integer' || f === 'percent') {
    const cleaned = s.replace(/[£$€¥₹,\s]/g, '');
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
    return s;
  }
  if (f === 'text') return s;
  return PLAIN_NUMBER.test(s) ? Number(s.replace(/,/g, '')) : s;
}

function colLetter(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

function argb(hex: string | undefined, fallback: string): string {
  const h = (hex ?? '').replace(/^#/, '');
  return `FF${/^[0-9a-fA-F]{6}$/.test(h) ? h.toUpperCase() : fallback}`;
}

/** Work out every formula on a worksheet and store its result beside it. */
export function recalculate(ws: any): { calculated: number; left: number } {
  let calculated = 0, left = 0;
  const get = (c: number, r: number) => {
    const cell = ws.getRow(r).getCell(c);
    const v = cell.value;
    if (v && typeof v === 'object' && 'formula' in v) return { formula: String(v.formula) };
    if (v instanceof Date) return { value: null };
    if (typeof v === 'number' || typeof v === 'string' || v == null) return { value: v as number | string | null };
    return { value: null };
  };
  ws.eachRow({ includeEmpty: false }, (row: any) => {
    row.eachCell({ includeEmpty: false }, (cell: any) => {
      const v = cell.value;
      if (!v || typeof v !== 'object' || !('formula' in v)) return;
      const result = evaluateFormula(String(v.formula), get);
      if (result === undefined) { cell.value = { formula: v.formula }; left++; }
      else { cell.value = { formula: v.formula, result }; calculated++; }
    });
  });
  return { calculated, left };
}

/** Build a workbook from sheet specs. `brand` colours the header. */
export function buildWorkbook(ExcelJS: any, sheets: SheetSpec[], brand?: BrandTokens): { workbook: any; calculated: number; left: number } {
  const workbook = new ExcelJS.Workbook();
  // Excel and LibreOffice recalculate everything on opening, so a formula we
  // could not work out here is still right the moment they open it.
  workbook.calcProperties = { fullCalcOnLoad: true };
  const headFill = argb(brand?.headingColor, '3B2563');
  let calculated = 0, left = 0;

  for (const spec of sheets.length ? sheets : [{ name: 'Sheet1', headers: [], rows: [] }]) {
    const ws = workbook.addWorksheet((spec.name || 'Sheet1').slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    const headers = spec.headers ?? [];
    const cols = spec.columns ?? [];
    const width = Math.max(headers.length, ...(spec.rows ?? []).map((r) => r.length), 0);

    if (headers.length) {
      const hr = ws.addRow(headers);
      hr.font = { bold: true, color: { argb: 'FFFFFFFF' }, ...(brand?.font ? { name: brand.font } : {}) };
      hr.eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headFill } };
        cell.alignment = { vertical: 'middle' };
      });
      hr.height = 22;
    }
    for (const row of spec.rows ?? []) {
      ws.addRow(Array.from({ length: width }, (_, c) => cellValue(row[c] ?? null, cols[c])));
    }

    // Totals: a real SUM per named column, under the data.
    if (spec.totals?.columns?.length && (spec.rows?.length ?? 0) > 0) {
      const first = headers.length ? 2 : 1;
      const last = ws.rowCount;
      const values: Array<CellInput | { formula: string }> = Array.from({ length: width }, () => null);
      values[0] = spec.totals.label ?? 'Total';
      for (const key of spec.totals.columns) {
        const byHeader = headers.findIndex((h) => h.trim().toLowerCase() === key.trim().toLowerCase());
        const idx = byHeader >= 0 ? byHeader : /^[A-Za-z]{1,3}$/.test(key) ? colNumber(key) - 1 : -1;
        if (idx < 0 || idx >= width) continue;
        const L = colLetter(idx + 1);
        values[idx] = { formula: `SUM(${L}${first}:${L}${last})` };
      }
      const tr = ws.addRow(values);
      tr.font = { bold: true };
      tr.eachCell({ includeEmpty: true }, (cell: any) => { cell.border = { top: { style: 'thin', color: { argb: headFill } } }; });
    }

    // Formats and widths per column.
    for (let c = 1; c <= width; c++) {
      const col = ws.getColumn(c);
      const fmt = numberFormat(cols[c - 1]);
      if (fmt) col.eachCell({ includeEmpty: false }, (cell: any, r: number) => { if (r > (headers.length ? 1 : 0)) cell.numFmt = fmt; });
      let maxLen = 8;
      col.eachCell({ includeEmpty: false }, (cell: any) => {
        const v = cell.value;
        const shown = v instanceof Date ? 11 : typeof v === 'object' && v ? 12 : String(v ?? '').length;
        maxLen = Math.max(maxLen, shown + (fmt?.includes('#,##0') ? 3 : 0));
      });
      col.width = cols[c - 1]?.width ?? Math.min(maxLen + 2, 60);
      if (cols[c - 1]?.format && cols[c - 1]!.format !== 'text') col.alignment = { horizontal: 'right' };
    }

    if (headers.length) {
      if (spec.freeze !== false) ws.views = [{ state: 'frozen', ySplit: 1 }];
      if ((spec.rows?.length ?? 0) >= 5) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, width) } };
    }

    const r = recalculate(ws);
    calculated += r.calculated; left += r.left;
  }
  return { workbook, calculated, left };
}

/** Set cells by reference ("B4": 950, "C7": "=SUM(C2:C6)"), then recalculate. */
export function updateCells(ws: any, cells: Record<string, CellInput>, cols?: ColumnSpec[]): string[] {
  const changed: string[] = [];
  for (const [ref, raw] of Object.entries(cells)) {
    const at = parseRef(ref);
    if (!at) continue;
    const cell = ws.getRow(at.r).getCell(at.c);
    const fmt = numberFormat(cols?.[at.c - 1]);
    cell.value = cellValue(raw, cols?.[at.c - 1]);
    if (fmt) cell.numFmt = fmt;
    changed.push(ref.toUpperCase().replace(/\$/g, ''));
  }
  recalculate(ws);
  return changed;
}

/** Cell text and numbers for a chart's cache, from an exceljs workbook. */
export function chartCellsOf(workbook: any): ChartCells {
  return (sheet, c, r) => {
    const v = workbook.getWorksheet(sheet)?.getRow(r).getCell(c).value;
    if (typeof v === 'number') return { text: String(v), num: v };
    if (v && typeof v === 'object' && 'formula' in v) {
      const res = (v as any).result;
      return { text: res == null ? '' : String(res), num: typeof res === 'number' ? res : null };
    }
    if (v instanceof Date) return { text: v.toISOString().slice(0, 10), num: null };
    if (v && typeof v === 'object' && 'richText' in v) return { text: (v as any).richText.map((t: any) => t.text).join(''), num: null };
    return { text: v == null ? '' : String(v), num: null };
  };
}

/** The workbook as .xlsx bytes, with its charts added. */
export async function workbookBytes(workbook: any, charts: Array<{ sheet: string; charts: ChartSpec[] }>, brand?: BrandTokens): Promise<Buffer> {
  const raw = Buffer.from(await workbook.xlsx.writeBuffer());
  return addCharts(raw, charts, chartCellsOf(workbook), brand?.headingColor?.replace(/^#/, ''));
}
