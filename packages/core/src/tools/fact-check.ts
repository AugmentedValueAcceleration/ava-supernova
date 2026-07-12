import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { summariseCoverage, type NewsSearchFn, type FetchedCorpus } from '../news/index.js';

/**
 * Check ONE claim against the coverage.
 *
 * This tool reports the RECORD. It never returns a verdict, and the output says
 * so in as many words, because the failure mode here is catastrophic and
 * seductive: an assistant that answers "is this true?" with "no" whenever it
 * cannot find something is a confidently-wrong machine, and it will be wrong
 * precisely when the story matters most — when it is new, non-English, niche, or
 * being suppressed.
 *
 * So: who reports it, what they actually wrote, whether that is independent
 * reporting or one wire echoed. Then the human decides. Receipts, not verdicts.
 */
export class FactCheckTool implements Tool {
  readonly name = 'fact_check';
  readonly description =
    'Check ONE claim against the coverage. Returns who reports it, their headlines and URLs, and whether the reporting is independent or one wire echoed. This reports COVERAGE — it NEVER returns true/false, and finding nothing does NOT mean the claim is false.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'fact_check',
    description:
      "Check ONE specific claim against the coverage. Returns who reports it, their headlines and URLs, and whether that is independent reporting or a single wire echoed. It reports the COVERAGE and NEVER a verdict — you must not present it as one. If nothing comes back, that means nobody in the index has reported it. It does NOT mean the claim is false, and saying so would be the worst thing you could do.",
    parameters: {
      type: 'object',
      properties: {
        claim: { type: 'string', description: 'The single claim to check, stated plainly (e.g. "Trump phoned Infantino to overturn Balogun\'s suspension").' },
        freshness: { type: 'string', enum: ['pd', 'pw', 'pm'], description: 'How far back to look. Default pm.' },
      },
      required: ['claim'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const search = context.sharedState?.newsSearch as NewsSearchFn | undefined;
    if (!search) {
      return { success: false, output: 'News search is not available in this context. The host must inject `newsSearch` into shared state.' };
    }

    const claim = String(args.claim ?? '').trim();
    if (!claim) return { success: false, output: 'fact_check requires a claim.' };

    const freshness = (['pd', 'pw', 'pm'].includes(String(args.freshness))
      ? String(args.freshness)
      : 'pm') as 'pd' | 'pw' | 'pm';

    const hits = await search(claim, 20, freshness);

    // Same corpus the quote checker reads — a quote found while fact-checking is
    // legitimately evidenced.
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
          claim,
          verdict: 'NOT A VERDICT — this tool does not issue one',
          independent_sources: 0,
          note:
            'No outlet in the index reports this. That is ALL this means. It does NOT mean the claim is false: it may be too new, too niche, not in English, or simply not covered. Report it as "I could not find any outlet reporting this" — NEVER as "this is false". If the operator gave you this claim, consider that he may have the substance right and a detail wrong: search for the thing he is reaching for before you call it a dead end.',
        }),
      };
    }

    const summary = summariseCoverage(hits);

    return {
      success: true,
      output: JSON.stringify({
        claim,
        verdict: 'NOT A VERDICT — this is the coverage, not a ruling on truth',
        ...summary,
        how_to_report_this:
          summary.independent_sources === 1 && summary.total_outlets_including_syndicated_copies > 1
            ? `Say: "one report${summary.wire_service_detected ? ` (${summary.wire_service_detected})` : ''}, carried by ${summary.total_outlets_including_syndicated_copies} outlets" — NOT "confirmed by ${summary.total_outlets_including_syndicated_copies} sources". They are not the same thing and the difference is the whole point.`
            : `Say how many INDEPENDENT outlets report it (${summary.independent_sources}), name them, and quote where they disagree. Never present the raw outlet count as corroboration.`,
      }),
    };
  }
}
