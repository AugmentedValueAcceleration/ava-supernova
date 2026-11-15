import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateFormula, type CellGetter } from '../src/tools/authoring/formula-eval.js';
import { buildWorkbook, cellValue, updateCells } from '../src/tools/authoring/spreadsheet.js';
import { readSheetForView } from '../src/tools/authoring/sheet-view.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const grid = (cells: Record<string, number | string | { f: string }>): CellGetter => (c, r) => {
  const key = `${String.fromCharCode(64 + c)}${r}`;
  const v = cells[key];
  if (v === undefined) return undefined;
  return typeof v === 'object' ? { formula: v.f } : { value: v };
};

describe('the spreadsheet calculator', () => {
  const g = grid({ B2: 900, B3: 320, B4: 180, B5: 'n/a', C2: 2, C3: { f: 'B2*C2' } });

  it('sums, averages and counts ranges, skipping text like Excel', () => {
    expect(evaluateFormula('=SUM(B2:B5)', g)).toBe(1400);
    expect(evaluateFormula('AVERAGE(B2:B4)', g)).toBeCloseTo(466.6666666667);
    expect(evaluateFormula('COUNT(B2:B5)', g)).toBe(3);
    expect(evaluateFormula('MAX(B2:B4)-MIN(B2:B4)', g)).toBe(720);
  });

  it('does arithmetic with brackets, powers, percentages and $ references', () => {
    expect(evaluateFormula('=($B$2+B3)*10%', g)).toBe(122);
    expect(evaluateFormula('=ROUND(B2/7, 2)', g)).toBe(128.57);
    expect(evaluateFormula('=2^3+ABS(-1)', g)).toBe(9);
  });

  it('works out a formula that depends on another formula', () => {
    expect(evaluateFormula('=C3+1', g)).toBe(1801);
  });

  it('leaves what it does not do for the person\'s app — never a guess', () => {
    expect(evaluateFormula('=VLOOKUP(A2,A1:B9,2)', g)).toBeUndefined();
    expect(evaluateFormula('=Sheet2!B2', g)).toBeUndefined();
    expect(evaluateFormula('=B5*2', g)).toBeUndefined(); // text used as a number
    expect(evaluateFormula('=B2/0', g)).toBeUndefined();
  });
});

describe('real spreadsheets', () => {
  it('stores numbers as numbers, keeps text, and reads formats from the column', () => {
    expect(cellValue('900')).toBe(900);
    expect(cellValue('1,200.50')).toBe(1200.5);
    expect(cellValue('Rent')).toBe('Rent');
    expect(cellValue('£1,200', { format: 'currency' })).toBe(1200);
    expect(cellValue('12.5%', { format: 'percent' })).toBe(0.125);
    expect(cellValue('2026-11-15', { format: 'date' })).toEqual(new Date(Date.UTC(2026, 10, 15)));
    expect(cellValue('=SUM(B2:B3)')).toEqual({ formula: 'SUM(B2:B3)' });
    expect(cellValue('007', { format: 'text' })).toBe('007');
  });

  it('builds a budget with a totals row, formats, a frozen header and calculated results', async () => {
    const mod: any = await import('exceljs');
    const ExcelJS = mod.default?.Workbook ? mod.default : mod;
    const { workbook, calculated, left } = buildWorkbook(ExcelJS, [{
      name: 'Costs',
      headers: ['Item', 'Monthly', 'Yearly'],
      rows: [['Rent', 900, '=B2*12'], ['Food', '320', '=B3*12'], ['Energy', 180, '=B4*12']],
      columns: [{ format: 'text' }, { format: 'currency', currency: 'GBP' }, { format: 'currency' }],
      totals: { columns: ['Monthly', 'Yearly'] },
    }], { headingColor: '1F6F5C' });
    expect(left).toBe(0);
    expect(calculated).toBe(5); // three yearly + two totals
    const ws = workbook.getWorksheet('Costs');
    expect(ws.getCell('B3').value).toBe(320);
    expect(ws.getCell('B5').value).toEqual({ formula: 'SUM(B2:B4)', result: 1400 });
    expect(ws.getCell('C5').value).toEqual({ formula: 'SUM(C2:C4)', result: 16800 });
    expect(ws.getCell('B2').numFmt).toBe('"£"#,##0.00');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.getCell('A1').fill.fgColor.argb).toBe('FF1F6F5C');

    // What the viewer and Ava read back: values, not blanks.
    const file = join(mkdtempSync(join(tmpdir(), 'ava-budget-')), 'budget.xlsx');
    await workbook.xlsx.writeFile(file);
    const [sheet] = await readSheetForView(file);
    expect(sheet.rows[4][1]).toEqual({ v: '1,400', f: 'SUM(B2:B4)', n: true });
  });

  it('changing a cell recalculates everything that depends on it', async () => {
    const mod: any = await import('exceljs');
    const ExcelJS = mod.default?.Workbook ? mod.default : mod;
    const { workbook } = buildWorkbook(ExcelJS, [{
      name: 'Costs', headers: ['Item', 'Monthly'], rows: [['Rent', 900], ['Food', 320]], totals: { columns: ['B'] },
    }]);
    const ws = workbook.getWorksheet('Costs');
    expect(updateCells(ws, { B2: 950 })).toEqual(['B2']);
    expect(ws.getCell('B4').value).toEqual({ formula: 'SUM(B2:B3)', result: 1270 });
  });
});
