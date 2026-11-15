import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { MemorySession } from '../memory-v4/reader.js';

/**
 * memory_recall over memory v4. Same name as the old tool, so prompts and
 * mode allowlists are unchanged; a surface using v4 registers this one in
 * its place and puts the session in sharedState.memorySession.
 *
 * The app already adds the most relevant memories to each message, so this
 * is for deliberate searches: a different wording, another project, every
 * project, or what happened on a day.
 */
export class MemoryRecallV4Tool implements Tool {
  readonly name = 'memory_recall';
  readonly description = 'Search long-term memory about the person and their projects: facts, preferences, decisions, and what happened on a given day.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'memory_recall',
    description:
      'Search your long-term memory. The most relevant memories are already added to each message; call this before ever saying you don\'t know or don\'t remember something about them or their work. ' +
      'By default it searches facts about them and the open project. Set "project" to search another project by name, "reach":"all" for every project, or "date" (YYYY-MM-DD) to read what happened that day.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for, in plain words. Try other words if the first search finds nothing.' },
        project: { type: 'string', description: 'Another project to search, by its name (optional).' },
        reach: { type: 'string', enum: ['here', 'linked', 'all'], description: '"here" (default): about them + the open project. "linked": also connected projects. "all": every project.' },
        date: { type: 'string', description: 'A day to read, YYYY-MM-DD (optional). Still give a short query saying what you want from that day.' },
      },
      required: ['query'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const session = context.sharedState?.memorySession as MemorySession | undefined;
    if (!session) return { success: false, output: 'Memory is not available in this context.' };
    const reach = args.reach === 'linked' || args.reach === 'all' || args.reach === 'here' ? args.reach : undefined;
    try {
      const output = await session.recall({
        query: typeof args.query === 'string' ? args.query : undefined,
        project: typeof args.project === 'string' && args.project.trim() ? args.project.trim() : undefined,
        reach,
        date: typeof args.date === 'string' && args.date.trim() ? args.date.trim() : undefined,
      });
      return { success: true, output };
    } catch (err) {
      return { success: false, output: `Memory search failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
