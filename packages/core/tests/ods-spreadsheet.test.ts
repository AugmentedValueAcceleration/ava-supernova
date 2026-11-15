import { describe, it, expect } from 'vitest';
import { buildWorkbook, chartCellsOf } from '../src/tools/authoring/spreadsheet.js';
import { workbookToOds, readOds, toOdfFormula, fromOdfFormula } from '../src/tools/authoring/ods-spreadsheet.js';
import { unzipSync } from '../src/tools/authoring/zip.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

function wellFormed(xml: string): boolean {
  const stack: string[] = [];
  for (const m of xml.replace(/<\?[\s\S]*?\?>/g, '').matchAll(/<(\/?)([A-Za-z_][\w:.-]*)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]);
  }
  return stack.length === 0;
}

describe('formulas between Excel and OpenDocument', () => {
  it('converts both ways', () => {
    expect(toOdfFormula('SUM(B2:B6)')).toBe('of:=SUM([.B2:.B6])');
    expect(toOdfFormula('=B2*12+$C$3')).toBe('of:=[.B2]*12+[.$C$3]');
    expect(toOdfFormula('C2/C$7')).toBe('of:=[.C2]/[.C$7]');
    expect(fromOdfFormula('of:=[.C2]/[.C$7]')).toBe('C2/C$7');
    expect(toOdfFormula('ROUND(B2/7, 2)')).toBe('of:=ROUND([.B2]/7; 2)');
    expect(toOdfFormula("'My Sheet'!B2+Totals!A1")).toBe("of:=[$'My Sheet'.B2]+[$Totals.A1]");
    expect(toOdfFormula('LOG10(B2)')).toBe('of:=LOG10([.B2])');
    expect(fromOdfFormula('of:=SUM([.B2:.B6])')).toBe('SUM(B2:B6)');
    expect(fromOdfFormula('of:=ROUND([.B2]/7; 2)')).toBe('ROUND(B2/7, 2)');
  });
});

describe('the full spreadsheet as .ods', () => {
  const build = async () => {
    const mod: any = await import('exceljs');
    const ExcelJS = mod.default?.Workbook ? mod.default : mod;
    const charts = [
      { type: 'column' as const, title: 'Monthly costs', categories: 'A2:A4', series: [{ name: 'Monthly', values: 'B2:B4' }] },
      { type: 'pie' as const, categories: 'A2:A4', series: [{ name: 'Monthly', values: 'B2:B4' }] },
    ];
    const { workbook } = buildWorkbook(ExcelJS, [{
      name: 'Budget', headers: ['Item', 'Monthly', 'Share', 'Due'],
      rows: [['Rent', 900, '50%', '2026-12-01'], ['Food', 320, '30%', '2026-12-05'], ['Energy', 180, '20%', '2026-12-10']],
      columns: [{ format: 'text' }, { format: 'currency' }, { format: 'percent' }, { format: 'date' }],
      totals: { columns: ['Monthly'] }, charts,
    }], { headingColor: '1F6F5C' });
    return workbookToOds(workbook, [{ sheet: 'Budget', charts }], chartCellsOf(workbook), { headingColor: '1F6F5C' });
  };

  it('is a valid OpenDocument package: mimetype first and stored, every part listed and well-formed', async () => {
    const ods = await build();
    const entries = unzipSync(ods);
    expect(entries[0].name).toBe('mimetype');
    expect(entries[0].store).toBe(true);
    const files = new Map(entries.map((e) => [e.name, e.data.toString('utf8')]));
    for (const [name, xml] of files) if (name.endsWith('.xml')) expect(wellFormed(xml), `${name} well-formed`).toBe(true);
    const manifest = files.get('META-INF/manifest.xml')!;
    for (const name of files.keys()) if (name !== 'mimetype' && name !== 'META-INF/manifest.xml') expect(manifest, name).toContain(`manifest:full-path="${name}"`);
    expect(manifest).toContain('manifest:full-path="Object 1/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.chart"');
    expect(files.get('content.xml')).toContain('fo:background-color="#1F6F5C"');
  });

  it('reads back values, kinds, formulas and charts', async () => {
    const [sheet] = readOds(await build());
    expect(sheet.name).toBe('Budget');
    expect(sheet.rows[1][1]).toMatchObject({ kind: 'currency', value: 900, currency: 'GBP', text: '£900.00' });
    expect(sheet.rows[1][2]).toMatchObject({ kind: 'percentage', value: 0.5 });
    expect(sheet.rows[1][3]).toMatchObject({ kind: 'date', value: '2026-12-01' });
    expect(sheet.rows[4][1]).toMatchObject({ formula: 'SUM(B2:B4)', value: 1400 });
    expect(sheet.charts.map((c) => c.type)).toEqual(['column', 'pie']);
    expect(sheet.charts[0]).toMatchObject({ title: 'Monthly costs', categories: 'A2:A4', labels: ['Rent', 'Food', 'Energy'] });
    expect(sheet.charts[0].data[0].values).toEqual([900, 320, 180]);
    expect(sheet.charts[0].colours[0]).toBe('#1F6F5C');
  });
});
