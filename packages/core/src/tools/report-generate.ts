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

import { extname } from 'node:path';
import { validatePath } from './security.js';
import { documentPathFor } from './authoring/document-places.js';
import { writeDocumentFromMarkdown } from './authoring/export-document.js';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { TaskManager } from '../tasks/task-manager.js';
import type { JournalManager } from '../journal/journal-manager.js';
import type { MemorySession } from '../memory-v4/reader.js';
import { localYmd, todayLocal } from '../core/dates.js';

export class ReportGenerateTool implements Tool {
  readonly name = 'report_generate';
  readonly description = 'Generate a structured .docx report from tasks, journal, memory, and project data.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'report_generate',
    description: 'Generate a structured report by combining data from tasks, journal entries, memories, and project context. Supports multiple report types: weekly status, project health, sprint review, board brief. The format follows the file name: .docx (Word), .pdf, .odt or .md.',
    parameters: {
      type: 'object',
      properties: {
        report_type: {
          type: 'string',
          enum: ['weekly-status', 'project-health', 'sprint-review', 'board-brief', 'custom'],
          description: 'Type of report to generate',
        },
        title: { type: 'string', description: 'Report title (auto-generated if omitted)' },
        file_path: { type: 'string', description: 'Output file, e.g. "weekly-2026-11-15.docx" or ".pdf". A bare name is saved in the project documents/ folder, where the Library shows it.' },
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

    // Inside the project; a bare name goes to documents/, where the Library shows it.
    let absolutePath: string;
    try { absolutePath = validatePath(documentPathFor(filePath), context.cwd); } catch (e) { return { success: false, output: (e as Error).message }; }

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

    const decisionData = includeDecisions && context.sharedState?.memorySession
      ? await this.gatherDecisionData(context.sharedState.memorySession as MemorySession)
      : null;

    // One engine for every document (15 Nov 2026): the report is written as
    // Markdown and turned into the format its file name asks for — Word, PDF,
    // OpenDocument or Markdown itself — with the same fonts, house style and
    // tables as everything else Ava writes.
    const markdown = this.buildMarkdown(title, startDate, endDate, taskData, journalData, decisionData, customSections);
    try {
      const out = await writeDocumentFromMarkdown(markdown, absolutePath);
      return {
        success: true,
        output: `Report saved: ${out.path}\n\n${markdown}`,
        metadata: { path: out.path, reportType, periodDays, lineCount: markdown.split('\n').length, format: extname(out.path).slice(1) },
      };
    } catch (err) {
      return { success: false, output: `Failed to write report: ${err instanceof Error ? err.message : String(err)}` };
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

  /** The open project's newest facts from memory (what was decided and holds now). */
  private async gatherDecisionData(session: MemorySession) {
    try {
      if (!session.project) return null;
      const scope = `project:${session.project.id}`;
      const decisions = (await session.mem.listFacts('fact'))
        .filter(f => f.scope === scope && (f.kind === 'project' || f.kind === 'rule'))
        .sort((a, b) => b.from.localeCompare(a.from))
        .slice(0, 5);
      if (decisions.length === 0) return null;
      return decisions.map(d => d.text.split('\n')[0].slice(0, 150));
    } catch {
      return null;
    }
  }

  // ─── Native .docx Generation ─────────────────────────────────────────

  // ─── The report as Markdown ──────────────────────────────────────────

  private buildMarkdown(
    title: string,
    startDate: string,
    endDate: string,
    taskData: Awaited<ReturnType<typeof this.gatherTaskData>>,
    journalData: Awaited<ReturnType<typeof this.gatherJournalData>>,
    decisionData: Awaited<ReturnType<typeof this.gatherDecisionData>>,
    customSections: Array<{ heading: string; content: string }> | undefined,
  ): string {
    const yaml = (v: string) => JSON.stringify(v);
    const sections: string[] = [`---\ntitle: ${yaml(title)}\nsubtitle: ${yaml(`${startDate} to ${endDate}`)}\ndate: ${yaml(endDate)}\nstyle: report\n---`];

    if (taskData) {
      const { completed, inProgress, overdue } = taskData;
      if (completed.length || inProgress.length || overdue.length) {
        const lines: string[] = ['## Tasks'];
        if (completed.length) {
          lines.push(`\n**Completed (${completed.length})**\n`);
          for (const t of completed.slice(0, 10)) lines.push(`- ${t.title}`);
        }
        if (inProgress.length) {
          lines.push(`\n**In progress (${inProgress.length})**\n`);
          for (const t of inProgress.slice(0, 10)) lines.push(`- ${t.title}`);
        }
        if (overdue.length) {
          lines.push(`\n:::warning Overdue (${overdue.length})`);
          for (const t of overdue.slice(0, 5)) lines.push(`- ${t.title} (due ${t.dueDate})`);
          lines.push(':::');
        }
        sections.push(lines.join('\n'));
      }
    }

    if (journalData?.length) {
      const lines: string[] = ['## Journal highlights'];
      for (const entry of journalData) lines.push(`\n**${entry.date}:** ${entry.content}`);
      sections.push(lines.join('\n'));
    }

    if (decisionData?.length) {
      sections.push(['## Key decisions', '', ...decisionData.map((d) => `- ${d}`)].join('\n'));
    }

    for (const section of customSections ?? []) sections.push(`## ${section.heading}\n\n${section.content}`);

    return sections.join('\n\n') + '\n';
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
