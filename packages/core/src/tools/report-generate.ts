/**
 * Report Generator — Combines data sources into structured .docx reports.
 *
 * Pulls from tasks, journal, memory, and git to produce
 * weekly status reports, project health checks, sprint reviews, etc.
 * Uses the `docx` library for native Word output.
 * This is the JARVIS moment — "Ava, prep my board brief."
 *
 * As of the document-styling refactor, the brand tokens (Calibri, Ava
 * purple, body sizes, table shading) live in `./document-styling.ts`
 * and are shared with `document_manage.createDocx` so every Word doc
 * Ava produces has the same look.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { TaskManager } from '../tasks/task-manager.js';
import type { JournalManager } from '../journal/journal-manager.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import { localYmd, todayLocal } from '../core/dates.js';
import {
  titleParagraph, subtitleParagraph, headingParagraph, bodyParagraph,
  bulletParagraph, themedTable, sectionProperties,
  AVA_FONT, AVA_BODY_SIZE_DOCX, AVA_BODY_COLOR,
} from './document-styling.js';

export class ReportGenerateTool implements Tool {
  readonly name = 'report_generate';
  readonly description = 'Generate a structured .docx report from tasks, journal, memory, and project data.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'report_generate',
    description: 'Generate a structured report by combining data from tasks, journal entries, memories, and project context. Supports multiple report types: weekly status, project health, sprint review, board brief. Output is a .docx Word document.',
    parameters: {
      type: 'object',
      properties: {
        report_type: {
          type: 'string',
          enum: ['weekly-status', 'project-health', 'sprint-review', 'board-brief', 'custom'],
          description: 'Type of report to generate',
        },
        title: { type: 'string', description: 'Report title (auto-generated if omitted)' },
        file_path: { type: 'string', description: 'Output file path. Save to documents/ for Library access (e.g. "documents/reports/weekly-2026-03-17.docx")' },
        period_days: { type: 'number', description: 'Number of days to cover (default: 7)' },
        include_tasks: { type: 'boolean', description: 'Include task summary (default: true)' },
        include_journal: { type: 'boolean', description: 'Include journal highlights (default: true)' },
        include_decisions: { type: 'boolean', description: 'Include key decisions from memory (default: true)' },
        custom_sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['heading', 'content'],
          },
          description: 'Additional custom sections to include',
        },
      },
      required: ['report_type', 'file_path'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const reportType = args.report_type as string;
    const filePath = args.file_path as string;
    const periodDays = (args.period_days as number) || 7;
    const includeTasks = args.include_tasks !== false;
    const includeJournal = args.include_journal !== false;
    const includeDecisions = args.include_decisions !== false;
    const customSections = args.custom_sections as Array<{ heading: string; content: string }> | undefined;

    if (!filePath || !reportType) {
      return { success: false, output: 'report_type and file_path are required.' };
    }

    const absolutePath = filePath.startsWith('/') || filePath.includes(':')
      ? filePath
      : join(context.cwd, filePath);

    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - periodDays);
    const startDate = localYmd(periodStart);
    const endDate = localYmd(now);

    const title = (args.title as string) || this.defaultTitle(reportType, endDate);

    // Gather data from shared state managers
    const taskData = includeTasks && context.sharedState?.taskManager
      ? await this.gatherTaskData(context.sharedState.taskManager as TaskManager, startDate)
      : null;

    const journalData = includeJournal && context.sharedState?.journalManager
      ? await this.gatherJournalData(context.sharedState.journalManager as JournalManager, startDate, endDate)
      : null;

    const decisionData = includeDecisions && context.sharedState?.memoryManager
      ? await this.gatherDecisionData(context.sharedState.memoryManager as MemoryManager)
      : null;

    // Try native .docx generation
    try {
      const docxLib = await import('docx');
      return await this.generateDocx(
        docxLib, absolutePath, title, startDate, endDate,
        taskData, journalData, decisionData, customSections,
        reportType, periodDays,
      );
    } catch {
      // docx not available — fall back to markdown
      return await this.generateMarkdownFallback(
        absolutePath, title, startDate, endDate,
        taskData, journalData, decisionData, customSections,
        reportType, periodDays,
      );
    }
  }

  // ─── Data Gathering ──────────────────────────────────────────────────

  private async gatherTaskData(taskManager: TaskManager, since: string) {
    try {
      const allTasks = await taskManager.listTasks({ includeArchived: true });
      const completed = allTasks.filter(t => t.completedAt && t.completedAt >= since);
      const inProgress = allTasks.filter(t => t.status === 'in-progress');
      const overdue = allTasks.filter(t =>
        t.dueDate && t.dueDate < todayLocal() &&
        t.status !== 'done' && t.status !== 'archived'
      );
      return { completed, inProgress, overdue };
    } catch {
      return null;
    }
  }

  private async gatherJournalData(journalManager: JournalManager, from: string, to: string) {
    try {
      const days = await journalManager.getDaysInRange(from, to);
      if (days.length === 0) return null;
      return days.slice(-5).map(day => {
        const first = day.entries.find(e => e.author === 'user') ?? day.entries[0];
        return {
          date: day.date,
          content: first?.content.split('\n')[0].slice(0, 120) || '',
        };
      }).filter(d => d.content);
    } catch {
      return null;
    }
  }

  private async gatherDecisionData(memoryManager: MemoryManager) {
    try {
      const store = await memoryManager.loadProjectStore();
      if (!store) return null;
      const decisions = store.entries
        .filter(e => e.category === 'decision' && !e.archived)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5);
      if (decisions.length === 0) return null;
      return decisions.map(d => d.content.split('\n')[0].slice(0, 150));
    } catch {
      return null;
    }
  }

  // ─── Native .docx Generation ─────────────────────────────────────────

  private async generateDocx(
    docxLib: any,
    absolutePath: string,
    title: string,
    startDate: string,
    endDate: string,
    taskData: Awaited<ReturnType<typeof this.gatherTaskData>>,
    journalData: Awaited<ReturnType<typeof this.gatherJournalData>>,
    decisionData: Awaited<ReturnType<typeof this.gatherDecisionData>>,
    customSections: Array<{ heading: string; content: string }> | undefined,
    reportType: string,
    periodDays: number,
  ): Promise<ToolResult> {
    const { Document, Packer, Paragraph, TextRun } = docxLib;

    const children: any[] = [];

    // Title page (using shared style kit)
    children.push(titleParagraph(docxLib, title));
    children.push(subtitleParagraph(docxLib, `Generated by Ava Supernova on ${endDate}`));
    children.push(subtitleParagraph(docxLib, `Period: ${startDate} — ${endDate}`));

    // Tasks section
    if (taskData) {
      const { completed, inProgress, overdue } = taskData;

      if (completed.length > 0 || inProgress.length > 0 || overdue.length > 0) {
        children.push(headingParagraph(docxLib, 'Tasks', 1));

        const allDisplayTasks = [
          ...completed.slice(0, 10).map(t => ({ name: t.title, status: 'Completed', priority: (t as any).priority || '-' })),
          ...inProgress.slice(0, 10).map(t => ({ name: t.title, status: 'In Progress', priority: (t as any).priority || '-' })),
          ...overdue.slice(0, 5).map(t => ({ name: t.title, status: `Overdue (due ${t.dueDate})`, priority: (t as any).priority || '-' })),
        ];

        if (allDisplayTasks.length > 0) {
          children.push(themedTable(docxLib, {
            headers: ['Task', 'Status', 'Priority'],
            rows: allDisplayTasks.map(t => [t.name, t.status, String(t.priority)]),
            columnWidths: [60, 20, 20],
          }));
        }
      }
    }

    // Journal section
    if (journalData && journalData.length > 0) {
      children.push(headingParagraph(docxLib, 'Journal Highlights', 1));

      for (const entry of journalData) {
        // Mixed-style paragraph: bold date prefix + body content. Custom build
        // because the shared helper takes a single text run; this needs two.
        children.push(new Paragraph({
          spacing: { after: 120, line: 276 },
          children: [
            new TextRun({ text: `${entry.date}: `, bold: true, font: AVA_FONT, size: AVA_BODY_SIZE_DOCX, color: AVA_BODY_COLOR }),
            new TextRun({ text: entry.content, font: AVA_FONT, size: AVA_BODY_SIZE_DOCX, color: AVA_BODY_COLOR }),
          ],
        }));
      }
    }

    // Decisions section
    if (decisionData && decisionData.length > 0) {
      children.push(headingParagraph(docxLib, 'Key Decisions', 1));
      for (const decision of decisionData) {
        children.push(bulletParagraph(docxLib, decision));
      }
    }

    // Custom sections
    if (customSections && customSections.length > 0) {
      for (const section of customSections) {
        children.push(headingParagraph(docxLib, section.heading, 1));
        const paragraphs = section.content.split(/\n\n+/).filter(p => p.trim());
        for (const para of paragraphs) {
          children.push(bodyParagraph(docxLib, para.trim()));
        }
      }
    }

    const doc = new Document({
      sections: [{
        properties: sectionProperties(),
        children,
      }],
    });

    // Ensure output path ends with .docx
    let outputPath = absolutePath;
    if (!outputPath.toLowerCase().endsWith('.docx')) {
      outputPath = outputPath.replace(/\.[^.]+$/, '.docx');
      if (!outputPath.toLowerCase().endsWith('.docx')) {
        outputPath += '.docx';
      }
    }

    try {
      await mkdir(dirname(outputPath), { recursive: true });
      const buffer = await Packer.toBuffer(doc);
      await writeFile(outputPath, buffer);

      const sectionCount = [taskData, journalData, decisionData, customSections?.length ? customSections : null]
        .filter(Boolean).length;

      return {
        success: true,
        output: `Report generated: ${outputPath} (native .docx, ${sectionCount} sections)`,
        metadata: {
          path: outputPath,
          reportType,
          periodDays,
          format: 'docx',
          sections: sectionCount,
        },
      };
    } catch (err) {
      return { success: false, output: `Failed to write report: ${err}` };
    }
  }

  // ─── Markdown Fallback ────────────────────────────────────────────────

  private async generateMarkdownFallback(
    absolutePath: string,
    title: string,
    startDate: string,
    endDate: string,
    taskData: Awaited<ReturnType<typeof this.gatherTaskData>>,
    journalData: Awaited<ReturnType<typeof this.gatherJournalData>>,
    decisionData: Awaited<ReturnType<typeof this.gatherDecisionData>>,
    customSections: Array<{ heading: string; content: string }> | undefined,
    reportType: string,
    periodDays: number,
  ): Promise<ToolResult> {
    const sections: string[] = [];
    sections.push(`# ${title}`);
    sections.push(`\n*Generated by Ava Supernova on ${endDate}*`);
    sections.push(`*Period: ${startDate} — ${endDate}*\n`);

    // Tasks
    if (taskData) {
      const { completed, inProgress, overdue } = taskData;
      if (completed.length > 0 || inProgress.length > 0) {
        const lines: string[] = ['## Tasks'];
        if (completed.length > 0) {
          lines.push(`\n**Completed (${completed.length}):**`);
          for (const t of completed.slice(0, 10)) lines.push(`- ✓ ${t.title}`);
        }
        if (inProgress.length > 0) {
          lines.push(`\n**In Progress (${inProgress.length}):**`);
          for (const t of inProgress.slice(0, 10)) lines.push(`- → ${t.title}`);
        }
        if (overdue.length > 0) {
          lines.push(`\n**Overdue (${overdue.length}):**`);
          for (const t of overdue.slice(0, 5)) lines.push(`- ⚠ ${t.title} (due ${t.dueDate})`);
        }
        sections.push(lines.join('\n'));
      }
    }

    // Journal
    if (journalData && journalData.length > 0) {
      const lines: string[] = ['## Journal Highlights'];
      for (const entry of journalData) {
        lines.push(`\n**${entry.date}:** ${entry.content}`);
      }
      sections.push(lines.join('\n'));
    }

    // Decisions
    if (decisionData && decisionData.length > 0) {
      const lines: string[] = ['## Key Decisions'];
      for (const d of decisionData) lines.push(`\n- ${d}`);
      sections.push(lines.join('\n'));
    }

    // Custom sections
    if (customSections && customSections.length > 0) {
      for (const section of customSections) {
        sections.push(`## ${section.heading}\n\n${section.content}`);
      }
    }

    const content = sections.join('\n\n---\n\n');

    // Use .md extension for fallback
    let outputPath = absolutePath;
    if (outputPath.toLowerCase().endsWith('.docx')) {
      outputPath = outputPath.replace(/\.docx$/i, '.md');
    }

    try {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, content, 'utf-8');

      return {
        success: true,
        output: `Report generated as markdown (docx library not available — install with: pnpm add docx): ${outputPath}\n\n${content}`,
        metadata: {
          path: outputPath,
          reportType,
          periodDays,
          lineCount: content.split('\n').length,
          format: 'markdown',
          fallback: true,
        },
      };
    } catch (err) {
      return { success: false, output: `Failed to write report: ${err}` };
    }
  }

  private defaultTitle(reportType: string, date: string): string {
    switch (reportType) {
      case 'weekly-status': return `Weekly Status Report — ${date}`;
      case 'project-health': return `Project Health Check — ${date}`;
      case 'sprint-review': return `Sprint Review — ${date}`;
      case 'board-brief': return `Board Brief — ${date}`;
      default: return `Report — ${date}`;
    }
  }
}
