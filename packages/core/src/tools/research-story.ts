import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { summariseCoverage, type NewsSearchFn, type FetchedCorpus } from '../news/index.js';

/**
 * Stand a story up before writing it.
 *
 * Pulls what several outlets actually published and hands back: who covered it,
 * their EXACT headlines, short verbatim excerpts, URLs — and, critically, which
 * of them are running the SAME WIRE COPY rather than doing independent work.
 *
 * Two things happen here that the rest of the Newsroom depends on:
 *
 *   1. `independent_sources` is computed, not counted. Forty-seven outlets
 *      carrying one Reuters report is ONE source echoed. Handing the model a raw
 *      total would invite it to write "confirmed by 47 outlets", which is a lie
 *      dressed as corroboration — the exact trick this newsroom exists to expose.
 *
 *   2. Everything fetched is stashed in `fetchedCorpus` so write_article can
 *      VERIFY her quotes against it. That is what turns "quote verbatim from a
 *      page you fetched" from an honour system into an enforced rule.
 */
export class ResearchStoryTool implements Tool {
  readonly name = 'research_story';
  readonly description =
    'Stand a story up. Pulls MULTIPLE outlets and returns who covered it, their exact headlines, verbatim excerpts, URLs — and which are the same wire copy rather than independent reporting. Call this before every article. `independent_sources` is the number that means something.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'research_story',
    description:
      'Stand a story up before you write it. Returns who covered it, their EXACT headlines, short verbatim excerpts and URLs — plus which outlets are running the SAME WIRE COPY rather than independent work. `independent_sources` is what corroboration actually means; the raw outlet total is NOT. Quotes may only be drawn from the excerpts this returns.',
    parameters: {
      type: 'object',
      properties: {
        story: { type: 'string', description: 'The story to stand up, phrased as you would search for it (e.g. "Egypt complaint FIFA refereeing Argentina").' },
        freshness: { type: 'string', enum: ['pd', 'pw', 'pm'], description: 'pd = past day, pw = past week (default), pm = past month.' },
      },
      required: ['story'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const search = context.sharedState?.newsSearch as NewsSearchFn | undefined;
    if (!search) {
      return {
        success: false,
        output: 'News search is not available in this context. The host must inject `newsSearch` into shared state.',
      };
    }

    const story = String(args.story ?? '').trim();
    if (!story) return { success: false, output: 'research_story requires a story to look for.' };

    const freshness = (['pd', 'pw', 'pm'].includes(String(args.freshness))
      ? String(args.freshness)
      : 'pw') as 'pd' | 'pw' | 'pm';

    const hits = await search(story, 20, freshness);

    // Stash what we actually read, so write_article can check her quotes against
    // it. Accumulate across the turn — she may research more than one angle
    // before writing, and a quote from either is legitimate.
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
          story,
          independent_sources: 0,
          note:
            'Nothing in the index reports this. That means nobody has reported it HERE. It does NOT mean it is false, and you must not write that it is. Tell the operator you could not stand it up, and — if the substance might be right and a detail wrong — try the story he is REACHING FOR, not just the words he used.',
        }),
      };
    }

    return {
      success: true,
      output: JSON.stringify({ story, ...summariseCoverage(hits) }),
    };
  }
}
