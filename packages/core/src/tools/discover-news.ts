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

/**
 * Each desk is a SPREAD of angles, not one standing phrase.
 *
 * The first cut used a single query per desk ("breaking world news today"). It
 * was measured against live Brave News and it was a disaster:
 *
 *   world  →  6 hits, 5 of them section fronts, ONE real story
 *   sport  →  2 hits, both section fronts, ZERO real stories
 *
 * So the World desk had exactly one card to play — the US/Iran story — and Ava
 * played it every single time. It looked like she was obsessed with the war. She
 * wasn't: it was the only thing on the desk. A newsroom that can only see one
 * story isn't reporting, it's echoing, and that is the failure this whole room
 * exists to avoid.
 *
 * Two things were wrong with the phrasing, and they pull against each other:
 *   - "… news today" reads like a SECTION FRONT to a search index, so it matches
 *     "World News and International Headlines : NPR" rather than any event.
 *   - one query, however phrased, can only ever surface one slice of a desk.
 *
 * So: several concrete angles per desk, merged and de-duplicated. Politics AND
 * disasters AND diplomacy AND the economy — because that IS what "world" means,
 * and if we only ask for one of them, that's the only one she can report.
 *
 * Same measurement, after: world went from 1 real story to ~50 — Japan's new
 * intelligence agency, the Bangkok bar fire, Israel's October elections, the
 * Bangladesh floods, a wildfire in Antelope Valley, the World Cup.
 *
 * Ids MUST stay in step with NEWS_CATEGORIES on the web and the hub.
 */
const DESK_ANGLES: Record<string, string[]> = {
  'world': [
    'world news',
    'international politics election government',
    'protest disaster earthquake flood wildfire',
    'diplomacy summit treaty sanctions',
  ],
  'ai': [
    'artificial intelligence news',
    'AI model release lab announcement',
    'AI regulation policy lawsuit',
    'AI research breakthrough paper',
  ],
  'technology': [
    'technology news',
    'software developer tools release',
    'hardware chips semiconductor',
    'big tech company announcement',
  ],
  'open-source': [
    'open source software',
    'open source project release github',
    'open source licensing foundation governance',
    'linux kernel community',
  ],
  'security-privacy': [
    'cybersecurity attack',
    'data breach hack ransomware',
    'privacy surveillance regulation GDPR',
    'vulnerability exploit CVE patch',
  ],
  'business': [
    'business economy news',
    'markets earnings company results',
    'inflation interest rates central bank',
    'merger acquisition funding round',
  ],
  'science': [
    'science research discovery',
    'space astronomy mission telescope',
    'climate environment study',
    'medicine biology genetics study',
  ],
  'health': [
    'health news',
    'public health disease outbreak',
    'fitness exercise nutrition study',
    'mental health wellbeing research',
  ],
  'food': [
    'food news',
    'nutrition diet study',
    'food industry recall safety',
    'restaurant chef cooking trends',
  ],
  'education': [
    'education news',
    'schools teachers policy funding',
    'university higher education students',
    'edtech learning technology',
  ],
  'sport': [
    'sport news results',
    'football soccer match result',
    'transfer injury manager club',
    'tennis cricket rugby athletics olympics',
  ],
};

/**
 * A section front is not a story.
 *
 * "World News and International Headlines : NPR", "Germany: Newsroom", "News
 * Today Live Updates" — these are the paper's front door, not something that
 * happened. They carry no event, nothing to stand up, and nothing to quote, and
 * on the thin desks they were crowding out the real reporting entirely (sport
 * was 2 hits and BOTH were these).
 *
 * Deliberately narrow. It only catches titles that are self-evidently an index —
 * a real headline about a genuine "breaking news" event ("Breaking news anchor
 * resigns") keeps its noun and survives, because the pattern needs the phrase to
 * BE the whole title, not appear in it.
 */
const INDEX_PAGE = new RegExp([
  // Section fronts and headline lists.
  '^news:', 'headlines$', 'headlines\\s*[:|-]', 'news headlines', 'newsroom$',
  'latest news$', 'top stories$', 'breaking news$', 'news today live',
  'live updates?$', 'news roundup',
  // Sport's version of a section front: the fixtures/scores table. These were
  // literally the ONLY two things the sport desk returned before the fan-out.
  '^scores\\b', 'scores?\\s*(&|and)\\s*(fixtures|schedule|results)',
  'fixtures?\\s*(&|and)\\s*(results|scores)',
  'results?\\s*(&|and)\\s*fixtures',
].join('|'), 'i');

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

    const freshness = (['pd', 'pw', 'pm'].includes(String(args.freshness))
      ? String(args.freshness)
      : 'pd') as 'pd' | 'pw' | 'pm';

    // A free-text query is Ava chasing something specific — run it as given.
    // A desk scan fans out across that desk's angles, because a desk is not one
    // subject: "world" is politics AND disasters AND diplomacy AND the economy,
    // and asking for only one of them is how a desk ends up with a single story.
    const desk = DESK_ANGLES[category] ? category : 'world';
    const queries = freeText ? [freeText] : DESK_ANGLES[desk];

    const batches = await Promise.all(
      queries.map((q) => search(q, freeText ? 20 : 10, freshness).catch(() => [])),
    );

    // Merge, de-duplicate by URL, drop the section fronts.
    const byUrl = new Map<string, (typeof batches)[number][number]>();
    for (const batch of batches) {
      for (const hit of batch) {
        if (!hit.url || byUrl.has(hit.url)) continue;
        if (INDEX_PAGE.test(hit.title)) continue;
        byUrl.set(hit.url, hit);
      }
    }
    const hits = [...byUrl.values()].slice(0, 30);

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
          desk,
          queries,
          stories: [],
          note: 'Nothing came back. Say so — do NOT fall back on what you think is happening. An invented story is worse than an empty desk.',
        }),
      };
    }

    return {
      success: true,
      output: JSON.stringify({
        desk,
        queries,
        count: hits.length,
        stories: hits.map((h) => ({ outlet: h.outlet, headline: h.title, url: h.url, age: h.age ?? null, excerpt: h.excerpt.slice(0, 240) })),
        note:
          'This is the menu, not the story. These came from SEVERAL angles on the desk, so they will span different subjects — that is the point. Do not tunnel on whichever subject happens to have the most hits; a desk that only ever reports one running story is echoing, not reporting. Before writing ANY of these, call research_story to see who else has it, whether it is independent reporting or one wire echoed, and where outlets disagree. The selection is the skill: a story everyone has is rarely worth writing; a story only one outlet has needs CHECKING, not repeating.',
      }),
    };
  }
}
