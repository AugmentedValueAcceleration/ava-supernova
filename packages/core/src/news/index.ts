// ─── The Newsroom — types, syndication detection, quote verification ─────────
//
// Ava writes her OWN account of a story and cites the outlets she read. She is
// NOT an aggregator — she never republishes another outlet's article. Facts are
// free; expression is not. (See MidlevelU v. ACI, 11th Cir. 2021: an aggregator
// that commercially summarised RSS feeds lost.)
//
// Two things in here are the whole product, and both are ENFORCED IN CODE rather
// than merely requested in a prompt — because the same trick that makes
// write_post reliable (don't ask the model to count characters; reject the post
// when the count is wrong) is what makes this reliable:
//
//   1. SYNDICATION. Reuters writes it, 47 outlets republish it. Counting those
//      as 47 sources launders one report into fake consensus. clusterCoverage()
//      collapses them, so the model is handed `independent_sources`, not a
//      flattering total it can misread.
//
//   2. QUOTES. A fabricated or misattributed quote is a libel risk and the end
//      of the product. verifyQuote() checks every quote against the text she
//      actually fetched this turn — so a quote she "remembers" cannot get into
//      an article. She doesn't have to be honest. She has to be *checkable*.

// ─── Surface-injected backends ───────────────────────────────────────────────

/** One story as an outlet actually published it. */
export interface NewsHit {
  /** The outlet's headline, verbatim. This is the bias evidence — in their words. */
  title: string;
  url: string;
  /** A short verbatim excerpt. The ONLY text a quote may be drawn from. */
  excerpt: string;
  outlet: string | null;
  age?: string | null;
  thumbnail?: string | null;
}

/** News search, injected by the surface (the web supplies Brave News). */
export type NewsSearchFn = (
  query: string,
  count?: number,
  freshness?: 'pd' | 'pw' | 'pm',
) => Promise<NewsHit[]>;

/** A finished article, on its way to the card + the drafts table. */
export interface ArticleInput {
  headline: string;
  standfirst?: string;
  body: string;
  category: string;
  sources: Array<{ outlet: string; headline: string; url: string }>;
  quotes: Array<{ text: string; speaker?: string; outlet: string; url: string }>;
  coverage?: Record<string, unknown>;
  unverified: string[];
  ava_read?: string;
  image_prompt?: string;
}

/** Article sink, injected by the surface (renders the card, saves the draft). */
export interface ArticleStore {
  save(article: ArticleInput): Promise<{ id: string | null }>;
}

/**
 * One story on the front-page menu — a story she has SEEN, and thinks is worth
 * writing. `why` is the whole point: the selection is the skill, and the operator
 * is owed her reason, not a ranked list he has to re-judge himself.
 */
export interface StorySuggestion {
  desk: string;
  headline: string;
  outlet: string;
  /** The URL she saw it at. Checked against the fetched corpus — a story that
   *  isn't in anything she pulled cannot reach the menu. */
  url: string;
  /** Why it's worth writing: what's actually at stake, or what everyone is missing. */
  why: string;
  /** Optional: how she'd come at it. */
  angle?: string;
}

/** Story-menu sink, injected by the surface (renders the front page). */
export interface StoryStore {
  suggest(stories: StorySuggestion[]): Promise<void>;
}

/**
 * Everything she fetched this turn, kept so write_article can CHECK her quotes
 * against it. Populated by research_story / fact_check; read by write_article.
 * Without this, "quote verbatim from a page you fetched" is an honour system —
 * and an honour system is exactly what we refuse to ship.
 */
export interface FetchedCorpus {
  hits: NewsHit[];
}

// ─── Syndication ─────────────────────────────────────────────────────────────

const WIRE_SERVICES = [
  'Reuters', 'Associated Press', 'AP', 'AFP', 'Agence France-Presse',
  'PA Media', 'Bloomberg', 'dpa', 'ANSA', 'EFE',
];

export interface CoverageCluster {
  outlets: Array<{ outlet: string | null; headline: string; url: string; excerpt: string }>;
  syndicated: boolean;
  wire: string | null;
  confidence: 'high' | 'likely' | 'borderline' | 'n/a';
  similarity: number;
}

function detectWire(texts: string[]): string | null {
  const blob = texts.join(' ');
  for (const w of WIRE_SERVICES) {
    // Word-boundary match so "AP" doesn't fire on "apple" or "capital".
    const re = new RegExp(`(^|[^A-Za-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z]|$)`);
    if (re.test(blob)) return w;
  }
  return null;
}

/** Normalise for comparison: case, punctuation and spacing carry no meaning here. */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function shingles(text: string, n = 5): Set<string> {
  const words = normalise(text).split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Group hits by the underlying TEXT. Several outlets in one cluster = one report
 * echoed, NOT corroboration.
 *
 * THRESHOLD — measured on live coverage, not taken from a paper. The first cut
 * used 0.45 (the textbook value for full documents) and NEVER FIRED, because the
 * search index returns a partial snippet of each article and different fragments
 * get extracted from each copy. Measured:
 *
 *   independent reporting (Guardian / ESPN / Al Jazeera, same story) . 0.02–0.06
 *   same-chain syndication (Sacramento Bee <-> Merced Sun-Star) ...... 0.175
 *   republished copy (Sharewise <-> Yahoo Finance <-> Yahoo) ......... 0.32–0.41
 *
 * A clean gap sits between ~0.06 and ~0.17, so 0.15 separates them with headroom
 * either side. Verified: it collapsed an 8-outlet Yahoo/Sharewise cluster and a
 * 2-paper McClatchy cluster, while leaving 20 genuinely independent FIFA reports
 * intact.
 *
 * Only ever run this over ONE story's coverage. On a broad category sweep it
 * would cluster unrelated articles that merely share a template.
 */
export function clusterCoverage(hits: NewsHit[], threshold = 0.15): CoverageCluster[] {
  const sigs = hits.map((h) => shingles(`${h.title} ${h.excerpt}`));
  const clusterOf = new Array<number>(hits.length).fill(-1);
  const groups: number[][] = [];
  const peak: number[] = [];

  for (let i = 0; i < hits.length; i++) {
    if (clusterOf[i] !== -1) continue;
    const id = groups.length;
    clusterOf[i] = id;
    const members = [i];
    let best = 0;
    for (let j = i + 1; j < hits.length; j++) {
      if (clusterOf[j] !== -1) continue;
      const s = jaccard(sigs[i], sigs[j]);
      if (s >= threshold) {
        clusterOf[j] = id;
        members.push(j);
        if (s > best) best = s;
      }
    }
    groups.push(members);
    peak.push(best);
  }

  return groups.map((members, idx) => {
    const outlets = members.map((i) => ({
      outlet: hits[i].outlet,
      headline: hits[i].title,
      url: hits[i].url,
      excerpt: hits[i].excerpt.slice(0, 400),
    }));
    const similarity = peak[idx];
    const syndicated = outlets.length > 1;
    // A borderline call is an HONEST call — she is told to say "I can't tell"
    // rather than pick an answer she can't support.
    const confidence: CoverageCluster['confidence'] = !syndicated
      ? 'n/a'
      : similarity >= 0.30 ? 'high'
      : similarity >= 0.20 ? 'likely'
      : 'borderline';

    return {
      outlets,
      syndicated,
      wire: detectWire(members.map((i) => `${hits[i].title} ${hits[i].excerpt}`)),
      confidence,
      similarity: Number(similarity.toFixed(3)),
    };
  });
}

/**
 * The shape the Correspondent must reason over.
 *
 * `independent_sources` is the number that means something. The total is named
 * to make it hard to misread as corroboration, because that misreading is the
 * single worst thing this product could do.
 */
export function summariseCoverage(hits: NewsHit[]) {
  const clusters = clusterCoverage(hits);
  const wire = clusters.filter((c) => c.syndicated).map((c) => c.wire).find(Boolean) ?? null;

  return {
    independent_sources: clusters.length,
    total_outlets_including_syndicated_copies: hits.length,
    wire_service_detected: wire,
    note:
      hits.length === 0
        ? 'Nothing in the index reports this. That means nobody has reported it HERE — it does NOT mean the claim is false, and you must not say it does.'
        : clusters.length === 1 && hits.length > 1
          ? `All ${hits.length} outlets are running substantially the same text${wire ? ` (${wire})` : ''}. That is ONE report echoed — not ${hits.length} sources. Say so plainly in the article.`
          : `${clusters.length} distinct piece(s) of reporting across ${hits.length} outlet(s).`,
    coverage: clusters,
    // Headlines side by side. THIS is the bias evidence — in the outlets' own
    // words. No score, no lean, no verdict. Just what each of them chose to say.
    headlines: hits.map((h) => ({ outlet: h.outlet, headline: h.title, url: h.url, age: h.age ?? null })),
  };
}

// ─── Quote verification ──────────────────────────────────────────────────────

/**
 * Does this quote actually appear in something she fetched?
 *
 * A fabricated or misattributed quote is a libel risk and the end of the
 * product. So we do not ask her to be honest — we check. Anything she cannot
 * point to in a fetched excerpt is refused, and she is told to fix it in the
 * same turn.
 *
 * We compare on the NORMALISED text, so punctuation, casing and smart-quote
 * mangling don't cause a false rejection — but the words must genuinely be
 * there, in that order.
 *
 * The honest limitation, stated: the index gives us an EXCERPT, not the whole
 * article. A real quote can legitimately live in the part we never saw. So a
 * failure here does not mean she invented it — it means she cannot evidence it,
 * and an unevidenced quote does not go in. The safe direction to fail in.
 */
export function verifyQuote(quote: string, corpus: FetchedCorpus): { ok: boolean; outlet?: string; url?: string } {
  const needle = normalise(quote);
  if (needle.length < 12) return { ok: false }; // too short to be a meaningful match

  for (const hit of corpus.hits) {
    const hay = normalise(`${hit.title} ${hit.excerpt}`);
    if (hay.includes(needle)) {
      return { ok: true, outlet: hit.outlet ?? undefined, url: hit.url };
    }
  }
  return { ok: false };
}
