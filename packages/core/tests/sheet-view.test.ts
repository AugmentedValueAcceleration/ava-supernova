import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSheetForView } from '../src/tools/authoring/sheet-view.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('a spreadsheet as the viewer shows it', () => {
  it('reads every sheet, numbers as numbers, and a formula beside its value', async () => {
    const mod: any = await import('exceljs');
    const ExcelJS = mod.default?.Workbook ? mod.default : mod;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Costs');
    ws.addRow(['Item', 'Monthly']);
    ws.addRow(['Rent', 900]);
    ws.addRow(['Food', 320]);
    ws.addRow(['Total', { formula: 'SUM(B2:B3)', result: 1220 }]);
    wb.addWorksheet('Summary').addRow(['Notes']);
    const file = join(mkdtempSync(join(tmpdir(), 'ava-sheet-')), 'budget.xlsx');
    await wb.xlsx.writeFile(file);

    const sheets = await readSheetForView(file);
    expect(sheets.map((s) => s.name)).toEqual(['Costs', 'Summary']);
    expect(sheets[0].rows[1][1]).toEqual({ v: '900', n: true });
    expect(sheets[0].rows[3][1]).toEqual({ v: '1,220', f: 'SUM(B2:B3)', n: true });
  });

  it('reads a CSV with quoted commas', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ava-sheet-')), 'list.csv');
    writeFileSync(file, 'Name,Cost\n"Bread, white",1.20\n');
    const [sheet] = await readSheetForView(file);
    expect(sheet.rows[1]).toEqual([{ v: 'Bread, white' }, { v: '1.20', n: true }]);
  });
});
