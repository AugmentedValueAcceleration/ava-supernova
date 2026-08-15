import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { NewsSearchFn, NewsFeedFn, FetchedCorpus } from '../news/index.js';

/**
 * The story menu — what newsrooms actually ran today.
 *
 * DISCOVERY IS NOT A SEARCH. It reads the front pages: the RSS feeds of real
 * newsrooms, whose editors already decided what mattered this morning.
 *
 * The first cut searched, and it failed in a way worth remembering. Each desk ran
 * a keyword query against the news index, and the World desk's query returned SIX
 * hits — five of them section fronts, one real story. So Ava reported that one
 * story every single time and looked fixated on a war. She wasn't: it was the only
 * thing on her desk.
 *
 * The flaw was structural, not a bad keyword. A SEARCH IS A PULL — you only get
 * back what you already suspected — and nobody, human or model, thinks to ask for
 * "Bangkok bar fire" at 6am. Twenty-seven people died and the story reaches us by
 * luck. Letting the MODEL write the queries doesn't fix that; it just moves the
 * guess somewhere less inspectable, and a model's guess about today is even worse,
 * because today is precisely what it doesn't know.
 *
 * A FRONT PAGE IS A PUSH. The Guardian's world editor put the fire on the page
 * BECAUSE IT HAPPENED. So: SEE (feeds) → CHOOSE (Ava) → VERIFY (research_story).
 * Search is still used — but only to stand up a story she has already seen, never
 * to decide what the news is.
 *
 * Deliberately does NOT cluster. Syndication detection compares TEXT, which is
 * exactly right within one story and wrong across a whole desk: twenty unrelated
 * pieces sharing a house style would collapse into one "story" that doesn't exist.
 * Clustering belongs in research_story, where every hit is about the same event.
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
    "Read a desk's FRONT PAGES — the stories real newsrooms ran today, straight from their own feeds. No searching, no keywords: you see what happened, not what someone thought to ask for. This is your story menu.";
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'discover_news',
    description:
      "Read a desk's FRONT PAGES — the stories real newsrooms actually ran today, pulled from their own feeds (Guardian, BBC, Al Jazeera, NPR, DW, France 24, Reuters-carrying outlets, and so on, depending on the desk). This is NOT a search: nothing here was chosen by a keyword, so you are seeing what happened rather than what someone thought to ask for. Call it when the operator asks what's happening or what's worth covering. Read WIDELY before you choose — the whole point is that you are not being handed one running story. Pass `query` INSTEAD only when you are chasing a specific story you already know exists; that runs a real search. Never invent a story; if it comes back empty, say so plainly.",
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['world', 'ai', 'technology', 'open-source', 'security-privacy', 'business', 'science', 'health', 'food', 'education', 'sport'],
          description: "The desk whose front pages to read.",
        },
        query: { type: 'string', description: 'Only for chasing a specific story you ALREADY know exists (e.g. "Bangkok bar fire death toll"). Runs a search INSTEAD of reading the front pages. Leave empty for a desk scan — a search can only return what you already suspected, which is how a desk ends up reporting the same story every day.' },
        freshness: { type: 'string', enum: ['pd', 'pw', 'pm'], description: 'Only applies to `query`. pd = past day (default), pw = past week, pm = past month.' },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const feeds = context.sharedState?.newsFeeds as NewsFeedFn | undefined;
    const search = context.sharedState?.newsSearch as NewsSearchFn | undefined;

    const category = String(args.category ?? '').trim();
    const freeText = String(args.query ?? '').trim();
    const desk = DESK_ANGLES[category] ? category : 'world';

    const freshness = (['pd', 'pw', 'pm'].includes(String(args.freshness))
      ? String(args.freshness)
      : 'pd') as 'pd' | 'pw' | 'pm';

    let hits: Awaited<ReturnType<NewsFeedFn>>;
    let source: string;

    if (freeText) {
      // She's chasing something specific she already knows exists — that IS a
      // search, and search is the right tool for it.
      if (!search) {
        return { success: false, output: 'News search is not available in this context. The host must inject `newsSearch` into shared state.' };
      }
      hits = await search(freeText, 20, freshness);
      source = `search: "${freeText}"`;
    } else if (feeds) {
      // A desk scan READS THE FRONT PAGES. No query, no guessing — what those
      // newsrooms actually ran.
      hits = await feeds(desk);
      source = 'front pages';
    } else if (search) {
      // Fallback ONLY: a surface that hasn't injected the feed reader. Keyword
      // angles are strictly worse (this is the mode that gave the World desk one
      // story), so it is a floor, not the design.
      const batches = await Promise.all(
        DESK_ANGLES[desk].map((q) => search(q, 10, freshness).catch(() => [])),
      );
      hits = batches.flat();
      source = 'keyword fallback (no feed reader injected)';
    } else {
      return { success: false, output: 'Neither `newsFeeds` nor `newsSearch` is available in this context. The host must inject at least one.' };
    }

    // De-duplicate by URL and drop section fronts / fixtures tables — a headline
    // index is not a story: nothing happened, nothing to stand up, nothing to quote.
    const byUrl = new Map<string, (typeof hits)[number]>();
    for (const hit of hits) {
      if (!hit.url || byUrl.has(hit.url)) continue;
      if (INDEX_PAGE.test(hit.title)) continue;
      byUrl.set(hit.url, hit);
    }
    const stories = [...byUrl.values()].slice(0, 40);

    // Stash for the quote checker — she may quote straight off the menu if she
    // covers one of these without a deeper pull.
    if (context.sharedState) {
      const existing = (context.sharedState.fetchedCorpus as FetchedCorpus | undefined) ?? { hits: [] };
      const seen = new Set(existing.hits.map((h) => h.url));
      context.sharedState.fetchedCorpus = {
        hits: [...existing.hits, ...stories.filter((h) => !seen.has(h.url))],
      };
    }

    if (stories.length === 0) {
      return {
        success: true,
        output: JSON.stringify({
          desk,
          source,
          stories: [],
          note: 'Nothing came back. Say so — do NOT fall back on what you think is happening. An invented story is worse than an empty desk.',
        }),
      };
    }

    const outlets = [...new Set(stories.map((s) => s.outlet).filter(Boolean))];

    return {
      success: true,
      output: JSON.stringify({
        desk,
        source,
        outlets,
        count: stories.length,
        stories: stories.map((h) => ({ outlet: h.outlet, headline: h.title, url: h.url, age: h.age ?? null, excerpt: h.excerpt.slice(0, 240) })),
        note:
          'This is the front page, not the story — these are the pieces real newsrooms ran today, across several outlets that often disagree with each other. Nobody searched for them, so nothing here was pre-selected by a keyword: read WIDELY before you choose. A desk that only ever reports the one running story is echoing, not reporting. Then, for whatever you pick: call research_story to see who else has it, whether it is independent reporting or one wire echoed, and where outlets diverge. The selection is the skill — a story everyone has is rarely worth writing; a story only one outlet has needs CHECKING, not repeating.',
      }),
    };
  }
}
