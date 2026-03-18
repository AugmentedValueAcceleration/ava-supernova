import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { TEMPLATES, getTemplate } from './document-templates.js';
import type { DocumentContent, SpreadsheetContent, CsvContent, TemplateName } from './document-templates.js';

export class DocumentManageTool implements Tool {
  readonly name = 'document_manage';
  readonly description = 'Create, read, edit, and export documents (Word, Excel, PDF, CSV, Markdown)';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'document_manage',
    description:
      'Create, read, edit, and export documents. Supports Word (.docx), Excel (.xlsx), PDF (.pdf), CSV (.csv), and Markdown (.md). ' +
      'Use templates for common document types. Optional dependencies: npm install docx exceljs pdfkit for full format support. ' +
      'CSV and Markdown work with no extra dependencies.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'edit', 'read', 'export', 'list_templates', 'from_template'],
          description: 'The action to perform',
        },
        file_path: {
          type: 'string',
          description: 'Path for the document (required for create, edit, read, export)',
        },
        format: {
          type: 'string',
          enum: ['docx', 'xlsx', 'pdf', 'csv', 'md'],
          description: 'Document format (auto-detected from file extension if not specified)',
        },
        content: {
          type: 'object',
          description: 'Structured content. For docs: { title?, sections: [{ heading?, text?, list?, table?: { headers, rows } }] }. For csv: { headers, rows }. For xlsx: { sheets: [{ name, headers, rows }] }',
        },
        template: {
          type: 'string',
          enum: [...TEMPLATES],
          description: 'Template name for from_template action',
        },
        template_data: {
          type: 'object',
          description: 'Data to fill the template with',
        },
        export_format: {
          type: 'string',
          enum: ['docx', 'xlsx', 'pdf', 'csv', 'md'],
          description: 'Target format for export action',
        },
        export_path: {
          type: 'string',
          description: 'Output path for export action',
        },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const action = args.action as string;

    switch (action) {
      case 'create': return this.handleCreate(args, context);
      case 'edit': return this.handleEdit(args, context);
      case 'read': return this.handleRead(args, context);
      case 'export': return this.handleExport(args, context);
      case 'list_templates': return this.handleListTemplates();
      case 'from_template': return this.handleFromTemplate(args, context);
      default:
        return { success: false, output: `Unknown action: ${action}` };
    }
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  private async handleCreate(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string | undefined;
    if (!filePath) return { success: false, output: 'Missing required field: file_path' };

    const format = this.detectFormat(filePath, args.format as string | undefined);
    if (!format) return { success: false, output: 'Cannot determine format. Specify format or use a known extension (.docx, .xlsx, .pdf, .csv, .md)' };

    const content = args.content as Record<string, unknown> | undefined;
    const fullPath = this.resolvePath(filePath, context.cwd);

    await mkdir(dirname(fullPath), { recursive: true });

    switch (format) {
      case 'csv': return this.createCsv(fullPath, content as unknown as CsvContent);
      case 'md': return this.createMarkdown(fullPath, content as unknown as DocumentContent);
      case 'docx': return this.createDocx(fullPath, content as unknown as DocumentContent);
      case 'xlsx': return this.createXlsx(fullPath, content as unknown as SpreadsheetContent);
      case 'pdf': return this.createPdf(fullPath, content as unknown as DocumentContent);
      default: return { success: false, output: `Unsupported format: ${format}` };
    }
  }

  // ── Edit ───────────────────────────────────────────────────────────────────

  private async handleEdit(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string | undefined;
    if (!filePath) return { success: false, output: 'Missing required field: file_path' };

    const fullPath = this.resolvePath(filePath, context.cwd);
    if (!existsSync(fullPath)) return { success: false, output: `File not found: ${filePath}` };

    const format = this.detectFormat(filePath, args.format as string | undefined);
    const content = args.content as Record<string, unknown> | undefined;

    switch (format) {
      case 'csv': return this.editCsv(fullPath, content as unknown as CsvContent);
      case 'md': return this.editMarkdown(fullPath, content as unknown as DocumentContent);
      case 'docx': return this.editDocx(fullPath, content as unknown as DocumentContent);
      case 'xlsx': return this.editXlsx(fullPath, content as unknown as SpreadsheetContent);
      case 'pdf': return { success: false, output: 'PDFs cannot be edited directly. Recreate the document or edit the source format.' };
      default: return { success: false, output: `Unsupported format for editing: ${format}` };
    }
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  private async handleRead(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string | undefined;
    if (!filePath) return { success: false, output: 'Missing required field: file_path' };

    const fullPath = this.resolvePath(filePath, context.cwd);
    if (!existsSync(fullPath)) return { success: false, output: `File not found: ${filePath}` };

    const format = this.detectFormat(filePath, args.format as string | undefined);

    switch (format) {
      case 'csv': return this.readCsv(fullPath);
      case 'md': return this.readMarkdown(fullPath);
      case 'docx': return this.readDocx(fullPath);
      case 'xlsx': return this.readXlsx(fullPath);
      case 'pdf': return this.readPdf(fullPath);
      default: return { success: false, output: `Unsupported format for reading: ${format}` };
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  private async handleExport(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string | undefined;
    const exportFormat = args.export_format as string | undefined;
    const exportPath = args.export_path as string | undefined;

    if (!filePath) return { success: false, output: 'Missing required field: file_path' };
    if (!exportFormat) return { success: false, output: 'Missing required field: export_format' };

    const fullPath = this.resolvePath(filePath, context.cwd);
    if (!existsSync(fullPath)) return { success: false, output: `File not found: ${filePath}` };

    const sourceFormat = this.detectFormat(filePath);
    const outPath = exportPath
      ? this.resolvePath(exportPath, context.cwd)
      : fullPath.replace(new RegExp(`\\.${sourceFormat}$`), `.${exportFormat}`);

    await mkdir(dirname(outPath), { recursive: true });

    // Read source content
    const readResult = await this.handleRead({ file_path: filePath, format: sourceFormat }, context);
    if (!readResult.success) return readResult;

    // For MD→DOCX, MD→PDF, CSV→XLSX: parse the source and create in target format
    if (sourceFormat === 'md' && (exportFormat === 'docx' || exportFormat === 'pdf')) {
      const raw = await readFile(fullPath, 'utf-8');
      const content = this.markdownToContent(raw);
      const createResult = exportFormat === 'docx'
        ? await this.createDocx(outPath, content)
        : await this.createPdf(outPath, content);
      if (createResult.success) {
        return { success: true, output: `Exported ${filePath} → ${outPath} (${sourceFormat} → ${exportFormat})` };
      }
      return createResult;
    }

    if (sourceFormat === 'csv' && exportFormat === 'xlsx') {
      const raw = await readFile(fullPath, 'utf-8');
      const csvContent = this.parseCsvString(raw);
      const xlsxContent: SpreadsheetContent = {
        sheets: [{ name: 'Sheet1', headers: csvContent.headers, rows: csvContent.rows }],
      };
      const createResult = await this.createXlsx(outPath, xlsxContent);
      if (createResult.success) {
        return { success: true, output: `Exported ${filePath} → ${outPath} (csv → xlsx)` };
      }
      return createResult;
    }

    if (exportFormat === 'md') {
      // Any → Markdown: use the read output as content
      await writeFile(outPath, readResult.output, 'utf-8');
      return { success: true, output: `Exported ${filePath} → ${outPath} (${sourceFormat} → md)` };
    }

    return { success: false, output: `Export from ${sourceFormat} to ${exportFormat} is not supported.` };
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  private handleListTemplates(): ToolResult {
    const lines = TEMPLATES.map(t => `- **${t}**`);
    return {
      success: true,
      output: `Available templates:\n${lines.join('\n')}\n\nUse action "from_template" with template name and optional template_data to create a document.`,
    };
  }

  private async handleFromTemplate(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const template = args.template as string | undefined;
    if (!template || !TEMPLATES.includes(template as TemplateName)) {
      return { success: false, output: `Invalid template. Available: ${TEMPLATES.join(', ')}` };
    }

    const filePath = args.file_path as string | undefined;
    if (!filePath) return { success: false, output: 'Missing required field: file_path' };

    const format = this.detectFormat(filePath, args.format as string | undefined) ?? 'md';
    const templateData = args.template_data as Record<string, unknown> | undefined;
    const content = getTemplate(template as TemplateName, templateData);

    const fullPath = this.resolvePath(filePath, context.cwd);
    await mkdir(dirname(fullPath), { recursive: true });

    switch (format) {
      case 'md': return this.createMarkdown(fullPath, content);
      case 'csv': {
        // Convert first table in template to CSV
        const table = content.sections.find(s => s.table)?.table;
        if (table) {
          return this.createCsv(fullPath, { headers: table.headers, rows: table.rows });
        }
        return { success: false, output: 'Template has no table data for CSV format.' };
      }
      case 'docx': return this.createDocx(fullPath, content);
      case 'xlsx': {
        const table = content.sections.find(s => s.table)?.table;
        if (table) {
          return this.createXlsx(fullPath, { sheets: [{ name: 'Sheet1', headers: table.headers, rows: table.rows }] });
        }
        return { success: false, output: 'Template has no table data for XLSX format.' };
      }
      case 'pdf': return this.createPdf(fullPath, content);
      default: return { success: false, output: `Unsupported format for template: ${format}` };
    }
  }

  // ── CSV (native) ───────────────────────────────────────────────────────────

  private async createCsv(filePath: string, content?: CsvContent): Promise<ToolResult> {
    const headers = content?.headers ?? [];
    const rows = content?.rows ?? [];
    const lines = [headers.map(h => this.csvEscape(h)).join(',')];
    for (const row of rows) {
      lines.push(row.map(cell => this.csvEscape(String(cell))).join(','));
    }
    await writeFile(filePath, lines.join('\n'), 'utf-8');
    return { success: true, output: `Created CSV: ${filePath} (${rows.length} rows, ${headers.length} columns)` };
  }

  private async readCsv(filePath: string): Promise<ToolResult> {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = this.parseCsvString(raw);
    const lines = [parsed.headers.join(' | ')];
    lines.push(parsed.headers.map(() => '---').join(' | '));
    for (const row of parsed.rows.slice(0, 50)) {
      lines.push(row.join(' | '));
    }
    const truncated = parsed.rows.length > 50 ? `\n... and ${parsed.rows.length - 50} more rows` : '';
    return { success: true, output: `CSV: ${filePath} (${parsed.rows.length} rows)\n\n${lines.join('\n')}${truncated}` };
  }

  private async editCsv(filePath: string, content?: CsvContent): Promise<ToolResult> {
    if (!content) return { success: false, output: 'Missing content for edit. Provide { headers, rows } to append.' };
    const existing = await readFile(filePath, 'utf-8');
    const newRows = (content.rows ?? []).map(row => row.map(cell => this.csvEscape(String(cell))).join(','));
    const updated = existing.trimEnd() + '\n' + newRows.join('\n');
    await writeFile(filePath, updated, 'utf-8');
    return { success: true, output: `Appended ${newRows.length} rows to ${filePath}` };
  }

  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private parseCsvString(raw: string): CsvContent {
    const lines = raw.trim().split('\n');
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = this.parseCsvLine(lines[0]);
    const rows = lines.slice(1).map(l => this.parseCsvLine(l));
    return { headers, rows };
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { result.push(current); current = ''; }
        else { current += ch; }
      }
    }
    result.push(current);
    return result;
  }

  // ── Markdown (native) ──────────────────────────────────────────────────────

  private async createMarkdown(filePath: string, content?: DocumentContent): Promise<ToolResult> {
    const lines: string[] = [];
    if (content?.title) lines.push(`# ${content.title}`, '');

    for (const section of content?.sections ?? []) {
      if (section.heading) lines.push(`## ${section.heading}`, '');
      if (section.text) lines.push(section.text, '');
      if (section.list) {
        for (const item of section.list) lines.push(`- ${item}`);
        lines.push('');
      }
      if (section.table) {
        lines.push(`| ${section.table.headers.join(' | ')} |`);
        lines.push(`| ${section.table.headers.map(() => '---').join(' | ')} |`);
        for (const row of section.table.rows) {
          lines.push(`| ${row.join(' | ')} |`);
        }
        lines.push('');
      }
    }

    await writeFile(filePath, lines.join('\n'), 'utf-8');
    const sectionCount = content?.sections?.length ?? 0;
    return { success: true, output: `Created Markdown: ${filePath} (${sectionCount} sections)` };
  }

  private async readMarkdown(filePath: string): Promise<ToolResult> {
    const raw = await readFile(filePath, 'utf-8');
    const lineCount = raw.split('\n').length;
    return { success: true, output: `Markdown: ${filePath} (${lineCount} lines)\n\n${raw.slice(0, 3000)}${raw.length > 3000 ? '\n... truncated' : ''}` };
  }

  private async editMarkdown(filePath: string, content?: DocumentContent): Promise<ToolResult> {
    if (!content) return { success: false, output: 'Missing content for edit.' };
    const existing = await readFile(filePath, 'utf-8');
    const newContent: string[] = [];
    for (const section of content.sections ?? []) {
      if (section.heading) newContent.push(`\n## ${section.heading}\n`);
      if (section.text) newContent.push(section.text);
      if (section.list) newContent.push(...section.list.map(i => `- ${i}`));
    }
    await writeFile(filePath, existing.trimEnd() + '\n' + newContent.join('\n') + '\n', 'utf-8');
    return { success: true, output: `Appended ${content.sections.length} sections to ${filePath}` };
  }

  private markdownToContent(raw: string): DocumentContent {
    const lines = raw.split('\n');
    let title: string | undefined;
    const sections: DocumentContent['sections'] = [];
    let current: DocumentContent['sections'][0] = {};

    for (const line of lines) {
      if (line.startsWith('# ') && !title) {
        title = line.slice(2).trim();
      } else if (line.startsWith('## ')) {
        if (current.heading || current.text) sections.push(current);
        current = { heading: line.slice(3).trim() };
      } else if (line.startsWith('- ')) {
        if (!current.list) current.list = [];
        current.list.push(line.slice(2).trim());
      } else if (line.trim()) {
        current.text = (current.text ? current.text + '\n' : '') + line;
      }
    }
    if (current.heading || current.text || current.list) sections.push(current);

    return { title, sections };
  }

  // ── DOCX (optional: docx package) ──────────────────────────────────────────

  private async createDocx(filePath: string, content?: DocumentContent): Promise<ToolResult> {
    let docx: any;
    try {
      // @ts-ignore — docx is an optional peer dependency
      docx = await import('docx');
    } catch {
      return { success: false, output: 'docx package is not installed. Install it with: npm install docx' };
    }

    const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = docx;

    const children: any[] = [];

    if (content?.title) {
      children.push(new Paragraph({ children: [new TextRun({ text: content.title, bold: true, size: 32 })], heading: HeadingLevel.TITLE }));
    }

    for (const section of content?.sections ?? []) {
      if (section.heading) {
        children.push(new Paragraph({ children: [new TextRun({ text: section.heading, bold: true, size: 26 })], heading: HeadingLevel.HEADING_1, spacing: { before: 240 } }));
      }
      if (section.text) {
        for (const para of section.text.split('\n')) {
          children.push(new Paragraph({ children: [new TextRun({ text: para })] }));
        }
      }
      if (section.list) {
        for (const item of section.list) {
          children.push(new Paragraph({ children: [new TextRun({ text: item })], bullet: { level: 0 } }));
        }
      }
      if (section.table) {
        const headerRow = new TableRow({
          children: section.table.headers.map((h: string) =>
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })], width: { size: 100 / section.table!.headers.length, type: WidthType.PERCENTAGE } })
          ),
        });
        const dataRows = section.table.rows.map((row: string[]) =>
          new TableRow({
            children: row.map((cell: string) =>
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cell })] })], width: { size: 100 / section.table!.headers.length, type: WidthType.PERCENTAGE } })
            ),
          })
        );
        children.push(new Table({
          rows: [headerRow, ...dataRows],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }));
      }
    }

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);
    await writeFile(filePath, buffer);
    return { success: true, output: `Created Word document: ${filePath} (${content?.sections?.length ?? 0} sections)` };
  }

  private async readDocx(filePath: string): Promise<ToolResult> {
    let mammoth: any;
    try {
      // @ts-ignore — mammoth is an optional peer dependency for reading docx
      mammoth = await import('mammoth');
    } catch {
      // Fallback: just report file exists
      const raw = await readFile(filePath);
      return { success: true, output: `Word document: ${filePath} (${raw.length} bytes). Install mammoth for text extraction: npm install mammoth` };
    }

    const result = await mammoth.extractRawText({ path: filePath });
    return { success: true, output: `Word document: ${filePath}\n\n${result.value.slice(0, 3000)}${result.value.length > 3000 ? '\n... truncated' : ''}` };
  }

  private async editDocx(filePath: string, content?: DocumentContent): Promise<ToolResult> {
    // For DOCX editing, we read the existing content, append new sections, and recreate
    // This is a limitation of the docx library — it's primarily a creation library
    const readResult = await this.readDocx(filePath);
    if (!readResult.success) return readResult;

    // Parse existing text into content structure
    const existingContent = this.markdownToContent(readResult.output);

    // Merge new sections
    const merged: DocumentContent = {
      title: existingContent.title,
      sections: [...existingContent.sections, ...(content?.sections ?? [])],
    };

    return this.createDocx(filePath, merged);
  }

  // ── XLSX (optional: exceljs package) ───────────────────────────────────────

  private async createXlsx(filePath: string, content?: SpreadsheetContent): Promise<ToolResult> {
    let ExcelJS: any;
    try {
      // @ts-ignore — exceljs is an optional peer dependency
      ExcelJS = await import('exceljs');
    } catch {
      return { success: false, output: 'exceljs package is not installed. Install it with: npm install exceljs' };
    }

    const workbook = new (ExcelJS.default?.Workbook || ExcelJS.Workbook)();
    let totalRows = 0;

    // If no structured content provided, try to parse plain text content from args
    const sheets = content?.sheets ?? this.parseTextToSheets(content as unknown as string);

    for (const sheet of sheets) {
      const ws = workbook.addWorksheet(sheet.name);
      if (sheet.headers.length > 0) {
        const headerRow = ws.addRow(sheet.headers);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.eachCell((cell: any) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
          cell.border = {
            bottom: { style: 'thin', color: { argb: 'FF2F5496' } },
          };
        });
      }
      for (const row of sheet.rows) {
        ws.addRow(row);
        totalRows++;
      }
      // Auto-width columns based on content
      ws.columns?.forEach((col: any) => {
        if (!col) return;
        let maxLen = 10;
        col.eachCell?.({ includeEmpty: false }, (cell: any) => {
          const len = String(cell.value ?? '').length;
          if (len > maxLen) maxLen = len;
        });
        col.width = Math.min(maxLen + 2, 50);
      });
    }

    await workbook.xlsx.writeFile(filePath);
    return { success: true, output: `Created spreadsheet: ${filePath} (${content?.sheets?.length ?? 1} sheets, ${totalRows} rows)` };
  }

  private async readXlsx(filePath: string): Promise<ToolResult> {
    let ExcelJS: any;
    try {
      // @ts-ignore — exceljs is an optional peer dependency
      ExcelJS = await import('exceljs');
    } catch {
      return { success: false, output: 'exceljs package is not installed. Install it with: npm install exceljs' };
    }

    const workbook = new (ExcelJS.default?.Workbook || ExcelJS.Workbook)();
    await workbook.xlsx.readFile(filePath);

    const parts: string[] = [];
    workbook.eachSheet((sheet: any) => {
      parts.push(`### ${sheet.name}`);
      const rows: string[] = [];
      sheet.eachRow({ includeEmpty: false }, (row: any, rowNum: number) => {
        const values = row.values as any[];
        // Row values are 1-indexed, skip index 0
        const cells = values.slice(1).map((v: any) => String(v ?? ''));
        if (rowNum === 1) {
          rows.push(cells.join(' | '));
          rows.push(cells.map(() => '---').join(' | '));
        } else {
          rows.push(cells.join(' | '));
        }
      });
      parts.push(rows.join('\n'));
    });

    return { success: true, output: `Spreadsheet: ${filePath}\n\n${parts.join('\n\n')}` };
  }

  private async editXlsx(filePath: string, content?: SpreadsheetContent): Promise<ToolResult> {
    let ExcelJS: any;
    try {
      // @ts-ignore — exceljs is an optional peer dependency
      ExcelJS = await import('exceljs');
    } catch {
      return { success: false, output: 'exceljs package is not installed. Install it with: npm install exceljs' };
    }

    const workbook = new (ExcelJS.default?.Workbook || ExcelJS.Workbook)();
    await workbook.xlsx.readFile(filePath);

    let addedRows = 0;
    for (const sheet of content?.sheets ?? []) {
      let ws = workbook.getWorksheet(sheet.name);
      if (!ws) ws = workbook.addWorksheet(sheet.name);
      for (const row of sheet.rows) {
        ws.addRow(row);
        addedRows++;
      }
    }

    await workbook.xlsx.writeFile(filePath);
    return { success: true, output: `Updated spreadsheet: ${filePath} (added ${addedRows} rows)` };
  }

  // ── PDF (optional: pdfkit + pdf-parse) ─────────────────────────────────────

  private async createPdf(filePath: string, content?: DocumentContent): Promise<ToolResult> {
    let PDFDocument: any;
    try {
      // @ts-ignore — pdfkit is an optional peer dependency
      const pdfkit = await import('pdfkit');
      PDFDocument = pdfkit.default || pdfkit;
    } catch {
      return { success: false, output: 'pdfkit package is not installed. Install it with: npm install pdfkit' };
    }

    return new Promise<ToolResult>((resolve) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        await writeFile(filePath, buffer);
        resolve({ success: true, output: `Created PDF: ${filePath} (${content?.sections?.length ?? 0} sections)` });
      });

      if (content?.title) {
        doc.fontSize(24).font('Helvetica-Bold').text(content.title);
        doc.moveDown();
      }

      for (const section of content?.sections ?? []) {
        if (section.heading) {
          doc.fontSize(16).font('Helvetica-Bold').text(section.heading);
          doc.moveDown(0.5);
        }
        if (section.text) {
          doc.fontSize(11).font('Helvetica').text(section.text);
          doc.moveDown(0.5);
        }
        if (section.list) {
          doc.fontSize(11).font('Helvetica');
          for (const item of section.list) {
            doc.text(`  •  ${item}`);
          }
          doc.moveDown(0.5);
        }
        if (section.table) {
          doc.fontSize(10).font('Helvetica-Bold');
          doc.text(section.table.headers.join('    |    '));
          doc.font('Helvetica');
          for (const row of section.table.rows) {
            doc.text(row.join('    |    '));
          }
          doc.moveDown(0.5);
        }
      }

      doc.end();
    });
  }

  private async readPdf(filePath: string): Promise<ToolResult> {
    let pdfParse: any;
    try {
      // @ts-ignore — pdf-parse is an optional peer dependency
      const mod = await import('pdf-parse') as any;
      pdfParse = mod.default || mod;
    } catch {
      const raw = await readFile(filePath);
      return { success: true, output: `PDF: ${filePath} (${raw.length} bytes). Install pdf-parse for text extraction: npm install pdf-parse` };
    }

    const buffer = await readFile(filePath);
    const data = await pdfParse(buffer);
    return { success: true, output: `PDF: ${filePath} (${data.numpages} pages)\n\n${data.text.slice(0, 3000)}${data.text.length > 3000 ? '\n... truncated' : ''}` };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private detectFormat(filePath: string, explicit?: string): string | null {
    if (explicit) return explicit;
    const ext = extname(filePath).toLowerCase().replace('.', '');
    if (['docx', 'xlsx', 'pdf', 'csv', 'md'].includes(ext)) return ext;
    if (ext === 'markdown') return 'md';
    return null;
  }

  private resolvePath(filePath: string, cwd: string): string {
    if (filePath.startsWith('/') || /^[A-Za-z]:/.test(filePath)) return filePath;
    return `${cwd}/${filePath}`;
  }

  /**
   * Parse plain text content into spreadsheet sheets.
   * Splits by newlines for rows and commas/tabs for columns.
   * First row is treated as headers.
   */
  private parseTextToSheets(rawContent: unknown): Array<{ name: string; headers: string[]; rows: string[][] }> {
    if (typeof rawContent === 'string' && rawContent.trim()) {
      const lines = rawContent.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return [{ name: 'Sheet1', headers: [], rows: [] }];
      const delimiter = lines[0].includes('\t') ? '\t' : ',';
      const parsed = lines.map(line => line.split(delimiter).map(cell => cell.trim()));
      const headers = parsed[0];
      const rows = parsed.slice(1);
      return [{ name: 'Sheet1', headers, rows }];
    }
    return [{ name: 'Sheet1', headers: [], rows: [] }];
  }
}
