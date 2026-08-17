import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { JournalManager, SearchFilters } from '../journal/journal-manager.js';
import type { JournalAuthor, JournalDay, JournalMood } from '../journal/types.js';
import { DEFAULT_AVA_KIND, DEFAULT_USER_KIND } from '../journal/types.js';
import { todayLocal } from '../core/dates.js';

export class JournalWriteTool implements Tool {
  readonly name = 'journal_write';
  readonly description =
    'Write and read the local journal — a stream of typed entries (personal, feeling, idea, business, observation, or a custom kind). ' +
    "You and the user share it: log your own observations as you work, or help the user capture a reflection. " +
    'Different from memory (persistent facts) and task_manage (action items). Fully local — never leaves the machine.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'journal_write',
    description:
      'Local journal of typed entries. Many entries per day, each with a kind. ' +
      'Use add_entry to log a new entry — set author to "ava" for your own observations (kind defaults to "observation") ' +
      'or "user" to capture the user\'s reflection (kind "personal"/"feeling" carry a 1-5 mood). ' +
      'Use update_entry / delete_entry by id, read to review a day or range, and search (with optional kind/author filters) to find topics.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add_entry', 'update_entry', 'delete_entry', 'read', 'search'],
          description: 'The action to perform',
        },
        author: {
          type: 'string',
          enum: ['ava', 'user'],
          description: 'Who the entry is for (add_entry). Defaults to "ava".',
        },
        kind: {
          type: 'string',
          description: 'Entry kind id: personal, feeling, idea, business, observation, or a custom kind. Optional.',
        },
        title: { type: 'string', description: 'Optional short heading for the entry.' },
        content: { type: 'string', description: 'Entry content in markdown (required for add_entry).' },
        id: { type: 'string', description: 'Entry id (required for update_entry, delete_entry).' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (defaults to today).' },
        mood: { type: 'number', description: 'Mood 1-5 for reflective kinds (1=low, 5=great). Optional.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for the entry (optional).' },
        from: { type: 'string', description: 'Start date for range read / search filter (YYYY-MM-DD).' },
        to: { type: 'string', description: 'End date for range read / search filter (YYYY-MM-DD).' },
        query: { type: 'string', description: 'Search query for the search action.' },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const jm = context.sharedState?.journalManager as JournalManager | undefined;
    if (!jm) return { success: false, output: 'Journal system not available.' };

    const action = args.action as string;
    // The user's day, not UTC's — an entry written at 23:00 in New York
    // was filing under tomorrow, and one at 00:30 in British Summer Time
    // under yesterday.
    const today = todayLocal();
    const date = (args.date as string) || today;

    switch (action) {
      case 'add_entry':
      case 'write_user': // legacy alias
      case 'write_ava': // legacy alias
        return this.handleAdd(jm, date, args, action);
      case 'update_entry':
        return this.handleUpdate(jm, date, args);
      case 'delete_entry':
        return this.handleDelete(jm, date, args);
      case 'read':
        return this.handleRead(jm, date, args);
      case 'search':
        return this.handleSearch(jm, args);
      default:
        return { success: false, output: `Unknown action: ${action}` };
    }
  }

  private async handleAdd(jm: JournalManager, date: string, args: Record<string, unknown>, action: string): Promise<ToolResult> {
    const content = args.content as string | undefined;
    if (!content) return { success: false, output: 'Missing required field: content' };

    const author: JournalAuthor = (args.author as JournalAuthor) || (action === 'write_user' ? 'user' : 'ava');
    const kind = (args.kind as string) || (author === 'user' ? DEFAULT_USER_KIND : DEFAULT_AVA_KIND);
    const mood = args.mood as JournalMood | undefined;
    const tags = args.tags as string[] | undefined;
    const title = args.title as string | undefined;

    const { id } = await jm.addEntry(date, { author, kind, content, title, mood, tags });

    const parts = [`${author === 'user' ? 'User' : 'Ava'} entry added for ${date} (${kind}, id ${id})`];
    if (mood) parts.push(`mood ${mood}/5`);
    if (tags?.length) parts.push(`[${tags.join(', ')}]`);
    return { success: true, output: parts.join(' ') };
  }

  private async handleUpdate(jm: JournalManager, date: string, args: Record<string, unknown>): Promise<ToolResult> {
    const id = args.id as string | undefined;
    if (!id) return { success: false, output: 'Missing required field: id' };
    const day = await jm.updateEntry(date, id, {
      kind: args.kind as string | undefined,
      title: args.title as string | undefined,
      content: args.content as string | undefined,
      mood: args.mood as JournalMood | undefined,
      tags: args.tags as string[] | undefined,
    });
    if (!day) return { success: false, output: `No entry ${id} on ${date}.` };
    return { success: true, output: `Updated entry ${id} on ${date}.` };
  }

  private async handleDelete(jm: JournalManager, date: string, args: Record<string, unknown>): Promise<ToolResult> {
    const id = args.id as string | undefined;
    if (!id) return { success: false, output: 'Missing required field: id' };
    const day = await jm.deleteEntry(date, id);
    if (!day) return { success: false, output: `No entry ${id} on ${date}.` };
    return { success: true, output: `Deleted entry ${id} on ${date}.` };
  }

  private async handleRead(jm: JournalManager, date: string, args: Record<string, unknown>): Promise<ToolResult> {
    const from = args.from as string | undefined;
    const to = args.to as string | undefined;

    if (from && to) {
      const days = await jm.getDaysInRange(from, to);
      if (days.length === 0) return { success: true, output: `No journal entries between ${from} and ${to}.` };
      const output = days.map((d) => this.formatDay(d)).join('\n\n---\n\n');
      return { success: true, output: `${days.length} day(s) with entries (${from} to ${to}):\n\n${output}` };
    }

    const day = await jm.getDay(date);
    if (!day || day.entries.length === 0) return { success: true, output: `No journal entries for ${date}.` };
    return { success: true, output: this.formatDay(day) };
  }

  private async handleSearch(jm: JournalManager, args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string | undefined;
    if (!query) return { success: false, output: 'Missing required field: query' };
    const filters: SearchFilters = {
      kind: args.kind as string | undefined,
      author: args.author as JournalAuthor | undefined,
      from: args.from as string | undefined,
      to: args.to as string | undefined,
    };
    const hits = await jm.search(query, filters);
    if (hits.length === 0) return { success: true, output: `No journal entries matching "${query}".` };
    const lines = hits.map(
      (h) => `**${h.date}** [${h.author}/${h.kind}] (id ${h.entryId})${h.title ? ` — ${h.title}` : ''}\n  …${h.snippet}…`,
    );
    return { success: true, output: `Found ${hits.length} matching "${query}":\n\n${lines.join('\n\n')}` };
  }

  private formatDay(day: JournalDay): string {
    const parts = [`## ${day.date}`];
    for (const e of day.entries) {
      const head = `**${e.author === 'user' ? 'You' : 'Ava'} · ${e.kind}**${e.mood ? ` · mood ${e.mood}/5` : ''} (id ${e.id})`;
      parts.push(`\n${head}`);
      if (e.title) parts.push(`### ${e.title}`);
      parts.push(e.content);
      if (e.tags?.length) parts.push(`Tags: ${e.tags.join(', ')}`);
    }
    return parts.join('\n');
  }
}
