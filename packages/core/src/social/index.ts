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

/**
 * Surface-injected sink for proposed hooks. The web/hub implementation collects
 * them for the post-run drain → `hooks` SSE the client renders as a picker.
 */
export interface HookStore {
  propose(hooks: HookOption[]): Promise<void>;
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
