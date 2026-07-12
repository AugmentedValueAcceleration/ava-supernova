import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { StoryStore, StorySuggestion, FetchedCorpus } from '../news/index.js';

/**
 * The front page — what SHE thinks is worth writing today, and why.
 *
 * The Newsroom's counterpart to suggest_beats. Ava scans the desks with
 * discover_news, then hands back a short menu with her reason attached to each
 * pick. The reason IS the deliverable: a ranked dump of headlines is something a
 * search engine can produce, and it leaves the operator doing the judging. The
 * selection is the job.
 *
 * One hard rule, enforced here rather than asked for: every story on the menu
 * must be one she actually SAW. Each pick's URL is checked against the corpus
 * she fetched this turn, and any pick that isn't in it is dropped. Otherwise the
 * front page — the very first thing the operator reads — becomes the one surface
 * where a hallucinated story could walk straight in.
 */
export class SuggestStoriesTool implements Tool {
  readonly name = 'suggest_stories';
  readonly description =
    "The front page: 3-6 stories worth writing today, each with WHY. Scan with discover_news first — every story you offer must be one you actually saw (the URLs are checked). Don't write them; this is the menu.";
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'suggest_stories',
    description:
      "The front page — 3-6 stories worth writing today, with your reason for each. Call this when the operator asks what's happening, what's worth covering, or opens the desk. FIRST call discover_news (one call per desk you're scanning) so you're choosing from stories that actually exist — every URL you offer is checked against what you fetched, and anything you didn't see is dropped. Then SELECT: a story everyone already has is rarely worth writing; a story only one outlet has needs checking, not repeating. Do NOT write the articles — this is the menu, the operator picks.",
    parameters: {
      type: 'object',
      properties: {
        stories: {
          type: 'array',
          description: '3-6 stories worth writing, best first.',
          items: {
            type: 'object',
            properties: {
              desk: {
                type: 'string',
                enum: ['world', 'ai', 'technology', 'open-source', 'security-privacy', 'business', 'science', 'health', 'food', 'education', 'sport'],
              },
              headline: { type: 'string', description: "The outlet's headline, as it actually appeared." },
              outlet: { type: 'string', description: 'Where you saw it.' },
              url: { type: 'string', description: 'The URL you saw it at. Checked — it must be one you actually fetched.' },
              why: { type: 'string', description: "Why this one is worth writing: what's actually at stake, what everyone else is missing, or what doesn't add up. Not a summary of the headline — a reason." },
              angle: { type: 'string', description: 'Optional: how you would come at it.' },
            },
            required: ['desk', 'headline', 'outlet', 'url', 'why'],
          },
        },
      },
      required: ['stories'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.storyStore as StoryStore | undefined;
    if (!store) {
      return { success: false, output: 'The story menu is not available in this context. The host must inject `storyStore` into shared state.' };
    }

    const corpus = (context.sharedState?.fetchedCorpus as FetchedCorpus | undefined) ?? { hits: [] };
    if (corpus.hits.length === 0) {
      return {
        success: false,
        output:
          'REFUSED: you have not scanned anything this turn. Call discover_news first — the front page is built from stories that exist, not from what you expect to be happening.',
      };
    }
    const seen = new Set(corpus.hits.map((h) => h.url));

    const raw = Array.isArray(args.stories) ? (args.stories as unknown[]) : [];
    const all: StorySuggestion[] = raw
      .map((s) => {
        const o = (s && typeof s === 'object') ? s as Record<string, unknown> : {};
        return {
          desk: String(o.desk || '').trim(),
          headline: String(o.headline || '').trim(),
          outlet: String(o.outlet || '').trim(),
          url: String(o.url || '').trim(),
          why: String(o.why || '').trim(),
          angle: String(o.angle || '').trim() || undefined,
        };
      })
      .filter((s) => s.headline && s.url);

    const stories = all.filter((s) => seen.has(s.url)).slice(0, 6);
    const dropped = all.length - stories.length;

    if (stories.length === 0) {
      return {
        success: false,
        output:
          'REFUSED: none of those stories appear in anything you fetched this turn. A story on the front page that nobody published is the worst thing this desk could put in front of him. Scan again with discover_news and offer only what actually came back — copy the URLs exactly.',
      };
    }

    try {
      await store.suggest(stories);
      return {
        success: true,
        output:
          `Front page set: ${stories.length} stor${stories.length === 1 ? 'y' : 'ies'} offered.` +
          (dropped > 0
            ? ` ${dropped} dropped — their URLs were not in anything you fetched, so they could not be verified as real. Do not re-offer them from memory.`
            : '') +
          ' The operator picks one to take through to an article.',
        metadata: { count: stories.length, dropped },
      };
    } catch (err) {
      return { success: false, output: `Failed to set the front page: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
