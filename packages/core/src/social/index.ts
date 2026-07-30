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

/** A finished short-form video post: the clip, the voiceover, and the caption. */
export interface VideoPostInput {
  /** tiktok | instagram | youtube | facebook — all vertical short-form. */
  platform: string;
  /** What is ON SCREEN, as a generation prompt. */
  visual: string;
  /** What she SAYS over it. Empty for a silent clip carried by on-screen text. */
  script?: string;
  /** The caption — the post itself. */
  caption: string;
  /** Clip length in seconds. */
  duration?: number;
  title?: string;
  hashtags?: string[];
  tagNote?: string;
  /**
   * Fix the dice. Without a seed every regeneration lands in a different
   * universe, so changing one word and comparing is impossible — you are not
   * iterating, you are re-rolling. Pass the seed a previous clip reported to
   * change ONE thing and see only that thing change.
   */
  seed?: number;
  /**
   * A dish we already have a photograph of. Naming one animates OUR hero image
   * instead of generating a plausible stranger's version of the dish.
   *
   * Food is the right subject for this and a squat is not: there is no anatomy
   * to get wrong, and the motion food wants — steam, a slow push, light moving
   * across a surface — is exactly what these models do well. The picture is
   * already the dish; animating it does not make it a different dish.
   */
  recipe?: string;
}

/** What the surface reports back once the job is accepted. */
export interface VideoPostWritten {
  /** Generation job id — the surface polls this; the clip is NOT ready yet. */
  taskId: string;
  /** The seed actually used. Reported so the next attempt can reuse it and
   *  change one thing, rather than starting from scratch. */
  seed: number;
  /** The dish whose hero image became the first frame, when one was found.
   *  Null when she named a recipe we have no photograph of — she is told, so
   *  she does not claim the clip shows our dish when it was generated. */
  recipeImageUsed?: string | null;
  /** False when the voiceover failed, so the clip carries the model's own dub
   *  rather than her voice. She must say so rather than let it pass as hers. */
  voiced: boolean;
  voiceError?: string | null;
}

/**
 * Surface-injected sink for finished video posts.
 *
 * The split matters: core validates and enforces the caption cap (surface-free
 * work it can do anywhere), while the IMPLEMENTATION renders the voiceover and
 * submits the generation job — because those need provider keys and a wallet,
 * which core has no business holding. Same shape as PostStore, one extra fact:
 * write() returns a job, not a finished video, because generation outlives the
 * turn and the caption is usable long before the picture is.
 */
export interface VideoPostStore {
  write(post: VideoPostInput): Promise<VideoPostWritten>;
}

/** Caption caps for the short-form platforms. Same deterministic enforcement as
 *  POST_HARD_LIMITS — models cannot count characters, so we count for them. */
export const VIDEO_CAPTION_LIMITS: Readonly<Record<string, number>> = {
  tiktok: 4000,
  instagram: 2200,
  youtube: 5000,
  facebook: 63206,
};

/**
 * Image size per platform, in the `width*height` form DashScope takes.
 *
 * DERIVED, never chosen. A model that can pick a resolution can pick the wrong
 * one, and a 1:1 image on a Reel is a wasted generation — so the tool looks the
 * size up from the platform and the model never sees a dimension at all.
 *
 * Facebook is the trap and the reason the key is platform + FORMAT rather than
 * platform alone: its feed wants 1.91:1 and its Reels want 9:16, so "facebook"
 * on its own cannot answer the question.
 */
export const PLATFORM_IMAGE_SPECS: Readonly<Record<string, string>> = {
  // Vertical short-form — the full screen.
  'tiktok': '1080*1920',
  'instagram:reel': '1080*1920',
  'instagram:story': '1080*1920',
  'youtube:short': '1080*1920',
  'facebook:reel': '1080*1920',
  // Instagram's feed: 4:5 over 1:1, because it takes more vertical screen and
  // therefore more of the scroll.
  'instagram': '1080*1350',
  'instagram:feed': '1080*1350',
  // Landscape / link-card shapes.
  'tweet': '1600*900',
  'x': '1600*900',
  'youtube': '1600*900',
  'linkedin': '1200*628',
  'facebook': '1200*628',
  'facebook:feed': '1200*628',
  // Long-form headers and anything without a native shape.
  'blog': '1600*900',
  'post': '1280*1280',
};

/** Resolve a platform (optionally `platform:format`) to a DashScope size.
 *  Falls back to square rather than guessing — a square crops to anything. */
export function imageSizeFor(platform: string, format?: string): string {
  const key = format ? `${platform}:${format}`.toLowerCase() : platform.toLowerCase();
  return PLATFORM_IMAGE_SPECS[key]
    ?? PLATFORM_IMAGE_SPECS[platform.toLowerCase()]
    ?? '1280*1280';
}

/** A picture for a post — generated, or REPAIRED from one that already exists. */
export interface PostImageInput {
  /** What the picture shows. */
  prompt: string;
  /** Target platform — decides the size. */
  platform: string;
  /** Optional format within a platform ('feed' | 'reel' | 'story'). Facebook
   *  and Instagram both mean different shapes depending on this. */
  format?: string;
  /**
   * An existing image to EDIT rather than replace. Its presence switches the
   * model to the edit family, so "make the headline bigger" changes only the
   * headline instead of rolling a new picture and losing what already worked.
   */
  referenceImage?: string;
  /** What to keep out of the frame. */
  negativePrompt?: string;
  title?: string;
}

/** What the surface reports back once the picture exists. */
export interface PostImageWritten {
  url: string;
  /** The size actually used, so she can state it without guessing. */
  size: string;
  /** True when this was an edit of a supplied image rather than a fresh one. */
  edited: boolean;
}

/**
 * Surface-injected sink for post images. Core validates and derives the size;
 * the implementation holds the provider key and makes the call.
 */
export interface PostImageStore {
  write(image: PostImageInput): Promise<PostImageWritten>;
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
  facebook: 'Facebook Page: 0-2 hashtags max, tag stacks read as spam. Mixed crowd — some builders, but mostly people who just want the thing to work, so plain language over jargon and lead with what it does for them. Long-form is fine here; a story lands better than a headline. Link at the end is fine.',
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
