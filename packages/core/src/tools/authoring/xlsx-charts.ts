/**
 * Real Excel charts (Documents 1.0, his call 15 Nov 2026: "build the charts
 * ourselves on top of what we have").
 *
 * exceljs writes no charts, and the libraries that do were either young,
 * paid, or a second spreadsheet library to trust. A chart in an .xlsx is a
 * few small XML parts — a chart, a drawing that places it, and the links
 * between them — so after exceljs writes the workbook they are added here,
 * with Node's own zlib (zip.ts). Column, bar, line and pie: the charts people
 * put in a budget or a tracker.
 *
 * Each chart carries the numbers it shows (a "cache") as well as the cell
 * ranges, so it draws in Excel and LibreOffice straight away and the viewer
 * can draw it too (readCharts). exceljs drops charts when it rewrites a file,
 * so an edit reads them first and adds them back (document_manage).
 */

import { unzipSync, zipSync, type ZipEntry } from './zip.js';
import { parseRef } from './formula-eval.js';

export type ChartType = 'column' | 'bar' | 'line' | 'pie';

export interface ChartSpec {
  type: ChartType;
  title?: string;
  /** Category labels, a range on the same sheet: "A2:A6". */
  categories: string;
  /** One or more value ranges: [{ name: "Monthly", values: "B2:B6" }]. */
  series: Array<{ name?: string; values: string }>;
  /** Top-left cell of the chart: "E2". Default: two columns right of the data. */
  at?: string;
}

/** A chart as read back, with the numbers it shows. */
export interface ChartView extends ChartSpec {
  labels: string[];
  data: Array<{ name: string; values: number[] }>;
  /** The colours in the file: one per series, or one per slice for a pie. */
  colours: string[];
}

/** Reads cell values for a chart's cache: text for labels, numbers for values. */
export type ChartCells = (sheet: string, col: number, row: number) => { text: string; num: number | null };

const NS = {
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  xdr: 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
};
const REL_DRAWING = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';
const REL_CHART = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';
const CT_DRAWING = 'application/vnd.openxmlformats-officedocument.drawing+xml';
const CT_CHART = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
const PALETTE = ['7C3AED', 'F59E0B', '10B981', '3B82F6', 'EF4444', 'EC4899', '14B8A6', '8B5CF6'];

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function colLetter(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/** "A2:A6" → the cells in it, row by row (a single column or row in practice). */
export function rangeCells(range: string): Array<{ c: number; r: number }> {
  const [a, b] = range.replace(/^.*!/, '').replace(/\$/g, '').split(':');
  const p = parseRef(a);
  const q = parseRef(b ?? a);
  if (!p || !q) return [];
  const out: Array<{ c: number; r: number }> = [];
  for (let r = Math.min(p.r, q.r); r <= Math.max(p.r, q.r); r++) for (let c = Math.min(p.c, q.c); c <= Math.max(p.c, q.c); c++) out.push({ c, r });
  return out.slice(0, 500);
}

function absRange(sheet: string, range: string): string {
  const [a, b] = range.replace(/^.*!/, '').replace(/\$/g, '').split(':');
  const fix = (ref: string) => { const m = /^([A-Za-z]+)(\d+)$/.exec(ref); return m ? `$${m[1].toUpperCase()}$${m[2]}` : ref; };
  return `'${sheet.replace(/'/g, "''")}'!${fix(a)}${b ? `:${fix(b)}` : ''}`;
}

function strCache(values: string[]): string {
  return `<c:strCache><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache>`;
}
function numCache(values: Array<number | null>): string {
  return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => (v == null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)).join('')}</c:numCache>`;
}
const fill = (hex: string) => `<c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></c:spPr>`;

/** The chart part's XML. `brandColour` leads the palette. */
export function chartXml(sheet: string, spec: ChartSpec, cells: ChartCells, brandColour?: string): string {
  const palette = brandColour && /^[0-9a-fA-F]{6}$/.test(brandColour) ? [brandColour.toUpperCase(), ...PALETTE.filter((p) => p !== brandColour.toUpperCase())] : PALETTE;
  const catCells = rangeCells(spec.categories);
  const labels = catCells.map(({ c, r }) => cells(sheet, c, r).text);
  const series = spec.series.slice(0, 8).map((s, i) => {
    const vals = rangeCells(s.values).map(({ c, r }) => cells(sheet, c, r).num);
    const name = s.name ?? `Series ${i + 1}`;
    const tx = `<c:tx><c:v>${esc(name)}</c:v></c:tx>`;
    const cat = `<c:cat><c:strRef><c:f>${esc(absRange(sheet, spec.categories))}</c:f>${strCache(labels)}</c:strRef></c:cat>`;
    const val = `<c:val><c:numRef><c:f>${esc(absRange(sheet, s.values))}</c:f>${numCache(vals)}</c:numRef></c:val>`;
    const head = `<c:idx val="${i}"/><c:order val="${i}"/>${tx}`;
    if (spec.type === 'pie') {
      const pts = labels.map((_, k) => `<c:dPt><c:idx val="${k}"/><c:bubble3D val="0"/>${fill(palette[k % palette.length])}</c:dPt>`).join('');
      const dl = '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>';
      return `<c:ser>${head}${pts}${dl}${cat}${val}</c:ser>`;
    }
    if (spec.type === 'line') {
      const ln = `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${palette[i % palette.length]}"/></a:solidFill><a:round/></a:ln></c:spPr>`;
      return `<c:ser>${head}${ln}<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>${cat}${val}<c:smooth val="0"/></c:ser>`;
    }
    return `<c:ser>${head}${fill(palette[i % palette.length])}<c:invertIfNegative val="0"/>${cat}${val}</c:ser>`;
  }).join('');

  const axes = (catPos: string, valPos: string) =>
    `<c:catAx><c:axId val="500000001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${catPos}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="500000002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
    + `<c:valAx><c:axId val="500000002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${valPos}"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="500000001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  const ids = '<c:axId val="500000001"/><c:axId val="500000002"/>';

  let plot: string;
  if (spec.type === 'pie') plot = `<c:pieChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/></c:pieChart>`;
  else if (spec.type === 'line') plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/>${ids}</c:lineChart>${axes('b', 'l')}`;
  else {
    const dir = spec.type === 'bar' ? 'bar' : 'col';
    plot = `<c:barChart><c:barDir val="${dir}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="80"/>${ids}</c:barChart>${spec.type === 'bar' ? axes('l', 'b') : axes('b', 'l')}`;
  }
  const title = spec.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${esc(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : '<c:autoTitleDeleted val="1"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="${NS.c}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}</c:plotArea><c:legend><c:legendPos val="${spec.type === 'pie' ? 'r' : 'b'}"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

function drawingXml(anchors: Array<{ col: number; row: number; relId: string; n: number; wide: boolean }>): string {
  const frames = anchors.map((a) => `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${a.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${a.col + (a.wide ? 9 : 7)}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.row + 16}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${a.n + 1}" name="Chart ${a.n}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS.c}"><c:chart xmlns:c="${NS.c}" xmlns:r="${NS.r}" r:id="${a.relId}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="${NS.xdr}" xmlns:a="${NS.a}">${frames}</xdr:wsDr>`;
}

const relsXml = (rels: Array<{ id: string; type: string; target: string }>) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NS.rel}">${rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join('')}</Relationships>`;

/** Sheet name → its part ("xl/worksheets/sheet1.xml"), from the workbook's own links. */
function sheetParts(files: Map<string, Buffer>): Map<string, string> {
  const wb = files.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const target = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"[^>]*>/g)) target.set(m[1], m[2]);
  for (const m of rels.matchAll(/<Relationship\b[^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"[^>]*>/g)) target.set(m[2], m[1]);
  const out = new Map<string, string>();
  for (const m of wb.matchAll(/<sheet\b[^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"[^>]*\/?>/g)) {
    const t = target.get(m[2]);
    if (t) out.set(unesc(m[1]), t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`);
  }
  return out;
}

function nextFree(files: Map<string, Buffer>, prefix: string, ext: string): number {
  let n = 1;
  while (files.has(`${prefix}${n}${ext}`)) n++;
  return n;
}

/**
 * Add charts to an .xlsx exceljs wrote. `perSheet` names the sheet each set
 * of charts sits on. Returns the new file.
 */
export function addCharts(xlsx: Buffer, perSheet: Array<{ sheet: string; charts: ChartSpec[] }>, cells: ChartCells, brandColour?: string): Buffer {
  const todo = perSheet.filter((p) => p.charts.length);
  if (!todo.length) return xlsx;
  const entries = unzipSync(xlsx);
  const files = new Map(entries.map((e) => [e.name, e.data]));
  const parts = sheetParts(files);
  let types = files.get('[Content_Types].xml')!.toString('utf8');

  for (const { sheet, charts } of todo) {
    const part = parts.get(sheet);
    if (!part) throw new Error(`No sheet called ${sheet}.`);
    let sheetXml = files.get(part)!.toString('utf8');
    if (/<drawing\b/.test(sheetXml)) continue; // the sheet already has a drawing (a picture): leave it alone

    const dn = nextFree(files, 'xl/drawings/drawing', '.xml');
    const drawingName = `xl/drawings/drawing${dn}.xml`;
    const drawingRels: Array<{ id: string; type: string; target: string }> = [];
    const anchors: Array<{ col: number; row: number; relId: string; n: number; wide: boolean }> = [];
    charts.forEach((spec, i) => {
      const cn = nextFree(files, 'xl/charts/chart', '.xml');
      files.set(`xl/charts/chart${cn}.xml`, Buffer.from(chartXml(sheet, spec, cells, brandColour), 'utf8'));
      types = types.replace('</Types>', `<Override PartName="/xl/charts/chart${cn}.xml" ContentType="${CT_CHART}"/></Types>`);
      const relId = `rId${i + 1}`;
      drawingRels.push({ id: relId, type: REL_CHART, target: `../charts/chart${cn}.xml` });
      // Placed beside the data unless told: two columns right of the widest range, stacked down.
      const at = spec.at ? parseRef(spec.at) : null;
      const right = Math.max(0, ...[spec.categories, ...spec.series.map((s) => s.values)].flatMap(rangeCells).map((x) => x.c));
      anchors.push({ col: at ? at.c - 1 : right + 1, row: at ? at.r - 1 : 1 + i * 18, relId, n: i + 1, wide: spec.type !== 'pie' });
    });
    files.set(drawingName, Buffer.from(drawingXml(anchors), 'utf8'));
    files.set(`xl/drawings/_rels/drawing${dn}.xml.rels`, Buffer.from(relsXml(drawingRels), 'utf8'));
    types = types.replace('</Types>', `<Override PartName="/${drawingName}" ContentType="${CT_DRAWING}"/></Types>`);

    // The sheet links to its drawing.
    const relsName = part.replace(/([^/]+)$/, '_rels/$1.rels');
    const existing = files.get(relsName)?.toString('utf8');
    const used = new Set([...(existing ?? '').matchAll(/Id="([^"]+)"/g)].map((m) => m[1]));
    let rid = 1; while (used.has(`rId${rid}`)) rid++;
    const rel = `<Relationship Id="rId${rid}" Type="${REL_DRAWING}" Target="../drawings/drawing${dn}.xml"/>`;
    files.set(relsName, Buffer.from(existing ? existing.replace('</Relationships>', `${rel}</Relationships>`) : relsXml([{ id: `rId${rid}`, type: REL_DRAWING, target: `../drawings/drawing${dn}.xml` }]), 'utf8'));
    if (!/xmlns:r=/.test(sheetXml.slice(0, sheetXml.indexOf('>', sheetXml.indexOf('<worksheet')) + 1))) {
      sheetXml = sheetXml.replace('<worksheet', `<worksheet xmlns:r="${NS.r}"`);
    }
    // <drawing> sits after page set-up and before tables / extensions (schema order).
    const later = ['<legacyDrawing', '<legacyDrawingHF', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>']
      .map((t) => sheetXml.indexOf(t)).filter((i) => i >= 0);
    const at = Math.min(...later);
    sheetXml = `${sheetXml.slice(0, at)}<drawing r:id="rId${rid}"/>${sheetXml.slice(at)}`;
    files.set(part, Buffer.from(sheetXml, 'utf8'));
  }
  files.set('[Content_Types].xml', Buffer.from(types, 'utf8'));

  // Keep the original order ([Content_Types].xml first), new parts after.
  const order = entries.map((e) => e.name);
  const out: ZipEntry[] = [
    ...order.map((name) => ({ name, data: files.get(name)! })),
    ...[...files.keys()].filter((n) => !order.includes(n)).map((name) => ({ name, data: files.get(name)! })),
  ];
  return zipSync(out);
}

/** The charts in an .xlsx, per sheet, with the numbers they show. */
export function readCharts(xlsx: Buffer): Array<{ sheet: string; charts: ChartView[] }> {
  let entries: ZipEntry[];
  try { entries = unzipSync(xlsx); } catch { return []; }
  const files = new Map(entries.map((e) => [e.name, e.data]));
  const parts = sheetParts(files);
  const out: Array<{ sheet: string; charts: ChartView[] }> = [];
  for (const [sheet, part] of parts) {
    const sheetXml = files.get(part)?.toString('utf8') ?? '';
    const drawingRid = /<drawing\b[^>]*r:id="([^"]+)"/.exec(sheetXml)?.[1];
    if (!drawingRid) continue;
    const rels = files.get(part.replace(/([^/]+)$/, '_rels/$1.rels'))?.toString('utf8') ?? '';
    const drawingTarget = new RegExp(`Id="${drawingRid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${drawingRid}"`).exec(rels);
    const dt = drawingTarget?.[1] ?? drawingTarget?.[2];
    if (!dt) continue;
    const drawingPart = `xl/${dt.replace(/^\.\.\//, '')}`;
    const drawing = files.get(drawingPart)?.toString('utf8') ?? '';
    const dRels = files.get(drawingPart.replace(/([^/]+)$/, '_rels/$1.rels'))?.toString('utf8') ?? '';
    const charts: ChartView[] = [];
    for (const anchor of drawing.matchAll(/<xdr:twoCellAnchor\b[\s\S]*?<\/xdr:twoCellAnchor>/g)) {
      const col = Number(/<xdr:from><xdr:col>(\d+)<\/xdr:col>/.exec(anchor[0])?.[1] ?? 0);
      const row = Number(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(anchor[0])?.[1] ?? 0);
      const rid = /<c:chart\b[^>]*r:id="([^"]+)"/.exec(anchor[0])?.[1];
      const ct = rid ? (new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rid}"`).exec(dRels)) : null;
      const target = ct?.[1] ?? ct?.[2];
      if (!target) continue;
      const xml = files.get(`xl/${target.replace(/^\.\.\//, '')}`)?.toString('utf8');
      if (!xml) continue;
      const type: ChartType = /<c:pieChart/.test(xml) ? 'pie' : /<c:lineChart/.test(xml) ? 'line' : /<c:barDir val="bar"/.test(xml) ? 'bar' : 'column';
      const title = /<c:title>[\s\S]*?<a:t>([\s\S]*?)<\/a:t>/.exec(xml)?.[1];
      const series: ChartSpec['series'] = [];
      const data: ChartView['data'] = [];
      let labels: string[] = [];
      let categories = '';
      const colours: string[] = [];
      for (const s of xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)) {
        const name = unesc(/<c:tx>[\s\S]*?<c:v>([\s\S]*?)<\/c:v>/.exec(s[1])?.[1] ?? '');
        const catF = /<c:cat>[\s\S]*?<c:f>([\s\S]*?)<\/c:f>/.exec(s[1])?.[1] ?? '';
        const valBlock = /<c:val>([\s\S]*?)<\/c:val>/.exec(s[1])?.[1] ?? '';
        const valF = /<c:f>([\s\S]*?)<\/c:f>/.exec(valBlock)?.[1] ?? '';
        const catBlock = /<c:cat>([\s\S]*?)<\/c:cat>/.exec(s[1])?.[1] ?? '';
        labels = [...catBlock.matchAll(/<c:pt idx="(\d+)"><c:v>([\s\S]*?)<\/c:v><\/c:pt>/g)].map((m) => unesc(m[2]));
        const count = Number(/<c:ptCount val="(\d+)"/.exec(valBlock)?.[1] ?? 0);
        const values = Array.from({ length: count }, () => 0);
        for (const m of valBlock.matchAll(/<c:pt idx="(\d+)"><c:v>([^<]*)<\/c:v><\/c:pt>/g)) values[Number(m[1])] = Number(m[2]) || 0;
        const local = (f: string) => unesc(f).replace(/^.*!/, '').replace(/\$/g, '');
        categories = local(catF);
        if (type === 'pie') for (const d of s[1].matchAll(/<c:dPt>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/g)) colours.push(`#${d[1]}`);
        else { const c = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(s[1])?.[1]; if (c) colours.push(`#${c}`); }
        series.push({ name, values: local(valF) });
        data.push({ name, values });
      }
      charts.push({ type, title: title ? unesc(title) : undefined, categories, series, at: `${colLetter(col + 1)}${row + 1}`, labels, data, colours });
    }
    if (charts.length) out.push({ sheet, charts });
  }
  return out;
}
