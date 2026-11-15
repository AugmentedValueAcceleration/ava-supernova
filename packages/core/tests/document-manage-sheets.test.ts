import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocumentManageTool } from '../src/tools/document-manage.js';
import { readSheetForView } from '../src/tools/authoring/sheet-view.js';

// Ava's spreadsheet tool, end to end (Documents 1.0 Part 3).
describe('document_manage spreadsheets', () => {
  const tool = new DocumentManageTool();
  const setup = () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ava-sheets-'));
    return { cwd, ctx: { cwd, sharedState: {} } as never };
  };

  it('makes a budget in documents/ with worked-out totals', async () => {
    const { cwd, ctx } = setup();
    const r = await tool.execute({ action: 'create', file_path: 'budget.xlsx', content: { sheets: [{
      name: 'Costs', headers: ['Item', 'Monthly'], rows: [['Rent', 900], ['Food', 320]],
      columns: [{ format: 'text' }, { format: 'currency' }], totals: { columns: ['Monthly'] },
    }] } }, ctx);
    expect(r.success, r.output).toBe(true);
    expect(r.output).toContain('1 formula worked out');
    const [sheet] = await readSheetForView(join(cwd, 'documents', 'budget.xlsx'));
    expect(sheet.rows[3][1]).toEqual({ v: '1,220', f: 'SUM(B2:B3)', n: true });
  });

  it('adds rows above the totals, and the totals grow to include them', async () => {
    const { cwd, ctx } = setup();
    await tool.execute({ action: 'create', file_path: 'budget.xlsx', content: { sheets: [{
      name: 'Costs', headers: ['Item', 'Monthly'], rows: [['Rent', 900], ['Food', 320]], totals: { columns: ['Monthly'] },
    }] } }, ctx);
    const r = await tool.execute({ action: 'edit', file_path: 'budget.xlsx', content: { sheets: [{ name: 'Costs', rows: [['Energy', 180]] }] } }, ctx);
    expect(r.success, r.output).toBe(true);
    const [sheet] = await readSheetForView(join(cwd, 'documents', 'budget.xlsx'));
    expect(sheet.rows.map((row) => row[0].v)).toEqual(['Item', 'Rent', 'Food', 'Energy', 'Total']);
    expect(sheet.rows[4][1]).toEqual({ v: '1,400', f: 'SUM(B2:B4)', n: true });
  });

  it('changes a cell and recalculates', async () => {
    const { cwd, ctx } = setup();
    await tool.execute({ action: 'create', file_path: 'budget.xlsx', content: { sheets: [{
      name: 'Costs', headers: ['Item', 'Monthly'], rows: [['Rent', 900], ['Food', 320]], totals: { columns: ['B'] },
    }] } }, ctx);
    const r = await tool.execute({ action: 'update_cells', file_path: 'budget.xlsx', cells: { B2: 950 } }, ctx);
    expect(r.success, r.output).toBe(true);
    const [sheet] = await readSheetForView(join(cwd, 'documents', 'budget.xlsx'));
    expect(sheet.rows[3][1].v).toBe('1,270');
  });

  it('refuses prose documents and points to document_author', async () => {
    const { ctx } = setup();
    const r = await tool.execute({ action: 'create', file_path: 'letter.docx', content: {} }, ctx);
    expect(r.success).toBe(false);
    expect(r.output).toContain('document_author');
  });
});
