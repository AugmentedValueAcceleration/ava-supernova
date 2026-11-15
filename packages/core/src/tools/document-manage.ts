import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { SpreadsheetContent, CsvContent } from './document-templates.js';
import { validatePath } from './security.js';
import { readPdfText, readDocxText, unreadable } from './authoring/read-office.js';
import { documentPathFor } from './authoring/document-places.js';
import { exportDocument, parseCsv } from './authoring/export-document.js';
import { buildWorkbook, updateCells, recalculate, type SheetSpec, type CellInput } from './authoring/spreadsheet.js';
import { loadHouseStyle } from './authoring/templates/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Spreadsheets and CSV — ONE job (14 Nov 2026).
 *
 * This tool used to make Word and PDF files too, with a second, simpler
 * engine than document_author's (it dropped bold, tables and callouts), and
 * it offered a ".docx edit" that rebuilt the file from plain text and threw
 * its formatting away. Prose documents now belong to document_author alone;
 * this tool makes and changes spreadsheets, and reads any document so Ava can
 * use what is in it.
 */
export class DocumentManageTool implements Tool {
  readonly name = 'document_manage';
  readonly description = 'Make and change spreadsheets (.xlsx) and CSV files; read any document (Word, PDF, spreadsheet, text).';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'document_manage',
    description:
      'Spreadsheets and CSV: create a spreadsheet (.xlsx) or CSV, add rows, change cells, read one, or export between them. '
      + 'Spreadsheets are real: give numbers as numbers, use formulas as text starting with "=" ("=B2*12", "=SUM(B2:B9)"), '
      + 'set a format per column (currency, percent, date, integer, number, text) and ask for a totals row — Ava works out the results so they read back correctly. '
      + 'Also reads the text of any document (.docx, .pdf, .md, .txt). '
      + 'For prose documents — reports, letters, proposals, Word or PDF files — use document_author instead. '
      + 'A bare file name ("budget.xlsx") is saved in the project\'s documents/ folder, where the Library shows it.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'edit', 'update_cells', 'read', 'export'],
          description: 'create (new spreadsheet / CSV) · edit (add rows; above a totals row, which keeps adding up) · update_cells (change cells by reference) · read (any document, formulas shown) · export (csv ↔ xlsx, or a CSV to ods / pdf / docx)',
        },
        file_path: { type: 'string', description: 'Path of the spreadsheet or document.' },
        content: {
          type: 'object',
          description: 'xlsx: { sheets: [{ name, headers, rows, columns?: [{ format?: "text"|"number"|"integer"|"currency"|"percent"|"date", currency?: "GBP"|"USD"|"EUR" }], totals?: { label?, columns: ["Monthly", …] (header names or letters) }, freeze?: true }] }. Dates as "2026-11-15". csv: { headers, rows }. edit: the rows to add, same shape.',
        },
        sheet: { type: 'string', description: 'update_cells: the sheet name (default: the first sheet).' },
        cells: { type: 'object', description: 'update_cells: cell references to values — { "B4": 950, "C7": "=SUM(C2:C6)", "A9": "Insurance" }.' },
        export_format: { type: 'string', enum: ['xlsx', 'csv', 'ods', 'pdf', 'docx'], description: 'export: the format to make.' },
        export_path: { type: 'string', description: 'export: where to write it (otherwise beside the source).' },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      switch (args.action) {
        case 'create': return await this.handleCreate(args, context);
        case 'edit': return await this.handleEdit(args, context);
        case 'update_cells': return await this.handleUpdateCells(args, context);
        case 'read': return await this.handleRead(args, context);
        case 'export': return await this.handleExport(args, context);
        default:
          return { success: false, output: `Unknown action: ${String(args.action)}. For Word or PDF documents use document_author.` };
      }
    } catch (e) {
      return { success: false, output: (e as Error).message };
    }
  }

  // ── Paths ──────────────────────────────────────────────────────────────────

  /** Inside the project only; a bare name for something NEW goes to documents/. */
  private target(given: string | undefined, cwd: string, isNew: boolean): string {
    if (!given) throw new Error('Missing required field: file_path');
    const direct = validatePath(given, cwd);
    if (/[\\/]/.test(given.trim())) return direct;
    const inDocs = validatePath(documentPathFor(given), cwd);
    if (isNew) return inDocs;
    return existsSync(direct) ? direct : inDocs;
  }

  private formatOf(path: string): string {
    return extname(path).toLowerCase().replace('.', '');
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  private async handleCreate(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const fullPath = this.target(args.file_path as string | undefined, context.cwd, true);
    const format = this.formatOf(fullPath);
    if (format !== 'xlsx' && format !== 'csv') {
      return { success: false, output: `document_manage makes spreadsheets (.xlsx) and CSV files. For a ${format ? `.${format}` : ''} document use document_author.` };
    }
    if (existsSync(fullPath)) return { success: false, output: `File already exists: ${fullPath}. Use edit to add rows.` };
    await mkdir(dirname(fullPath), { recursive: true });
    const content = args.content as Record<string, unknown> | undefined;
    return format === 'csv'
      ? this.createCsv(fullPath, content as unknown as CsvContent)
      : this.createXlsx(fullPath, content as unknown as SpreadsheetContent);
  }

  // ── Edit (add rows) ──────────────────────────────────────────────────────────

  private async handleEdit(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const fullPath = this.target(args.file_path as string | undefined, context.cwd, false);
    if (!existsSync(fullPath)) return { success: false, output: `File not found: ${fullPath}` };
    const format = this.formatOf(fullPath);
    const content = args.content as Record<string, unknown> | undefined;
    if (format === 'csv') return this.editCsv(fullPath, content as unknown as CsvContent);
    if (format === 'xlsx') return this.editXlsx(fullPath, content as unknown as SpreadsheetContent);
    return { success: false, output: `document_manage edits spreadsheets and CSV files. To change a ${format} document use document_author (edit_section).` };
  }

  // ── Read (any document) ──────────────────────────────────────────────────────

  private async handleRead(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const fullPath = this.target(args.file_path as string | undefined, context.cwd, false);
    if (!existsSync(fullPath)) return { success: false, output: `File not found: ${fullPath}` };
    const format = this.formatOf(fullPath);
    switch (format) {
      case 'csv': return this.readCsv(fullPath);
      case 'xlsx': return this.readXlsx(fullPath);
      case 'docx':
        try {
          const r = await readDocxText(fullPath);
          return { success: true, output: `Word document: ${fullPath}\n\n${r.text.slice(0, 6000)}${r.text.length > 6000 ? '\n… truncated' : ''}` };
        } catch (e) { return { success: false, output: unreadable('Word', fullPath, e) }; }
      case 'pdf':
        try {
          const r = await readPdfText(await readFile(fullPath));
          return { success: true, output: `PDF: ${fullPath}${r.pages ? ` (${r.pages} pages)` : ''}\n\n${r.text.slice(0, 6000)}${r.text.length > 6000 ? '\n… truncated' : ''}` };
        } catch (e) { return { success: false, output: unreadable('PDF', fullPath, e) }; }
      default: {
        const raw = await readFile(fullPath, 'utf-8');
        return { success: true, output: `${fullPath}\n\n${raw.slice(0, 6000)}${raw.length > 6000 ? '\n… truncated' : ''}` };
      }
    }
  }

  // ── Export ───────────────────────────────────────────────────────────────────

  private async handleExport(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const fullPath = this.target(args.file_path as string | undefined, context.cwd, false);
    if (!existsSync(fullPath)) return { success: false, output: `File not found: ${fullPath}` };
    const to = String(args.export_format ?? '');
    if (!to) return { success: false, output: 'Missing required field: export_format' };
    const from = this.formatOf(fullPath);
    const outPath = args.export_path
      ? validatePath(args.export_path as string, context.cwd)
      : fullPath.replace(new RegExp(`\\.${from}$`, 'i'), `.${to}`);
    await mkdir(dirname(outPath), { recursive: true });

    if (from === 'csv' && to === 'xlsx') {
      const { headers, rows } = parseCsv(await readFile(fullPath, 'utf-8'));
      const r = await this.createXlsx(outPath, { sheets: [{ name: 'Sheet1', headers, rows }] });
      return r.success ? { success: true, output: `Exported ${fullPath} → ${outPath} (csv → xlsx)` } : r;
    }
    if (from === 'xlsx' && to === 'csv') {
      const sheets = await this.xlsxSheets(fullPath);
      const first = sheets[0] ?? { name: 'Sheet1', headers: [], rows: [] };
      const r = await this.createCsv(outPath, { headers: first.headers, rows: first.rows });
      const note = sheets.length > 1 ? ` Only the first sheet (${first.name}) — a CSV holds one table.` : '';
      return r.success ? { success: true, output: `Exported ${fullPath} → ${outPath} (xlsx → csv).${note}` } : r;
    }
    if (from === 'csv' && (to === 'ods' || to === 'pdf' || to === 'docx')) {
      const r = await exportDocument({
        sourcePath: fullPath, format: to, outPath,
        loadDocx: () => import('docx'),
        // @ts-expect-error — pdfkit is an optional peer (types may be absent)
        loadPdf: () => import('pdfkit'),
      });
      return r.ok ? { success: true, output: `Exported ${fullPath} → ${r.path} (csv → ${to})` } : { success: false, output: r.error };
    }
    return { success: false, output: `Export from ${from} to ${to} is not supported here. Spreadsheets: csv ↔ xlsx, or a CSV to ods / pdf / docx. Prose documents export with document_author build.` };
  }

  // ── CSV ──────────────────────────────────────────────────────────────────────

  private async createCsv(filePath: string, content?: CsvContent): Promise<ToolResult> {
    const headers = content?.headers ?? [];
    const rows = content?.rows ?? [];
    const lines = [headers.map((h) => this.csvEscape(String(h))).join(',')];
    for (const row of rows) lines.push(row.map((cell) => this.csvEscape(String(cell ?? ''))).join(','));
    await writeFile(filePath, lines.join('\n') + '\n', 'utf-8');
    return { success: true, output: `Created CSV: ${filePath} (${rows.length} rows, ${headers.length} columns)` };
  }

  private async readCsv(filePath: string): Promise<ToolResult> {
    const parsed = parseCsv(await readFile(filePath, 'utf-8'));
    const lines = [parsed.headers.join(' | '), parsed.headers.map(() => '---').join(' | ')];
    for (const row of parsed.rows.slice(0, 200)) lines.push(row.join(' | '));
    const more = parsed.rows.length > 200 ? `\n… and ${parsed.rows.length - 200} more rows` : '';
    return { success: true, output: `CSV: ${filePath} (${parsed.rows.length} rows)\n\n${lines.join('\n')}${more}` };
  }

  private async editCsv(filePath: string, content?: CsvContent): Promise<ToolResult> {
    if (!content?.rows?.length) return { success: false, output: 'Nothing to add. Provide { rows: [[…], …] }.' };
    const existing = await readFile(filePath, 'utf-8');
    const added = content.rows.map((row) => row.map((cell) => this.csvEscape(String(cell ?? ''))).join(','));
    await writeFile(filePath, existing.replace(/\s+$/, '') + '\n' + added.join('\n') + '\n', 'utf-8');
    return { success: true, output: `Added ${added.length} rows to ${filePath}` };
  }

  private csvEscape(value: string): string {
    return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }

  // ── XLSX ─────────────────────────────────────────────────────────────────────

  private async loadExcel(): Promise<any> {
    try {
      const mod: any = await import('exceljs');
      return mod.default?.Workbook ? mod.default : mod;
    } catch {
      throw new Error('Spreadsheets cannot be made in this build of Ava. Please report it on our Discord.');
    }
  }

  private async createXlsx(filePath: string, content?: SpreadsheetContent): Promise<ToolResult> {
    const ExcelJS = await this.loadExcel();
    const specs = (content?.sheets ?? []) as unknown as SheetSpec[];
    const { workbook, calculated, left } = buildWorkbook(ExcelJS, specs, await loadHouseStyle());
    await workbook.xlsx.writeFile(filePath);
    const rows = specs.reduce((n, s) => n + (s.rows?.length ?? 0), 0);
    const sheets = Math.max(1, specs.length);
    const notes = [
      calculated ? `${calculated} formula${calculated === 1 ? '' : 's'} worked out` : '',
      left ? `${left} left for the spreadsheet app to calculate on opening` : '',
    ].filter(Boolean).join('; ');
    return { success: true, output: `Created spreadsheet: ${filePath} (${sheets} sheet${sheets === 1 ? '' : 's'}, ${rows} rows${notes ? `; ${notes}` : ''})` };
  }

  private async xlsxSheets(filePath: string): Promise<Array<{ name: string; headers: string[]; rows: string[][] }>> {
    const ExcelJS = await this.loadExcel();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const out: Array<{ name: string; headers: string[]; rows: string[][] }> = [];
    workbook.eachSheet((sheet: any) => {
      const rows: string[][] = [];
      sheet.eachRow({ includeEmpty: false }, (row: any) => {
        rows.push((row.values as any[]).slice(1).map((v: any) => this.cellText(v)));
      });
      out.push({ name: sheet.name, headers: rows[0] ?? [], rows: rows.slice(1) });
    });
    return out;
  }

  /** A cell as text: a formula shows its result and the formula itself. */
  private cellText(v: any): string {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object') {
      if ('formula' in v) return `${v.result ?? ''} (=${v.formula})`;
      if ('richText' in v) return (v.richText as Array<{ text: string }>).map((t) => t.text).join('');
      if ('text' in v) return String(v.text);
    }
    return String(v);
  }

  private async readXlsx(filePath: string): Promise<ToolResult> {
    const sheets = await this.xlsxSheets(filePath);
    const parts = sheets.map((s) => {
      const lines = [s.headers.join(' | '), s.headers.map(() => '---').join(' | '), ...s.rows.slice(0, 200).map((r) => r.join(' | '))];
      const more = s.rows.length > 200 ? `\n… and ${s.rows.length - 200} more rows` : '';
      return `### ${s.name}\n${lines.join('\n')}${more}`;
    });
    return { success: true, output: `Spreadsheet: ${filePath}\n\n${parts.join('\n\n')}` };
  }

  private async editXlsx(filePath: string, content?: SpreadsheetContent): Promise<ToolResult> {
    const ExcelJS = await this.loadExcel();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    let added = 0;
    for (const sheet of content?.sheets ?? []) {
      const ws = workbook.getWorksheet(sheet.name) ?? workbook.addWorksheet(sheet.name);
      const rows = (sheet.rows ?? []) as CellInput[][];
      if (!rows.length) continue;
      const total = this.totalsRow(ws);
      if (total) {
        // Insert above the totals and stretch each SUM over the new rows.
        ws.spliceRows(total.row, 0, ...rows.map((r) => r.map((v) => (typeof v === 'string' && v.startsWith('=') ? { formula: v.slice(1) } : v))));
        const tr = ws.getRow(total.row + rows.length);
        tr.eachCell((cell: any) => {
          const v = cell.value;
          if (v && typeof v === 'object' && 'formula' in v) {
            cell.value = { formula: String(v.formula).replace(/^(SUM\([A-Z]{1,3}\d+:[A-Z]{1,3})(\d+)\)$/i, (_m: string, head: string, end: string) => `${head}${Number(end) + rows.length})`) };
          }
        });
        // Carry the column formats down onto the new rows.
        const model = ws.getRow(Math.max(2, total.row - 1));
        for (let r = total.row; r < total.row + rows.length; r++) {
          ws.getRow(r).eachCell({ includeEmpty: true }, (cell: any, c: number) => { const f = model.getCell(c).numFmt; if (f) cell.numFmt = f; });
        }
      } else {
        for (const row of rows) ws.addRow(row.map((v) => (typeof v === 'string' && v.startsWith('=') ? { formula: v.slice(1) } : v)));
      }
      recalculate(ws);
      added += rows.length;
    }
    if (!added) return { success: false, output: 'Nothing to add. Provide { sheets: [{ name, rows }] }.' };
    await workbook.xlsx.writeFile(filePath);
    return { success: true, output: `Updated spreadsheet: ${filePath} (added ${added} rows)` };
  }

  /** The last row, when it is a totals row (a SUM down to the row above). */
  private totalsRow(ws: any): { row: number } | null {
    const last = ws.rowCount;
    if (last < 2) return null;
    let isTotal = false;
    ws.getRow(last).eachCell((cell: any) => {
      const v = cell.value;
      if (v && typeof v === 'object' && 'formula' in v && new RegExp(`^SUM\\([A-Z]{1,3}\\d+:[A-Z]{1,3}${last - 1}\\)$`, 'i').test(String(v.formula))) isTotal = true;
    });
    return isTotal ? { row: last } : null;
  }

  // ── Update cells ─────────────────────────────────────────────────────────────

  private async handleUpdateCells(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const fullPath = this.target(args.file_path as string | undefined, context.cwd, false);
    if (!existsSync(fullPath)) return { success: false, output: `File not found: ${fullPath}` };
    if (this.formatOf(fullPath) !== 'xlsx') return { success: false, output: 'update_cells changes .xlsx spreadsheets. For a CSV, use edit to add rows.' };
    const cells = args.cells as Record<string, CellInput> | undefined;
    if (!cells || !Object.keys(cells).length) return { success: false, output: 'Nothing to change. Provide cells: { "B4": 950 }.' };
    const ExcelJS = await this.loadExcel();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(fullPath);
    const ws = args.sheet ? workbook.getWorksheet(String(args.sheet)) : workbook.worksheets[0];
    if (!ws) return { success: false, output: `No sheet called ${String(args.sheet)}.` };
    const changed = updateCells(ws, cells);
    await workbook.xlsx.writeFile(fullPath);
    return { success: true, output: `Updated ${changed.join(', ')} on ${ws.name} in ${fullPath}; formulas recalculated.` };
  }
}
