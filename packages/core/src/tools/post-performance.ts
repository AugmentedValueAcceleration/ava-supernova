import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { PostMetricsReader } from '../social/index.js';

/**
 * See how recent Bluesky posts actually performed (likes/reposts/replies/quotes)
 * so Ava leans into what landed. Bluesky only — the platform we auto-track. The
 * DB read is the surface-injected `postMetricsReader` (binds the user); this
 * tool does the sort + format. Content is Ava's own posts, so trusted.
 */
export class PostPerformanceTool implements Tool {
  readonly name = 'post_performance';
  readonly description =
    'See how recent Bluesky posts actually performed — likes, reposts, replies. Call when drafting so you lean into what landed and avoid repeating what flopped. Bluesky only.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'post_performance',
    description: 'See how recent Bluesky posts actually performed — likes, reposts, replies. Call this when drafting so you can lean into what landed and avoid repeating what flopped. Bluesky only (the platform we auto-track); other platforms are posted manually and not tracked here.',
    parameters: {
      type: 'object',
      properties: {
        sort: { type: 'string', enum: ['top', 'recent'], description: '"top" = best engagement first (default), "recent" = newest first.' },
        limit: { type: 'number', description: 'How many posts to return (default 8, max 20).' },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const reader = context.sharedState?.postMetricsReader as PostMetricsReader | undefined;
    if (!reader) {
      return {
        success: false,
        output: 'Post performance is not available in this context. The host must inject `postMetricsReader` into shared state.',
      };
    }

    const sort = (args.sort as string) === 'recent' ? 'recent' : 'top';
    const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 20);

    let rows;
    try {
      rows = await reader.recent();
    } catch (err) {
      return { success: false, output: `Couldn't read post performance: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (!rows || rows.length === 0) {
      return {
        success: true,
        output: 'No Bluesky performance data yet — posts are tracked once they have been live long enough to gather engagement.',
      };
    }

    let arr = rows.map(r => ({ ...r, eng: (r.likes || 0) + (r.reposts || 0) + (r.replies || 0) + (r.quotes || 0) }));
    if (sort === 'top') arr.sort((a, b) => b.eng - a.eng);
    arr = arr.slice(0, limit);

    const lines = arr.map(r =>
      `${r.eng} eng (${r.likes || 0} likes, ${r.reposts || 0} reposts, ${r.replies || 0} replies) — "${String(r.content || '').split('\n')[0].slice(0, 80)}"`);

    return {
      success: true,
      output: `Bluesky post performance (${sort}, from the last ~50 tracked posts):\n${lines.join('\n')}`,
    };
  }
}
