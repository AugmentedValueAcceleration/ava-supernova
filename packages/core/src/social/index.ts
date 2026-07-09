// ─── Social types — the Social Studio's shared contracts ────────────────────
//
// Ava's Social Media Manager persona (the Posts floor) runs on the core Agent.
// Her write_post / propose_hooks tools produce cards + hook options that the
// SURFACE renders — but core can't touch the surface (or the platform DB), so
// they go through injected stores in sharedState, exactly like the health
// tools' HealthPlanStore. The hub/web supplies the concrete stores (which
// persist to the Library and emit the SSE the client draws), core just defines
// the contract and does the surface-free logic (validation, char limits).

/** A finished post the model emitted via write_post, normalised. */
export interface SocialPostInput {
  /** Target platform id — 'tweet', 'bluesky', 'linkedin', … (see write_post enum). */
  platform: string;
  /** Copy-paste-ready post body, hashtags + link inline. */
  content: string;
  /** Optional short library title. */
  title?: string | null;
  /** Optional variant label when writing several versions of one post. */
  variant?: string | null;
  /** Hashtags chosen for this post (no leading '#'), for the editable chip row. */
  hashtags?: string[];
  /** One line on the reach/niche tag split, shown under the chips. */
  tagNote?: string | null;
}

/** What the store returns after a post is written. */
export interface SocialPostWritten {
  /** Stable id for this card this turn. */
  id: string;
  /** Library asset id when the surface auto-saved it as a draft; null otherwise. */
  assetId?: string | null;
}

/**
 * Surface-injected sink for finished posts. The web/hub implementation
 * auto-saves to the Library (creative_assets) and collects the card for the
 * post-run drain → canvas_update SSE. Core only calls write().
 */
export interface PostStore {
  write(post: SocialPostInput): Promise<SocialPostWritten>;
}

/** A hook option the model proposed via propose_hooks. */
export interface HookOption {
  /** The opening line itself. */
  hook: string;
  /** One-line angle/rationale for this hook. */
  angle?: string | null;
}

/** A set of candidate hooks for one subject, for the client to render as a picker. */
export interface HookProposal {
  /** The subject the hooks are for — echoed so the follow-up turn has context. */
  subject: string;
  /** Target platform for the eventual post. */
  platform: string;
  /** 1–3 candidate opening lines. */
  hooks: HookOption[];
}

/**
 * Surface-injected sink for proposed hooks. The web/hub implementation collects
 * the proposal for the post-run drain → `hooks` SSE the client renders as a picker.
 */
export interface HookStore {
  propose(proposal: HookProposal): Promise<void>;
}

/**
 * Per-platform hard character caps (by code point — emoji count as 1). Single-
 * post platforms with a real cap only; threads are per-tweet and long-form caps
 * are rarely hit. The single source of truth shared by the core write_post tool
 * and any surface that pre-validates. Kept here so both agree on one map.
 */
export const POST_HARD_LIMITS: Readonly<Record<string, number>> = {
  tweet: 280,
  bluesky: 300,
  eurosky: 300,
  instagram: 2200,
  linkedin: 3000,
  tiktok: 4000,
  facebook: 63206,
};

/** Per-platform hashtag/link policy — returned by research_post so Ava picks
 *  tags within the platform's real conventions. Single source of truth. */
export const PLATFORM_TAG_POLICY: Readonly<Record<string, string>> = {
  tweet: 'X: ~6 hashtags. Bimodal crowd — mix genre/theme tags with dev tags (#buildinpublic #IndieDev #aitools). URL allowed.',
  thread: 'X thread: hashtags on the final tweet only, ~3-4. URL on the last tweet.',
  tiktok: 'TikTok: 5 hashtags HARD CAP, genre/theme-only — mixing dev tags splits the algo signal. No URL. Avoid #fyp #foryou #foryoupage (oversaturated).',
  youtube: 'YouTube Shorts: #Shorts always FIRST, top 3 show above the title. 15 max but >15 = ALL ignored. No URL surfaced in the Shorts feed.',
  linkedin: 'LinkedIn: 3 hashtags max, professional. Link at the end is fine.',
  bluesky: 'Bluesky: 1-2 hashtags max — technical / open-source / federated crowd, low tolerance for tag stacks. 300 char cap.',
  facebook: 'Facebook dev groups: 0-2 hashtags max — peer-to-peer dev space, tag stacks read as spam. Link at the end is fine. Write like a builder posting in a group of builders, not a brand page.',
  instagram: 'Instagram: ~8-12 relevant tags, niche over generic; first few matter most.',
  blog: 'Blog: no hashtags.',
};

/** A single web-search hit. */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Surface-injected web-search backend (the web supplies Brave, key server-side).
 * research_post / suggest_beats call it to ground a post in the present.
 * `freshness` biases toward recent results (pd/pw/pm/py = past day/week/month/year).
 */
export type WebSearchFn = (
  query: string,
  max?: number,
  freshness?: 'pd' | 'pw' | 'pm' | 'py',
) => Promise<WebSearchResult[]>;

/** One tracked post's engagement (Bluesky — the platform we auto-track). */
export interface PostMetric {
  content: string;
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  quotes: number | null;
}

/**
 * Surface-injected reader for post performance. The web/hub implementation binds
 * the user + queries `scheduled_posts` (Bluesky, posted, metrics synced); core
 * does the sort/format. Returns up to ~50 recent tracked posts, newest first.
 */
export interface PostMetricsReader {
  recent(): Promise<PostMetric[]>;
}

/** One suggested angle for the day's briefing. */
export interface Beat {
  /** The angle/idea for a post. */
  angle: string;
  /** Suggested platform for it. */
  platform: string;
  /** One line on why it fits the mission / the moment. */
  why: string;
}

/**
 * Surface-injected sink for the day's suggested beats. The web/hub
 * implementation collects them for the post-run drain → `beats` SSE the client
 * renders as the briefing (a menu the operator picks from).
 */
export interface BeatStore {
  suggest(beats: Beat[]): Promise<void>;
}
