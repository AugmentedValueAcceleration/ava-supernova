import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocumentManageTool } from '../src/tools/document-manage.js';
import { unzipSync } from '../src/tools/authoring/zip.js';
import { readCharts } from '../src/tools/authoring/xlsx-charts.js';
import { readSheetForView } from '../src/tools/authoring/sheet-view.js';

/** Every opened tag closes, in order — a well-formedness check without an XML library. */
function wellFormed(xml: string): boolean {
  const stack: string[] = [];
  for (const m of xml.replace(/<\?[\s\S]*?\?>/g, '').matchAll(/<(\/?)([A-Za-z_][\w:.-]*)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]);
  }
  return stack.length === 0;
}

describe('real Excel charts', () => {
  const tool = new DocumentManageTool();
  const make = async (charts: unknown[]) => {
    const cwd = mkdtempSync(join(tmpdir(), 'ava-charts-'));
    const ctx = { cwd, sharedState: {} } as never;
    const r = await tool.execute({ action: 'create', file_path: 'budget.xlsx', content: { sheets: [{
      name: 'Costs', headers: ['Item', 'Monthly', 'Yearly'],
      rows: [['Rent', 900, '=B2*12'], ['Food', 320, '=B3*12'], ['Energy', 180, '=B4*12']],
      totals: { columns: ['Monthly'] }, charts,
    }] } }, ctx);
    expect(r.success, r.output).toBe(true);
    return { cwd, ctx, file: join(cwd, 'documents', 'budget.xlsx') };
  };

  it('writes the chart parts, links and types an .xlsx needs, all well-formed', async () => {
    const { file } = await make([{ type: 'column', title: 'Monthly costs', categories: 'A2:A4', series: [{ name: 'Monthly', values: 'B2:B4' }] }]);
    const parts = new Map(unzipSync(readFileSync(file)).map((e) => [e.name, e.data.toString('utf8')]));
    for (const name of ['xl/charts/chart1.xml', 'xl/drawings/drawing1.xml', 'xl/drawings/_rels/drawing1.xml.rels', 'xl/worksheets/_rels/sheet1.xml.rels']) {
      expect(parts.has(name), name).toBe(true);
      expect(wellFormed(parts.get(name)!), `${name} well-formed`).toBe(true);
    }
    expect(wellFormed(parts.get('xl/worksheets/sheet1.xml')!)).toBe(true);
    expect(parts.get('[Content_Types].xml')).toContain('/xl/charts/chart1.xml');
    expect(parts.get('[Content_Types].xml')).toContain('/xl/drawings/drawing1.xml');
    expect(parts.get('xl/worksheets/sheet1.xml')).toMatch(/<drawing r:id="rId\d+"\/>/);
    expect(parts.get('xl/charts/chart1.xml')).toContain("<c:f>'Costs'!$B$2:$B$4</c:f>");
  });

  it('reads back the chart with the numbers it shows — what the viewer draws', async () => {
    const { file } = await make([
      { type: 'pie', title: 'Where it goes', categories: 'A2:A4', series: [{ name: 'Monthly', values: 'B2:B4' }] },
      { type: 'line', categories: 'A2:A4', series: [{ name: 'Monthly', values: 'B2:B4' }, { name: 'Yearly', values: 'C2:C4' }] },
    ]);
    const [{ sheet, charts }] = readCharts(readFileSync(file));
    expect(sheet).toBe('Costs');
    expect(charts.map((c) => c.type)).toEqual(['pie', 'line']);
    expect(charts[0].labels).toEqual(['Rent', 'Food', 'Energy']);
    expect(charts[0].data[0].values).toEqual([900, 320, 180]);
    expect(charts[1].data[1]).toEqual({ name: 'Yearly', values: [10800, 3840, 2160] }); // worked-out formulas
    const [view] = await readSheetForView(file);
    expect(view.charts?.length).toBe(2);
  });

  it('keeps the chart through edits, stretching it over rows added above the totals', async () => {
    const { ctx, file } = await make([{ type: 'column', categories: 'A2:A4', series: [{ name: 'Monthly', values: 'B2:B4' }] }]);
    await tool.execute({ action: 'edit', file_path: 'budget.xlsx', content: { sheets: [{ name: 'Costs', rows: [['Travel', 140, '=B5*12']] }] } }, ctx);
    let [{ charts }] = readCharts(readFileSync(file));
    expect(charts[0].categories).toBe('A2:A5');
    expect(charts[0].data[0].values).toEqual([900, 320, 180, 140]);
    await tool.execute({ action: 'update_cells', file_path: 'budget.xlsx', cells: { B2: 950 } }, ctx);
    [{ charts }] = readCharts(readFileSync(file));
    expect(charts[0].data[0].values[0]).toBe(950);
  });
});
