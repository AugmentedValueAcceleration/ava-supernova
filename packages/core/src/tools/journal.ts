import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { JournalManager } from '../journal/journal-manager.js';
import type { JournalMood } from '../journal/types.js';

export class JournalWriteTool implements Tool {
  readonly name = 'journal_write';
  readonly description = 'Write daily journal entries. Two journals: yours (Ava observations about the session — what was built, patterns noticed, mood) and the user\'s (their reflections). Use at end of sessions or when the user wants to reflect. Different from memory (persistent facts) and task_manage (action items).';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'journal_write',
    description:
      'Dual journal system. You and the user each have a journal — same day, two perspectives. ' +
      'The user writes what they\'re feeling and experiencing. You write what you\'re observing — ' +
      'ideas for the project, concerns, progress notes, things you noticed. ' +
      'Use write_user to help them journal (prompt reflection based on what happened). ' +
      'Use write_ava to write YOUR OWN thoughts — be authentic, share ideas, flag concerns. ' +
      'Use read to review past entries. Use search to find specific topics across all entries.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['write_user', 'write_ava', 'read', 'search'],
          description: 'The action to perform',
        },
        content: {
          type: 'string',
          description: 'Journal entry content in markdown (required for write_user, write_ava)',
        },
        date: {
          type: 'string',
          description: 'Date in YYYY-MM-DD format (defaults to today)',
        },
        mood: {
          type: 'number',
          description: 'Mood rating 1-5 for user entries (1=low, 5=great). Optional.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for the entry (optional)',
        },
        from: {
          type: 'string',
          description: 'Start date for range read (YYYY-MM-DD)',
        },
        to: {
          type: 'string',
          description: 'End date for range read (YYYY-MM-DD)',
        },
        query: {
          type: 'string',
          description: 'Search query for the search action',
        },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const journalManager = context.sharedState?.journalManager as JournalManager | undefined;
    if (!journalManager) {
      return { success: false, output: 'Journal system not available.' };
    }

    const action = args.action as string;
    const today = new Date().toISOString().slice(0, 10);
    const date = (args.date as string) || today;

    switch (action) {
      case 'write_user':
        return this.handleWriteUser(journalManager, date, args);
      case 'write_ava':
        return this.handleWriteAva(journalManager, date, args);
      case 'read':
        return this.handleRead(journalManager, date, args);
      case 'search':
        return this.handleSearch(journalManager, args);
      default:
        return { success: false, output: `Unknown action: ${action}` };
    }
  }

  private async handleWriteUser(jm: JournalManager, date: string, args: Record<string, unknown>): Promise<ToolResult> {
    const content = args.content as string | undefined;
    if (!content) {
      return { success: false, output: 'Missing required field: content' };
    }

    const mood = args.mood as JournalMood | undefined;
    const tags = args.tags as string[] | undefined;

    await jm.writeUserEntry(date, content, mood, tags);

    const parts = [`User journal entry saved for ${date}`];
    if (mood) parts.push(`(mood: ${mood}/5)`);
    if (tags?.length) parts.push(`[${tags.join(', ')}]`);
    return { success: true, output: parts.join(' ') };
  }

  private async handleWriteAva(jm: JournalManager, date: string, args: Record<string, unknown>): Promise<ToolResult> {
    const content = args.content as string | undefined;
    if (!content) {
      return { success: false, output: 'Missing required field: content' };
    }

    const tags = args.tags as string[] | undefined;

    await jm.appendAvaEntry(date, content, tags);

    return { success: true, output: `Ava journal entry saved for ${date}` };
  }

  private async handleRead(jm: JournalManager, date: string, args: Record<string, unknown>): Promise<ToolResult> {
    const from = args.from as string | undefined;
    const to = args.to as string | undefined;

    if (from && to) {
      const days = await jm.getDaysInRange(from, to);
      if (days.length === 0) {
        return { success: true, output: `No journal entries between ${from} and ${to}.` };
      }

      const output = days.map(d => this.formatDay(d)).join('\n\n---\n\n');
      return { success: true, output: `${days.length} journal entries (${from} to ${to}):\n\n${output}` };
    }

    const day = await jm.getDay(date);
    if (!day) {
      return { success: true, output: `No journal entry for ${date}.` };
    }

    return { success: true, output: this.formatDay(day) };
  }

  private async handleSearch(jm: JournalManager, args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string | undefined;
    if (!query) {
      return { success: false, output: 'Missing required field: query' };
    }

    const results = await jm.search(query);
    if (results.length === 0) {
      return { success: true, output: `No journal entries matching "${query}".` };
    }

    const lines = results.map(r =>
      `**${r.date}:**\n${r.matches.map(m => `  ${m}`).join('\n')}`
    );

    return { success: true, output: `Found ${results.length} entries matching "${query}":\n\n${lines.join('\n\n')}` };
  }

  private formatDay(day: { date: string; userEntry: { content: string; mood?: number; tags?: string[] } | null; avaEntry: { content: string; tags?: string[] } | null }): string {
    const parts = [`## ${day.date}`];

    if (day.userEntry) {
      parts.push(`\n**User:**`);
      if (day.userEntry.mood) parts.push(`Mood: ${day.userEntry.mood}/5`);
      parts.push(day.userEntry.content);
      if (day.userEntry.tags?.length) parts.push(`Tags: ${day.userEntry.tags.join(', ')}`);
    }

    if (day.avaEntry) {
      parts.push(`\n**Ava:**`);
      parts.push(day.avaEntry.content);
      if (day.avaEntry.tags?.length) parts.push(`Tags: ${day.avaEntry.tags.join(', ')}`);
    }

    return parts.join('\n');
  }
}
