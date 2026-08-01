import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { getLocale } from '../i18n/index.js';

export class NewsTool implements Tool {
  readonly name = 'news';
  readonly description = 'Get latest tech and AI news curated by the Ava platform. Filter by category (ai, coding, open-source, startups, tools) or search by keyword. Use in Chat mode for casual conversation or when users ask about what\'s happening in tech.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'news',
    description:
      'Get latest news articles from the Ava platform. ' +
      'Filter by category or search for specific topics. ' +
      'Use this to stay informed about AI, dev tools, open source, and tech news.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by news category.',
          enum: [
            'ai-agents',
            'models',
            'dev-tools',
            'open-source',
            'education',
            'productivity',
            'companions',
            'health',
            'enterprise',
            'industry',
          ],
        },
        query: {
          type: 'string',
          description: 'Search term to filter articles.',
        },
        limit: {
          type: 'number',
          description: 'Number of articles to return (default 5, max 10).',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const category = args.category as string | undefined;
    const query = args.query as string | undefined;
    let limit = (args.limit as number) ?? 5;
    if (limit < 1) limit = 1;
    if (limit > 10) limit = 10;

    try {
      let url = `https://avasupernova.com/api/news?limit=${limit}`;
      if (category) url += `&category=${category}`;
      if (query) url += `&q=${encodeURIComponent(query)}`;
      // Ava answers in the user's language, so the headlines she is answering
      // *from* have to be in it too — otherwise she is summarising English
      // copy into Spanish and the quotes drift. Every host (CLI, extension,
      // IDE sidecar) calls setLocale() at startup, so this is already correct
      // without threading language through ToolExecutionContext.
      const locale = getLocale();
      if (locale && locale !== 'en') url += `&locale=${encodeURIComponent(locale)}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'ava-supernova' },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return {
          success: false,
          output: `News API returned ${response.status}. The service may be temporarily unavailable.`,
        };
      }

      const data = await response.json() as Record<string, unknown>;
      const posts = data.posts as Record<string, unknown>[] | undefined;

      if (!posts || posts.length === 0) {
        return {
          success: true,
          output: 'No news articles found' + (category ? ` in category "${category}"` : '') + (query ? ` matching "${query}"` : '') + '.',
        };
      }

      let output = `## Latest News`;
      if (category) output += ` — ${category}`;
      if (query) output += ` (search: "${query}")`;
      output += `\n\n`;

      for (const post of posts) {
        const title = post.title as string ?? 'Untitled';
        const cat = post.category as string ?? '';
        const excerpt = (post.excerpt as string ?? '').slice(0, 200);
        const readingTime = post.reading_time as string | number ?? '';
        // The feed API returns `created_at`; `published` is a boolean filter,
        // not a date, and `publishedAt` does not exist — so this line silently
        // never rendered and Ava could not tell you how old a story was.
        const published = (post.created_at as string ?? '').slice(0, 10);

        output += `### ${title}\n`;
        if (cat) output += `**Category:** ${cat}`;
        if (readingTime) output += ` | **Read time:** ${readingTime} min`;
        if (published) output += ` | **Published:** ${published}`;
        output += `\n`;
        if (excerpt) output += `${excerpt}${excerpt.length >= 200 ? '...' : ''}\n`;
        output += `\n`;
      }

      const total = data.total as number | undefined;
      if (total && total > posts.length) {
        output += `_Showing ${posts.length} of ${total} articles._\n`;
      }

      return {
        success: true,
        output: output.trim(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('abort')) {
        return {
          success: false,
          output: 'News request timed out. The service may be slow — try again later.',
        };
      }
      return {
        success: false,
        output: `Failed to fetch news: ${message}`,
      };
    }
  }
}
