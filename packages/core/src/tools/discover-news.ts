import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { NewsSearchFn, FetchedCorpus } from '../news/index.js';

/**
 * The story menu — what is actually breaking, by desk.
 *
 * Deliberately does NOT cluster. Syndication detection compares TEXT, which is
 * exactly right within one story and wrong across a category sweep: twenty
 * unrelated earnings pieces sharing a template would collapse into one "story"
 * that doesn't exist. Clustering belongs in research_story, where the hits are
 * all about the same event.
 *
 * The selection is the skill, and it belongs to her, not to a ranking function:
 * a story everyone has is rarely worth writing; a story only one outlet has is a
 * story that needs CHECKING, not repeating.
 */

/** The standing query per desk. Mirrors NEWS_CATEGORIES on the web side — the
 *  ids MUST stay in step with it, and with the hub. Phrased as a headline search
 *  ("… news today"), not a topic noun-phrase: a generic phrase matches evergreen
 *  aggregator pages, while a breaking phrasing surfaces what is actually
 *  happening now. */
const CATEGORY_QUERIES: Record<string, string> = {
  'world': 'breaking world news today',
  'ai': 'latest AI artificial intelligence news today',
  'technology': 'technology news today',
  'open-source': 'open source software news today',
  'security-privacy': 'cybersecurity data breach privacy news today',
  'business': 'top business and economy news today',
  'science': 'latest science news today',
  'health': 'health and fitness news today',
  'food': 'food and nutrition news today',
  'education': 'education news today',
  'sport': 'breaking sports news today',
};

export class DiscoverNewsTool implements Tool {
  readonly name = 'discover_news';
  readonly description =
    'What is actually breaking right now, by category or free-text query. Your story menu. Returns real headlines with their outlet and URL, straight from the news index. Never invent a story — if this comes back empty, say so.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'discover_news',
    description:
      "What is actually breaking right now, by desk or free-text query. Your story menu — call this when the operator asks what's happening or what's worth covering. Returns real headlines with outlet and URL from the news index. Never invent a story; if it comes back empty, say so plainly.",
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['world', 'ai', 'technology', 'open-source', 'security-privacy', 'business', 'science', 'health', 'food', 'education', 'sport'],
          description: "The desk to scan. Uses that desk's standing query.",
        },
        query: { type: 'string', description: 'Optional free-text query, used INSTEAD of the category default (e.g. "FIFA refereeing complaints").' },
        freshness: { type: 'string', enum: ['pd', 'pw', 'pm'], description: 'pd = past day (default, for breaking), pw = past week, pm = past month.' },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const search = context.sharedState?.newsSearch as NewsSearchFn | undefined;
    if (!search) {
      return { success: false, output: 'News search is not available in this context. The host must inject `newsSearch` into shared state.' };
    }

    const category = String(args.category ?? '').trim();
    const freeText = String(args.query ?? '').trim();
    const query = freeText || CATEGORY_QUERIES[category] || CATEGORY_QUERIES.world;

    const freshness = (['pd', 'pw', 'pm'].includes(String(args.freshness))
      ? String(args.freshness)
      : 'pd') as 'pd' | 'pw' | 'pm';

    const hits = await search(query, 20, freshness);

    // Stash for the quote checker — she may quote straight off the menu if she
    // covers one of these without a deeper pull.
    if (context.sharedState) {
      const existing = (context.sharedState.fetchedCorpus as FetchedCorpus | undefined) ?? { hits: [] };
      const seen = new Set(existing.hits.map((h) => h.url));
      context.sharedState.fetchedCorpus = {
        hits: [...existing.hits, ...hits.filter((h) => !seen.has(h.url))],
      };
    }

    if (hits.length === 0) {
      return {
        success: true,
        output: JSON.stringify({
          category: category || 'world',
          query,
          stories: [],
          note: 'Nothing came back. Say so — do NOT fall back on what you think is happening. An invented story is worse than an empty desk.',
        }),
      };
    }

    return {
      success: true,
      output: JSON.stringify({
        category: category || 'world',
        query,
        count: hits.length,
        stories: hits.map((h) => ({ outlet: h.outlet, headline: h.title, url: h.url, age: h.age ?? null, excerpt: h.excerpt.slice(0, 240) })),
        note:
          'This is the menu, not the story. Before writing ANY of these, call research_story to see who else has it, whether it is independent reporting or one wire echoed, and where outlets disagree. The selection is the skill: a story everyone has is rarely worth writing; a story only one outlet has needs CHECKING, not repeating.',
      }),
    };
  }
}
