import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocumentManageTool } from '../src/tools/document-manage.js';
import { readOds } from '../src/tools/authoring/ods-spreadsheet.js';
import { readCharts } from '../src/tools/authoring/xlsx-charts.js';
import { readSheetForView } from '../src/tools/authoring/sheet-view.js';

// The open format with everything in it, through Ava's tool (15 Nov 2026).
describe('document_manage .ods', () => {
  const tool = new DocumentManageTool();
  const budget = {
    sheets: [{
      name: 'Costs', headers: ['Item', 'Monthly'], rows: [['Rent', 900], ['Food', 320]],
      columns: [{ format: 'text' }, { format: 'currency' }], totals: { columns: ['Monthly'] },
      charts: [{ type: 'column', title: 'Monthly', categories: 'A2:A3', series: [{ name: 'Monthly', values: 'B2:B3' }] }],
    }],
  };
  const setup = () => { const cwd = mkdtempSync(join(tmpdir(), 'ava-ods-')); return { cwd, ctx: { cwd, sharedState: {} } as never }; };

  it('makes an .ods with formulas worked out, formats and a chart', async () => {
    const { cwd, ctx } = setup();
    const r = await tool.execute({ action: 'create', file_path: 'budget.ods', content: budget }, ctx);
    expect(r.success, r.output).toBe(true);
    const [sheet] = readOds(readFileSync(join(cwd, 'documents', 'budget.ods')));
    expect(sheet.rows[1][1]).toMatchObject({ kind: 'currency', value: 900 });
    expect(sheet.rows[3][1]).toMatchObject({ formula: 'SUM(B2:B3)', value: 1220 });
    expect(sheet.charts[0]).toMatchObject({ type: 'column', title: 'Monthly' });
  });

  it('adds a row above the totals and changes a cell, keeping the chart', async () => {
    const { cwd, ctx } = setup();
    await tool.execute({ action: 'create', file_path: 'budget.ods', content: budget }, ctx);
    let r = await tool.execute({ action: 'edit', file_path: 'budget.ods', content: { sheets: [{ name: 'Costs', rows: [['Energy', 180]] }] } }, ctx);
    expect(r.success, r.output).toBe(true);
    r = await tool.execute({ action: 'update_cells', file_path: 'budget.ods', cells: { B2: 950 } }, ctx);
    expect(r.success, r.output).toBe(true);
    const [sheet] = readOds(readFileSync(join(cwd, 'documents', 'budget.ods')));
    expect(sheet.rows.map((row) => row[0].text)).toEqual(['Item', 'Rent', 'Food', 'Energy', 'Total']);
    expect(sheet.rows[4][1]).toMatchObject({ formula: 'SUM(B2:B4)', value: 1450 });
    expect(sheet.rows[1][1]).toMatchObject({ kind: 'currency', value: 950 });
    expect(sheet.charts[0].categories).toBe('A2:A4');
    expect(sheet.charts[0].data[0].values).toEqual([950, 320, 180]);
  });

  it('exports xlsx ↔ ods with everything, and the viewer reads both', async () => {
    const { cwd, ctx } = setup();
    await tool.execute({ action: 'create', file_path: 'budget.xlsx', content: budget }, ctx);
    let r = await tool.execute({ action: 'export', file_path: 'budget.xlsx', export_format: 'ods' }, ctx);
    expect(r.success, r.output).toBe(true);
    const ods = join(cwd, 'documents', 'budget.ods');
    const [fromOds] = await readSheetForView(ods);
    expect(fromOds.rows[3][1]).toMatchObject({ f: 'SUM(B2:B3)', n: true });
    expect(fromOds.charts?.[0].data[0].values).toEqual([900, 320]);

    r = await tool.execute({ action: 'export', file_path: ods, export_format: 'xlsx', export_path: 'documents/back.xlsx' }, ctx);
    expect(r.success, r.output).toBe(true);
    const back = join(cwd, 'documents', 'back.xlsx');
    const [{ charts }] = readCharts(readFileSync(back));
    expect(charts[0]).toMatchObject({ type: 'column', categories: 'A2:A3' });
    const [fromXlsx] = await readSheetForView(back);
    expect(fromXlsx.rows[3][1]).toEqual({ v: '£1,220.00', f: 'SUM(B2:B3)', n: true });
  });

  it('reads an .ods for Ava, formulas beside their results', async () => {
    const { ctx } = setup();
    await tool.execute({ action: 'create', file_path: 'budget.ods', content: budget }, ctx);
    const r = await tool.execute({ action: 'read', file_path: 'budget.ods' }, ctx);
    expect(r.success, r.output).toBe(true);
    expect(r.output).toContain('(=SUM(B2:B3))');
    expect(r.output).toContain('Charts: column "Monthly"');
  });
});
