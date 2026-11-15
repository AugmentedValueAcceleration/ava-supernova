/**
 * The open format, with everything in it (his call 15 Nov 2026: Ava's
 * spreadsheets come as .ods too — formulas, totals, formats and charts, not
 * just the data).
 *
 * Written from the SAME exceljs workbook as the .xlsx (spreadsheet.ts), so the
 * two files agree cell for cell: values, worked-out formula results, number
 * formats, the house-colour header, a frozen and filterable first row, and
 * charts as OpenDocument chart objects carrying their own copy of the numbers.
 *
 * readOds reads one back — our own and ordinary LibreOffice files — for the
 * viewer, for Ava, and so an .ods can be changed like an .xlsx.
 */

import { zipSync, unzipSync, type ZipEntry } from './zip.js';
import { parseRef } from './formula-eval.js';
import { rangeCells, type ChartSpec, type ChartView, type ChartCells } from './xlsx-charts.js';
import type { BrandTokens } from './doc-model.js';
import type { SheetSpec, ColumnSpec } from './spreadsheet.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const ODS_SHEET_MIMETYPE = 'application/vnd.oasis.opendocument.spreadsheet';
const CHART_MIMETYPE = 'application/vnd.oasis.opendocument.chart';
const PALETTE = ['7C3AED', 'F59E0B', '10B981', '3B82F6', 'EF4444', 'EC4899', '14B8A6', '8B5CF6'];

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function colLetter(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

const quoteSheet = (name: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`);

/** "SUM(B2:B6)*C3" (Excel) → "of:=SUM([.B2:.B6])*[.C3]" (OpenDocument). */
export function toOdfFormula(excel: string): string {
  // "$" marks stay: "C$7" is a fixed row in both formats ([.C$7] in OpenDocument).
  const REF = String.raw`(\$?[A-Za-z]{1,3}\$?\d+)`;
  const body = excel.replace(/^=/, '')
    .replace(new RegExp(String.raw`(?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))!${REF}(?::${REF})?`, 'g'),
      (_m, q, plain, a, b) => {
        const s = `$${quoteSheet((q ?? plain).replace(/''/g, "'"))}`;
        return b ? `[${s}.${a}:.${b}]` : `[${s}.${a}]`;
      })
    .replace(new RegExp(String.raw`(?<![\w.$\[])${REF}:${REF}(?![\w(])`, 'g'), '[.$1:.$2]')
    .replace(new RegExp(String.raw`(?<![\w.$\[:])${REF}(?![\w(\]])`, 'g'), '[.$1]')
    .replace(/,/g, ';');
  return `of:=${body}`;
}

/** "of:=SUM([.B2:.B6])" → "SUM(B2:B6)"; "$" marks kept. */
export function fromOdfFormula(odf: string): string {
  const REF = String.raw`(\$?[A-Z]{1,3}\$?\d+)`;
  return odf.replace(/^(of:)?=/, '')
    .replace(new RegExp(String.raw`\[\$'?([^\].']*)'?\.${REF}(?::\.${REF})?\]`, 'g'), (_m, sheet, a, b) => `'${sheet}'!${a}${b ? `:${b}` : ''}`)
    .replace(new RegExp(String.raw`\[\.${REF}(?::\.${REF})?\]`, 'g'), (_m, a, b) => `${a}${b ? `:${b}` : ''}`)
    .replace(/;/g, ',');
}

// ── Writing ──────────────────────────────────────────────────────────────────

type Kind = { type: 'string' } | { type: 'float'; style: 'num' | 'int' | 'plain' } | { type: 'currency'; code: string; symbol: string } | { type: 'percentage' } | { type: 'date' };

const CURRENCY: Record<string, { code: string; symbol: string }> = {
  '£': { code: 'GBP', symbol: '£' }, $: { code: 'USD', symbol: '$' }, '€': { code: 'EUR', symbol: '€' }, '¥': { code: 'JPY', symbol: '¥' }, '₹': { code: 'INR', symbol: '₹' },
};

/** What an exceljs number format means in OpenDocument terms. */
function kindOf(numFmt: string | undefined, value: unknown): Kind {
  if (value instanceof Date) return { type: 'date' };
  const f = numFmt ?? '';
  const cur = /"(.)"#,##0/.exec(f)?.[1];
  if (cur) return { type: 'currency', ...(CURRENCY[cur] ?? { code: 'GBP', symbol: cur }) };
  if (f.includes('%')) return { type: 'percentage' };
  if (/d.*m.*y/i.test(f)) return { type: 'date' };
  if (f === '#,##0') return { type: 'float', style: 'int' };
  if (f === '#,##0.00') return { type: 'float', style: 'num' };
  return { type: 'float', style: 'plain' };
}

function dataStyles(currencies: Set<string>): string {
  const cur = [...currencies].map((sym) => {
    const name = `N_CUR_${CURRENCY[sym]?.code ?? 'X'}`;
    return `<number:currency-style style:name="${name}"><number:currency-symbol>${esc(sym)}</number:currency-symbol><number:number number:decimal-places="2" number:min-decimal-places="2" number:min-integer-digits="1" number:grouping="true"/></number:currency-style>`;
  }).join('');
  return cur
    + '<number:number-style style:name="N_NUM"><number:number number:decimal-places="2" number:min-decimal-places="2" number:min-integer-digits="1" number:grouping="true"/></number:number-style>'
    + '<number:number-style style:name="N_INT"><number:number number:decimal-places="0" number:min-decimal-places="0" number:min-integer-digits="1" number:grouping="true"/></number:number-style>'
    + '<number:percentage-style style:name="N_PCT"><number:number number:decimal-places="1" number:min-decimal-places="1" number:min-integer-digits="1"/><number:text>%</number:text></number:percentage-style>'
    + '<number:date-style style:name="N_DATE"><number:day number:style="long"/><number:text> </number:text><number:month number:textual="true"/><number:text> </number:text><number:year number:style="long"/></number:date-style>';
}

function dataStyleName(k: Kind): string | null {
  if (k.type === 'currency') return `N_CUR_${k.code}`;
  if (k.type === 'percentage') return 'N_PCT';
  if (k.type === 'date') return 'N_DATE';
  if (k.type === 'float' && k.style === 'num') return 'N_NUM';
  if (k.type === 'float' && k.style === 'int') return 'N_INT';
  return null;
}

const fmtShown = (k: Kind, n: number): string => {
  if (k.type === 'currency') return `${k.symbol}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (k.type === 'percentage') return `${(n * 100).toFixed(1)}%`;
  if (k.type === 'float' && k.style === 'num') return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (k.type === 'float' && k.style === 'int') return Math.round(n).toLocaleString('en-GB');
  return String(n);
};

interface CellStyleKey { data: string | null; head: boolean; total: boolean }

function chartObjectXml(sheet: string, spec: ChartSpec, cells: ChartCells, palette: string[], widthCm: number, heightCm: number): string {
  const labels = rangeCells(spec.categories).map(({ c, r }) => cells(sheet, c, r).text);
  const series = spec.series.slice(0, 8).map((s, i) => ({
    name: s.name ?? `Series ${i + 1}`,
    values: rangeCells(s.values).map(({ c, r }) => cells(sheet, c, r).num ?? 0),
    range: s.values,
  }));
  const addr = (range: string) => {
    const [a, b] = range.replace(/\$/g, '').split(':');
    const q = quoteSheet(sheet);
    return b ? `${q}.${a.toUpperCase()}:${q}.${b.toUpperCase()}` : `${q}.${a.toUpperCase()}`;
  };
  const cls = spec.type === 'pie' ? 'chart:circle' : spec.type === 'line' ? 'chart:line' : 'chart:bar';
  const seriesStyles = series.map((_, i) => `<style:style style:name="S${i}" style:family="chart"><style:graphic-properties draw:fill="solid" draw:fill-color="#${palette[i % palette.length]}" svg:stroke-color="#${palette[i % palette.length]}"${spec.type === 'line' ? ' svg:stroke-width="0.08cm" draw:stroke="solid"' : ''}/></style:style>`).join('');
  const pointStyles = spec.type === 'pie' ? labels.map((_, i) => `<style:style style:name="P${i}" style:family="chart"><style:chart-properties chart:data-label-percentage="true"/><style:graphic-properties draw:fill="solid" draw:fill-color="#${palette[i % palette.length]}"/></style:style>`).join('') : '';
  const axes = spec.type === 'pie' ? '' :
    `<chart:axis chart:dimension="x" chart:name="primary-x" chart:style-name="AX"><chart:categories table:cell-range-address="${esc(addr(spec.categories))}"/></chart:axis>`
    + `<chart:axis chart:dimension="y" chart:name="primary-y" chart:style-name="AX"><chart:grid chart:class="major"/></chart:axis>`;
  const seriesXml = series.map((s, i) => `<chart:series chart:style-name="S${i}" chart:values-cell-range-address="${esc(addr(s.range))}" chart:class="${cls}">`
    + (spec.type === 'pie' ? labels.map((_, k) => `<chart:data-point chart:style-name="P${k}"/>`).join('') : `<chart:data-point chart:repeated="${labels.length}"/>`)
    + '</chart:series>').join('');
  const localTable = '<table:table table:name="local-table">'
    + '<table:table-header-columns><table:table-column/></table:table-header-columns>'
    + `<table:table-columns><table:table-column table:number-columns-repeated="${series.length}"/></table:table-columns>`
    + '<table:table-header-rows><table:table-row><table:table-cell><text:p/></table:table-cell>'
    + series.map((s) => `<table:table-cell office:value-type="string"><text:p>${esc(s.name)}</text:p></table:table-cell>`).join('')
    + '</table:table-row></table:table-header-rows><table:table-rows>'
    + labels.map((l, k) => `<table:table-row><table:table-cell office:value-type="string"><text:p>${esc(l)}</text:p></table:table-cell>`
      + series.map((s) => `<table:table-cell office:value-type="float" office:value="${s.values[k] ?? 0}"><text:p>${s.values[k] ?? 0}</text:p></table:table-cell>`).join('')
      + '</table:table-row>').join('')
    + '</table:table-rows></table:table>';
  const allRanges = [spec.categories, ...series.map((s) => s.range)].map(addr).join(' ');
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:chart="urn:oasis:names:tc:opendocument:xmlns:chart:1.0" office:version="1.3">'
    + '<office:automatic-styles>'
    + '<style:style style:name="CH" style:family="chart"><style:graphic-properties draw:stroke="none" draw:fill="solid" draw:fill-color="#FFFFFF"/></style:style>'
    + `<style:style style:name="PA" style:family="chart"><style:chart-properties chart:vertical="${spec.type === 'bar' ? 'true' : 'false'}"${spec.type === 'line' ? ' chart:symbol-type="automatic"' : ''}/></style:style>`
    + '<style:style style:name="AX" style:family="chart"><style:chart-properties chart:display-label="true"/></style:style>'
    + seriesStyles + pointStyles
    + '</office:automatic-styles>'
    + '<office:body><office:chart>'
    + `<chart:chart svg:width="${widthCm}cm" svg:height="${heightCm}cm" chart:class="${cls}" chart:style-name="CH">`
    + (spec.title ? `<chart:title><text:p>${esc(spec.title)}</text:p></chart:title>` : '')
    + `<chart:legend chart:legend-position="${spec.type === 'pie' ? 'end' : 'bottom'}"/>`
    + `<chart:plot-area chart:style-name="PA" table:cell-range-address="${esc(allRanges)}" chart:data-source-has-labels="none">${axes}${seriesXml}</chart:plot-area>`
    + localTable
    + '</chart:chart></office:chart></office:body></office:document-content>';
}

/**
 * The .ods for an exceljs workbook (values, formulas and their results,
 * formats, header, frozen first row, filters) and its charts.
 */
export function workbookToOds(workbook: any, charts: Array<{ sheet: string; charts: ChartSpec[] }>, cells: ChartCells, brand?: BrandTokens): Buffer {
  const head = (brand?.headingColor ?? '3B2563').replace(/^#/, '');
  const palette = /^[0-9a-fA-F]{6}$/.test(head) ? [head.toUpperCase(), ...PALETTE.filter((p) => p !== head.toUpperCase())] : PALETTE;
  const currencies = new Set<string>();
  const cellStyles = new Map<string, { name: string; key: CellStyleKey }>();
  const styleFor = (key: CellStyleKey): string => {
    const id = `${key.data ?? ''}|${key.head}|${key.total}`;
    let s = cellStyles.get(id);
    if (!s) { s = { name: `ce${cellStyles.size + 1}`, key }; cellStyles.set(id, s); }
    return s.name;
  };
  const colStyles: string[] = [];
  const objects: Array<{ dir: string; xml: string }> = [];
  const dbRanges: string[] = [];
  const frozen: string[] = [];
  let tables = '';

  for (const ws of workbook.worksheets as any[]) {
    const name = String(ws.name);
    const width = Math.max(1, ws.columnCount ?? 1);
    const lastRow = ws.rowCount ?? 0;
    const hasHeader = lastRow > 0 && (ws.getRow(1).font?.bold || ws.getRow(1).getCell(1).fill?.fgColor);
    let cols = '';
    let xCm = 0;
    for (let c = 1; c <= width; c++) {
      const wCm = Math.max(1.5, Math.min(12, ((ws.getColumn(c).width ?? 10) * 0.2)));
      xCm += wCm;
      const sn = `co${colStyles.length + 1}`;
      colStyles.push(`<style:style style:name="${sn}" style:family="table-column"><style:table-column-properties style:column-width="${wCm.toFixed(2)}cm"/></style:style>`);
      cols += `<table:table-column table:style-name="${sn}" table:default-cell-style-name="Default"/>`;
    }

    let rows = '';
    for (let r = 1; r <= lastRow; r++) {
      const row = ws.getRow(r);
      const isHead = hasHeader && r === 1;
      let isTotal = false;
      row.eachCell?.({ includeEmpty: false }, (cell: any) => { const v = cell.value; if (v && typeof v === 'object' && 'formula' in v && /^SUM\(/i.test(String(v.formula)) && r === lastRow) isTotal = true; });
      rows += '<table:table-row>';
      for (let c = 1; c <= width; c++) {
        const cell = row.getCell(c);
        const v = cell.value;
        const formula = v && typeof v === 'object' && 'formula' in v ? String(v.formula) : null;
        const raw = formula ? (v as any).result : v;
        if (raw == null && !formula) {
          const st = isHead || isTotal ? ` table:style-name="${styleFor({ data: null, head: isHead, total: isTotal })}"` : '';
          rows += `<table:table-cell${st}/>`;
          continue;
        }
        const f = formula ? ` table:formula="${esc(toOdfFormula(formula))}"` : '';
        if (typeof raw === 'number' || (formula && (raw == null || typeof raw === 'number'))) {
          const k = kindOf(cell.numFmt, raw);
          const n = typeof raw === 'number' ? raw : 0;
          if (k.type === 'currency') currencies.add(k.symbol);
          const st = styleFor({ data: dataStyleName(k), head: isHead, total: isTotal });
          const attrs = k.type === 'currency' ? `office:value-type="currency" office:currency="${k.code}" office:value="${n}"`
            : k.type === 'percentage' ? `office:value-type="percentage" office:value="${n}"`
            : `office:value-type="float" office:value="${n}"`;
          rows += `<table:table-cell table:style-name="${st}"${f} ${attrs}><text:p>${esc(raw == null ? '' : fmtShown(k, n))}</text:p></table:table-cell>`;
        } else if (raw instanceof Date) {
          const iso = raw.toISOString().slice(0, 10);
          const st = styleFor({ data: 'N_DATE', head: isHead, total: isTotal });
          rows += `<table:table-cell table:style-name="${st}"${f} office:value-type="date" office:date-value="${iso}"><text:p>${iso}</text:p></table:table-cell>`;
        } else {
          const text = typeof raw === 'object' && raw && 'richText' in raw ? (raw as any).richText.map((t: any) => t.text).join('') : String(raw);
          const st = styleFor({ data: null, head: isHead, total: isTotal });
          rows += `<table:table-cell table:style-name="${st}"${f} office:value-type="string"><text:p>${esc(text)}</text:p></table:table-cell>`;
        }
      }
      rows += '</table:table-row>';
    }

    // Charts: frames to the right of the data, stacked down.
    let shapes = '';
    const sheetCharts = charts.find((x) => x.sheet === name)?.charts ?? [];
    sheetCharts.forEach((spec, i) => {
      const n = objects.length + 1;
      const dir = `Object ${n}`;
      const wCm = spec.type === 'pie' ? 12 : 15, hCm = 8;
      const at = spec.at ? parseRef(spec.at) : null;
      const x = at ? (at.c - 1) * 2.2 : xCm + 1;
      const y = at ? (at.r - 1) * 0.45 : 0.5 + i * (hCm + 0.8);
      objects.push({ dir, xml: chartObjectXml(name, spec, cells, palette, wCm, hCm) });
      const ranges = [spec.categories, ...spec.series.map((s) => s.values)].map((rg) => {
        const [a, b] = rg.replace(/\$/g, '').split(':'); const q = quoteSheet(name);
        return b ? `${q}.${a}:${q}.${b}` : `${q}.${a}`;
      }).join(' ');
      shapes += `<draw:frame draw:z-index="${i}" draw:name="Chart ${n}" svg:width="${wCm}cm" svg:height="${hCm}cm" svg:x="${x.toFixed(2)}cm" svg:y="${y.toFixed(2)}cm">`
        + `<draw:object draw:notify-on-update-of-ranges="${esc(ranges)}" xlink:href="./${dir}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
    });

    tables += `<table:table table:name="${esc(name)}">${shapes ? `<table:shapes>${shapes}</table:shapes>` : ''}${cols}${rows}</table:table>`;
    if (hasHeader && lastRow >= 6) dbRanges.push(`<table:database-range table:name="__Anonymous_Sheet_DB__${dbRanges.length}" table:target-range-address="${esc(`${quoteSheet(name)}.A1:${quoteSheet(name)}.${colLetter(width)}${lastRow}`)}" table:display-filter-buttons="true"/>`);
    if (hasHeader && (ws.views?.[0]?.state === 'frozen')) frozen.push(name);
  }

  const styleXml = [...cellStyles.values()].map(({ name, key }) => {
    const dsn = key.data ? ` style:data-style-name="${key.data}"` : '';
    const cellProps = key.head ? `<style:table-cell-properties fo:background-color="#${head}"/>`
      : key.total ? `<style:table-cell-properties fo:border-top="0.06pt solid #${head}"/>` : '';
    const textProps = key.head ? '<style:text-properties fo:font-weight="bold" fo:color="#FFFFFF"/>' : key.total ? '<style:text-properties fo:font-weight="bold"/>' : '';
    return `<style:style style:name="${name}" style:family="table-cell" style:parent-style-name="Default"${dsn}>${cellProps}${textProps}</style:style>`;
  }).join('');

  const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS} office:version="1.3">`
    + `<office:automatic-styles>${dataStyles(currencies)}${colStyles.join('')}${styleXml}</office:automatic-styles>`
    + `<office:body><office:spreadsheet>${tables}${dbRanges.length ? `<table:database-ranges>${dbRanges.join('')}</table:database-ranges>` : ''}</office:spreadsheet></office:body></office:document-content>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS} office:version="1.3"><office:styles><style:style style:name="Default" style:family="table-cell"/></office:styles></office:document-styles>`;
  const meta = '<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.3"><office:meta><meta:generator>Ava Supernova</meta:generator></office:meta></office:document-meta>';
  // The first row stays put when scrolling (LibreOffice reads this from settings).
  const tableSettings = frozen.map((t) => `<config:config-item-map-entry config:name="${esc(t)}"><config:config-item config:name="VerticalSplitMode" config:type="short">2</config:config-item><config:config-item config:name="VerticalSplitPosition" config:type="int">1</config:config-item><config:config-item config:name="ActiveSplitRange" config:type="short">2</config:config-item><config:config-item config:name="PositionTop" config:type="int">0</config:config-item><config:config-item config:name="PositionBottom" config:type="int">1</config:config-item></config:config-item-map-entry>`).join('');
  const settings = `<?xml version="1.0" encoding="UTF-8"?><office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0" office:version="1.3"><office:settings><config:config-item-set config:name="ooo:view-settings"><config:config-item-map-indexed config:name="Views"><config:config-item-map-entry><config:config-item-map-named config:name="Tables">${tableSettings}</config:config-item-map-named></config:config-item-map-entry></config:config-item-map-indexed></config:config-item-set></office:settings></office:document-settings>`;

  const entry = (path: string, type: string) => `<manifest:file-entry manifest:full-path="${esc(path)}" manifest:media-type="${type}"/>`;
  const manifest = '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">'
    + `<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${ODS_SHEET_MIMETYPE}"/>`
    + entry('content.xml', 'text/xml') + entry('styles.xml', 'text/xml') + entry('meta.xml', 'text/xml') + entry('settings.xml', 'text/xml')
    + objects.map((o) => `<manifest:file-entry manifest:full-path="${esc(o.dir)}/" manifest:version="1.3" manifest:media-type="${CHART_MIMETYPE}"/>${entry(`${o.dir}/content.xml`, 'text/xml')}`).join('')
    + '</manifest:manifest>';

  const entries: ZipEntry[] = [
    { name: 'mimetype', data: Buffer.from(ODS_SHEET_MIMETYPE, 'ascii'), store: true },
    { name: 'META-INF/manifest.xml', data: Buffer.from(manifest, 'utf8') },
    { name: 'content.xml', data: Buffer.from(content, 'utf8') },
    { name: 'styles.xml', data: Buffer.from(styles, 'utf8') },
    { name: 'meta.xml', data: Buffer.from(meta, 'utf8') },
    { name: 'settings.xml', data: Buffer.from(settings, 'utf8') },
    ...objects.map((o) => ({ name: `${o.dir}/content.xml`, data: Buffer.from(o.xml, 'utf8') })),
  ];
  return zipSync(entries);
}

// ── Reading ──────────────────────────────────────────────────────────────────

export interface OdsCell {
  /** What it shows. */
  text: string;
  /** The value, for numbers, currency, percentages (a fraction) and dates (ISO). */
  value?: number | string;
  kind: 'string' | 'float' | 'currency' | 'percentage' | 'date' | 'empty';
  currency?: string;
  /** Excel-style formula, without "=". */
  formula?: string;
}

export interface OdsSheet { name: string; rows: OdsCell[][]; charts: ChartView[] }

const attr = (tag: string, name: string): string | undefined => {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return m ? unesc(m[1]) : undefined;
};

function readCell(xml: string, open: string): OdsCell {
  const kind = (attr(open, 'office:value-type') ?? 'empty') as OdsCell['kind'];
  const text = [...xml.matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g)].map((m) => unesc(m[1].replace(/<[^>]+>/g, ''))).join('\n');
  const f = attr(open, 'table:formula');
  const cell: OdsCell = { text, kind: kind === 'empty' && text ? 'string' : kind };
  if (f) cell.formula = fromOdfFormula(f);
  if (kind === 'float' || kind === 'currency' || kind === 'percentage') cell.value = Number(attr(open, 'office:value'));
  if (kind === 'currency') cell.currency = attr(open, 'office:currency');
  if (kind === 'date') cell.value = attr(open, 'office:date-value');
  if (kind === 'string') cell.value = text;
  return cell;
}

function readChartObject(xml: string): ChartView | null {
  const cls = /<chart:chart\b[^>]*chart:class="chart:(\w+)"/.exec(xml)?.[1];
  if (!cls) return null;
  const vertical = /chart:vertical="true"/.test(xml);
  const type = cls === 'circle' ? 'pie' : cls === 'line' ? 'line' : vertical ? 'bar' : 'column';
  const title = /<chart:title\b[^>]*>\s*<text:p[^>]*>([\s\S]*?)<\/text:p>/.exec(xml)?.[1];
  const local = (addr: string | undefined) => (addr ?? '').split(' ')[0].replace(/[^.:\s]*\./g, '').replace(/\$/g, '');
  const categories = local(/<chart:categories table:cell-range-address="([^"]*)"/.exec(xml)?.[1]);
  const valueRanges = [...xml.matchAll(/<chart:series\b[^>]*chart:values-cell-range-address="([^"]*)"/g)].map((m) => local(unesc(m[1])));
  const table = /<table:table table:name="local-table">([\s\S]*?)<\/table:table>/.exec(xml)?.[1] ?? '';
  const headerRow = /<table:table-header-rows>([\s\S]*?)<\/table:table-header-rows>/.exec(table)?.[1] ?? '';
  const names = [...headerRow.matchAll(/<table:table-cell\b[^>]*>([\s\S]*?)<\/table:table-cell>|<table:table-cell\b[^>]*\/>/g)].slice(1).map((m) => unesc((m[1] ?? '').replace(/<[^>]+>/g, '')));
  const body = /<table:table-rows>([\s\S]*?)<\/table:table-rows>/.exec(table)?.[1] ?? '';
  const labels: string[] = [];
  const values: number[][] = names.map(() => []);
  for (const row of body.matchAll(/<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/g)) {
    const cells = [...row[1].matchAll(/<table:table-cell\b([^>]*)>([\s\S]*?)<\/table:table-cell>|<table:table-cell\b([^>]*)\/>/g)];
    labels.push(unesc((cells[0]?.[2] ?? '').replace(/<[^>]+>/g, '')));
    cells.slice(1).forEach((c, i) => { if (values[i]) values[i].push(Number(attr(c[1] ?? c[3] ?? '', 'office:value') ?? 0) || 0); });
  }
  const colours = type === 'pie'
    ? [...xml.matchAll(/style:name="P\d+"[\s\S]*?draw:fill-color="#([0-9A-Fa-f]{6})"/g)].map((m) => `#${m[1]}`)
    : [...xml.matchAll(/style:name="S\d+"[\s\S]*?draw:fill-color="#([0-9A-Fa-f]{6})"/g)].map((m) => `#${m[1]}`);
  return {
    type, title: title ? unesc(title.replace(/<[^>]+>/g, '')) : undefined, categories,
    series: names.map((n, i) => ({ name: n, values: valueRanges[i] ?? '' })),
    labels, data: names.map((n, i) => ({ name: n, values: values[i] })), colours,
  };
}

/** Every sheet of an .ods: its cells (with formulas) and its charts. */
export function readOds(bytes: Buffer, limits = { rows: 2000, cols: 60 }): OdsSheet[] {
  const files = new Map(unzipSync(bytes).map((e) => [e.name, e.data]));
  const content = files.get('content.xml')?.toString('utf8');
  if (!content) throw new Error('This is not an OpenDocument spreadsheet.');
  const out: OdsSheet[] = [];
  for (const t of content.matchAll(/<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/g)) {
    const name = attr(t[1], 'table:name') ?? `Sheet${out.length + 1}`;
    const body = t[2];
    const charts: ChartView[] = [];
    for (const obj of body.matchAll(/<draw:object\b[^>]*xlink:href="\.?\/?([^"]+)"/g)) {
      const xml = files.get(`${unesc(obj[1]).replace(/\/$/, '')}/content.xml`)?.toString('utf8');
      const view = xml ? readChartObject(xml) : null;
      if (view) charts.push(view);
    }
    const rows: OdsCell[][] = [];
    const rowsXml = body.replace(/<table:shapes>[\s\S]*?<\/table:shapes>/g, '');
    for (const r of rowsXml.matchAll(/<table:table-row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
      const repeat = Math.min(Number(attr(r[1], 'table:number-rows-repeated') ?? 1), limits.rows);
      const cells: OdsCell[] = [];
      for (const c of (r[2] ?? '').matchAll(/<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
        const n = Math.min(Number(attr(c[1], 'table:number-columns-repeated') ?? 1), limits.cols);
        const cell = readCell(c[2] ?? '', c[1]);
        for (let k = 0; k < n && cells.length < limits.cols; k++) cells.push(cell);
      }
      while (cells.length && cells[cells.length - 1].kind === 'empty') cells.pop();
      for (let k = 0; k < repeat && rows.length < limits.rows; k++) rows.push(cells);
    }
    while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
    out.push({ name, rows, charts });
  }
  return out;
}

/**
 * An .ods sheet as a SheetSpec, so it can be rebuilt through the same
 * workbook as an .xlsx and changed the same way: formulas kept as formulas,
 * numbers as numbers, each column's format taken from its first value.
 */
export function odsToSheetSpec(sheet: OdsSheet): SheetSpec {
  const [head = [], ...body] = sheet.rows;
  const hasHeader = head.length > 0 && head.every((c) => c.kind === 'string' || c.kind === 'empty') && !head.some((c) => c.formula);
  const dataRows = hasHeader ? body : sheet.rows;
  const width = Math.max(head.length, ...dataRows.map((r) => r.length), 0);
  const columns: ColumnSpec[] = Array.from({ length: width }, (_, c) => {
    const first = dataRows.find((r) => r[c] && r[c].kind !== 'empty' && r[c].kind !== 'string')?.[c];
    if (!first) return { format: 'text' };
    if (first.kind === 'currency') return { format: 'currency', currency: first.currency ?? 'GBP' };
    if (first.kind === 'percentage') return { format: 'percent' };
    if (first.kind === 'date') return { format: 'date' };
    return /[.,]\d{2}$/.test(first.text) ? { format: 'number' } : {};
  });
  return {
    name: sheet.name,
    headers: hasHeader ? head.map((c) => c.text) : [],
    rows: dataRows.map((r) => Array.from({ length: width }, (_, c) => {
      const cell = r[c];
      if (!cell || cell.kind === 'empty') return null;
      if (cell.formula) return `=${cell.formula}`;
      if (cell.kind === 'date') return String(cell.value ?? cell.text);
      if (typeof cell.value === 'number') return cell.value;
      return cell.text;
    })),
    columns,
    charts: sheet.charts.map((ch) => ({ type: ch.type, title: ch.title, categories: ch.categories, series: ch.series })),
  };
}
