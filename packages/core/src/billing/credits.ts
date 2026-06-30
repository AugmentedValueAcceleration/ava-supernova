// Ava Credits — value-denominated currency for metered operations.
//
// Decoupled from raw provider tokens: 1 credit ≈ $0.0038 at Pro's rate
// ($19 / 5,000 credits + rounding). Action costs reflect value delivered,
// not linear raw cost — a Flash call burns 1 credit, a full orchestration
// burns 10, a video generation burns 100. Target 55% net margin at typical
// (60%) utilisation, sized against published Qwen 3.7 Plus rates with no
// provider-discount assumption.
//
// Rebalanced 2026-04-23 after Alibaba walked back the 50% discount on
// 3.7 Plus. Prior allowances (Free 1,500 / Pro 15,000 / Ultra 35,000 /
// Enterprise 75,000) were penciled against a $0.0025/credit design and a
// discount cushion, neither of which held at launch. New allowances
// (5K / 10K / 20K paid) make 55% margin achievable on published rates.
// Existing users stay on their current cycle's higher allowance — the
// rollover logic in increment_credits (migration 203) materialises new
// rates on the next period boundary, no forced clawback.
//
// Everything here is pure data + pure helpers — no runtime deps, safe to
// import from any surface that takes @ava/core.

import type { PlanTier } from './plans.js';

// ── Action catalog ────────────────────────────────────────────────────────
/** Every metered operation has an action type. Stage 2's meter interceptor
 *  will tag each LLM / generation / Creative-Studio call with one of these
 *  so the usage pipeline can map it to a credit cost.
 *
 *  Actions are the *unit of user intent* ("you just did X"), not the
 *  underlying provider cost. Two different models running the same action
 *  cost the user the same credits; raw provider cost varies underneath. */
export type CreditAction =
  | 'chat_turn'       // main agent turn on heavy model (Qwen Plus / M2.7)
  | 'light_call'      // intent gate / routing / classifier — Flash
  | 'heavy_persona'   // Architect / Builder / heavy-tier persona on heavy model
  | 'light_persona'   // Scout / Verifier / Challenger on Flash
  | 'orchestration'   // Conductor full run — charged once per orchestrate()
  | 'image_gen'       // Creative Studio — image generation
  | 'video_gen'       // Creative Studio — video generation (6s clip)
  | 'voice_gen'       // Creative Studio — TTS
  | 'music_gen'       // Creative Studio — music generation
  | 'bg_removal';     // Creative Studio — background removal
// Teach mode bills as normal chat_turn — no special session-based action.
// The prior design carved out teach_session here but no call site ever
// used it, which meant Teach charged per-turn anyway. Dropped so the
// cost table reflects reality.

// ── Credit cost per action ────────────────────────────────────────────────
/** Base credit cost for each action. Cache-hit discount applies per-call
 *  via creditsFor(). Raw provider cost column is illustrative (typical mid-
 *  2026 rates) — it drifts, which is exactly why we decouple from it. */
export const CREDIT_COST: Record<CreditAction, number> = {
  chat_turn:      2,   // ~$0.0006 raw
  light_call:     1,   // ~$0.0001 raw
  heavy_persona:  3,   // ~$0.0009 raw
  light_persona:  1,   // ~$0.0001 raw
  orchestration: 10,   // ~$0.003 raw (4-6 personas combined)
  image_gen:     12,   // ~$0.04 raw (Hailuo image-01) — bumped 10→12 (2026-04-25 calibration)
  video_gen:    150,   // 720p base tier — see VIDEO_GEN_CREDITS for resolution tiers
  voice_gen:     10,   // ~$0.03 raw (Speech 2.8 HD ~500 chars) — bumped 3→10 (2026-04-25)
  music_gen:     50,   // ~$0.15 raw (Music 2.5 / 2.6 paid; Free pinned to Music 2.0 ~$0.03)
  bg_removal:     2,   // ~$0.002 raw
};

/**
 * Video credits scale with Wan output resolution. 720p is the base; 1080p
 * costs ~2× because Wan's per-clip cost roughly doubles, holding the same
 * margin. Charge is flat across clip duration. Kept in sync with the web
 * platform's credits-pricing VIDEO_GEN_CREDITS. `video_gen` above is the
 * 720p base for callers that don't tier.
 */
export const VIDEO_GEN_CREDITS: Record<'480' | '720' | '1080', number> = {
  '480': 100,   // ~$0.25/clip
  '720': 150,   // ~$0.50/clip — base tier
  '1080': 300,  // ~$1.00/clip — 2× the 720p tier
};

export function videoCreditCost(sr: number | string | null | undefined): number {
  const key = String(sr ?? 720) as '480' | '720' | '1080';
  return VIDEO_GEN_CREDITS[key] ?? VIDEO_GEN_CREDITS['720'];
}

// ── Cache-hit discount ────────────────────────────────────────────────────
/** Default cache-hit discount: user pays 0.3× normal cost when the provider
 *  reports a prompt-cache hit. Cache savings on input-heavy turns roughly
 *  match this; output cost is unaffected by cache so on output-heavy models
 *  (V4 Pro) a flat 0.3× whole-turn discount over-credits the user and the
 *  margin can flip negative — see CACHE_HIT_MULTIPLIER_BY_MODEL.
 *
 *  Minimum 1 credit is deducted so cache hits are never free. */
export const CACHE_HIT_MULTIPLIER = 0.3;

/** Per-model cache-hit discount override. Output-heavy models cap the
 *  discount at 0.5× because the input share of total cost is smaller, so
 *  a 0.3× whole-turn discount exceeds actual savings. Calibrated 2026-04-25.
 *  Default 0.3× still applies for any model not listed. */
export const CACHE_HIT_MULTIPLIER_BY_MODEL: Record<string, number> = {
  'deepseek-v4-pro':            0.5,
  'deepseek-v4-pro-platform':   0.5,
};

/** Look up the cache-hit multiplier for a given model id. */
export function cacheHitMultiplier(model: string | null | undefined): number {
  if (!model) return CACHE_HIT_MULTIPLIER;
  const id = model.includes(':') ? model.split(':')[1] : model;
  return CACHE_HIT_MULTIPLIER_BY_MODEL[id] ?? CACHE_HIT_MULTIPLIER;
}

// ── Per-model cost multiplier ─────────────────────────────────────────────
/** Action costs are flat brackets (chat_turn = 2, heavy_persona = 3, etc.)
 *  but per-token spend varies wildly by model — V4 Pro is ~17× the cost of
 *  Qwen Flash for the same input. Without a per-model adjustment, V4 Pro
 *  on chat_turn loses money on every call. The multiplier scales the
 *  bracket cost to track actual spend.
 *
 *  Recalibrated 2026-04-29 to a 40% net margin target (was 55%). Trade
 *  is deliberate — thinner margin per existing user, materially more
 *  credits per dollar, the difference goes back to the user. Lever for
 *  conversion: Free's allowance now feels like a real evaluation tool
 *  rather than a paywall teaser, and Pro's daily Maestro budget roughly
 *  doubles at the same price. "Value over margin" — sustainability
 *  floor, not ceiling.
 *
 *  Mirror of web's credits-pricing.ts MODEL_COST_MULTIPLIER — keep them
 *  in sync; web is the authoritative billing surface and core's meter
 *  dual-writes for dataset audit. Default 1.0 for unlisted models. */
export const MODEL_COST_MULTIPLIER: Record<string, number> = {
  // V4 Pro: 3.75 → 0.9. The 3.75× was calibrated against a wrong, 4×-inflated
  // price ($1.74/$3.48); the real price is $0.435/$0.87, so the multiplier
  // scales down ~4× to restore the 40% margin. V4 Pro is the Supernova
  // coordinator — this stops a ~4× overcharge on every orchestration.
  'deepseek-v4-pro':            0.9,
  'deepseek-v4-pro-platform':   0.9,
  // V4 Flash: explicit 0.5× (was falling through to default 1.0×, which
  // would over-charge it relative to its $0.14/$0.28 per-million rate).
  // Now Supernova's chat tier — fast, MIT open-weight, 13B active params,
  // 2 credits per typical chat turn at the 40% margin floor.
  'deepseek-v4-flash':            0.5,
  'deepseek-v4-flash-platform':   0.5,
  // Qwen 3.7 Plus: 1.5 → 0.7. Maestro chat used to charge 6 credits/turn
  // (~79% margin); now 3 credits (~40%). The biggest concrete win for
  // users — daily-driver Maestro doubles at the same plan price.
  'qwen3.7-plus':               0.7,
  'qwen-plus':                  0.7,
  'qwen3.5-plus':               0.6,
  'qwen3.5-omni-plus':          0.6,
  // Qwen 3.5 Flash + Omni Flash — added 2026-04-30 when v0.59.0 routed
  // Maestro chat / image_gen / intent gate to 3.5 Flash and Supernova
  // image_gen orchestration to Omni Flash. Without explicit entries they
  // fell through to default 1.0× which over-charged relative to their
  // actual per-million rates ($0.07/$0.26 for Flash). 0.3× (Flash) and
  // 0.4× (Omni Flash, vision encoder lift) keeps margin at the 40% floor
  // while passing the genuine cost saving through to users.
  'qwen3.5-flash':              0.3,
  'qwen-flash':                 0.3,
  'qwen3.5-omni-flash':         0.4,
  // Mistral Small 4: 0.6 → 1.15. The old 0.6× was calibrated against a wrong,
  // too-low price ($0.10/$0.30); the real price is $0.15/$0.60 (~1.9× higher
  // blended), so the multiplier scales ~1.9× to restore the 40% margin target.
  // Sits below Large 3 (1.25×, pricier) as it should. Small 4 is now Aurora's
  // high-volume workhorse, so this drives a lot of turns — calibrating it
  // right matters.
  'mistral-small-4':            1.15,
  'mistral-small-4-platform':   1.15,
  // Mistral Large 3: 1.25× — cost-accurate at $0.50/$1.50 (price unchanged).
  // Now Aurora's heavy reserve/fallback, not the coordinator, so it sees
  // far less traffic.
  'mistral-large-3':            1.25,
  'mistral-large-3-platform':   1.25,
  // Mistral Medium 3.5: 3.0 → 4.25. The ONE multiplier that goes UP at
  // the 40% rebalance — it was sitting at ~36% margin (below the new
  // floor) because the original 3.0× was set against a 55% target with
  // a 1.3× Aurora mode bump on top, not against 40% with a flat mode.
  // Raising the model multiplier directly is more honest than hiding
  // the cost in an Aurora-only mode bump (which would lie about
  // Medium 3.5's per-model cost when used outside Aurora).
  'mistral-medium-3.5':           4.25,
  'mistral-medium-3.5-platform':  4.25,
};

/** Per-mode cost multiplier — applied AFTER the model multiplier in
 *  `creditsForTurn` / `creditsFor`. Lets a mode price itself based on
 *  the richness of its specialist fleet, independent of which model
 *  the orchestrator picks for a given role.
 *
 *  All modes 1.0× as of the 2026-04-29 40% rebalance. Aurora used to
 *  carry a 1.3× bump to compensate for Medium 3.5's price; that's been
 *  folded into the per-model multiplier (Medium 3.5 = 4.25×) instead.
 *  Per-model is the honest place to scale model cost — a BYOK user
 *  picking Medium 3.5 directly outside Aurora pays the same per-token
 *  rate the model genuinely costs us. The mode multiplier stays in the
 *  architecture as a future hook (premium-tier modes, billed-by-mode
 *  experiments) but no mode currently uses it. */
export const MODE_COST_MULTIPLIER: Record<string, number> = {
  aurora:    1.0,
  supernova: 1.0,
  maestro:   1.0,
  auto:      1.0, // alias used by clients — same as maestro
};

/** Apply per-mode cost multiplier. Default 1.0 for unlisted modes. */
export function modeCostMultiplier(mode: string | null | undefined): number {
  if (!mode) return 1.0;
  return MODE_COST_MULTIPLIER[mode.toLowerCase()] ?? 1.0;
}

/** Apply per-model cost multiplier. Strips provider prefix if present. */
export function modelCostMultiplier(model: string | null | undefined): number {
  if (!model) return 1.0;
  const id = model.includes(':') ? model.split(':')[1] : model;
  return MODEL_COST_MULTIPLIER[id] ?? 1.0;
}

/** Compute the credits to deduct for a single metered action.
 *  Pass `model` to apply the per-model cost multiplier — strongly
 *  recommended for any LLM call. Defaults to 1.0× when omitted. */
export function creditsFor(
  action: CreditAction,
  opts?: { cacheHit?: boolean; model?: string },
): number {
  const base = CREDIT_COST[action];
  const multiplier = modelCostMultiplier(opts?.model);
  const scaled = base * multiplier;
  if (opts?.cacheHit) {
    const cacheMult = cacheHitMultiplier(opts?.model);
    return Math.max(1, Math.round(scaled * cacheMult));
  }
  return Math.max(1, Math.round(scaled));
}

// ── Health-plan generation pricing ────────────────────────────────────────
/** A generated multi-week health plan: training only, nutrition only, or both. */
export type HealthPlanKind = 'fitness' | 'meal' | 'combined';

/** Per-week credit rate for plan generation. Combined ≈ 2× single because it
 *  weaves two domains (training + nutrition). Approved 2026-06-30. */
export const PLAN_CREDITS_PER_WEEK: Record<'single' | 'combined', number> = {
  single: 5,
  combined: 10,
};

/**
 * Flat credit cost to generate a health plan — the single, predictable price
 * that REPLACES per-turn billing for plan generation (the route that builds
 * the plan server-side charges this once instead of metering each turn).
 *
 * Scales by whole weeks (min 1), so a 1- or 7-day plan is one week and an
 * 84-day plan is twelve. Single (fitness | meal) = 5 cr/week; combined = 10.
 *   single 7d = 5 · 28d = 20 · 84d = 60
 *   combined 7d = 10 · 28d = 40 · 84d = 120
 */
export function creditsForPlan(type: HealthPlanKind, durationDays: number): number {
  const weeks = Math.max(1, Math.ceil((durationDays || 1) / 7));
  const perWeek = type === 'combined' ? PLAN_CREDITS_PER_WEEK.combined : PLAN_CREDITS_PER_WEEK.single;
  return weeks * perWeek;
}

// ── Token-bracket scaling (proposal H, 2026-04-25) ────────────────────────
/** LLM-style actions that scale by token count. Media actions (image_gen,
 *  video_gen, etc.) keep flat charging since they have no token concept. */
const TOKEN_SCALING_ACTIONS: ReadonlySet<CreditAction> = new Set([
  'chat_turn', 'light_call', 'heavy_persona', 'light_persona', 'orchestration',
]);

/** Bracket size in effective tokens — one bracket = the flat per-action
 *  charge. A typical agentic turn (~16K input + ~2K output, weighted to
 *  ~24K effective) lands in 1-2 brackets. Larger turns scale linearly. */
export const TOKENS_PER_BRACKET = 16_000;

/** Output tokens cost ~3-6× more than input across our model lineup
 *  (Qwen 3.7 Plus: 5.86×, V4 Pro: 2.0×, Qwen Flash: 8×). A flat 4× weight
 *  is the reasonable midpoint without per-model pricing tables here.
 *  The cache discount weight (0.1×) reflects ~90% provider cache savings. */
export const OUTPUT_TOKEN_WEIGHT = 4;
export const CACHED_TOKEN_WEIGHT = 0.1;

/** Token-aware credit cost for a single LLM turn. Replaces flat
 *  `creditsFor(action)` for chat-like actions when prompt/output token
 *  counts are known. Behaviour:
 *
 *    1. Compute effective_tokens = nonCachedInput + 0.1×cachedInput +
 *       4×output. Captures both the input volume and the output-cost
 *       weight without a per-model pricing table.
 *    2. brackets = ceil(effective_tokens / TOKENS_PER_BRACKET), min 1.
 *    3. credits = max(flatScaled, brackets × base × multiplier).
 *
 *  Effect: small turns charge the flat per-action rate (no surprise
 *  for users on light chat). Long-context turns (200K input, 1M context)
 *  scale up so they actually pay for themselves at the COGS layer.
 *
 *  Cache discount is folded into effective_tokens via CACHED_TOKEN_WEIGHT
 *  rather than applied as a second multiplier — applying both would
 *  double-discount cache. Small-turn cache hits still use the legacy
 *  whole-turn discount via creditsFor() since brackets=1 short-circuits. */
export function creditsForTurn(
  action: CreditAction,
  opts: {
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    model?: string;
    /** Orchestrated mode in play — drives the mode-cost multiplier
     *  (Aurora 1.3×, Maestro/Supernova 1.0×). Layered on top of the
     *  per-model multiplier so a richer fleet pays for itself without
     *  lying about model cost. Optional — omitted = 1.0×. */
    mode?: string;
  },
): { credits: number; brackets: number } {
  const base = CREDIT_COST[action];
  const multiplier = modelCostMultiplier(opts.model) * modeCostMultiplier(opts.mode);
  const flatScaled = Math.max(1, Math.round(base * multiplier));

  // Non-LLM actions (image/video/voice/music/bg_removal) ignore tokens.
  if (!TOKEN_SCALING_ACTIONS.has(action)) {
    return { credits: flatScaled, brackets: 1 };
  }

  const inputTokens = opts.inputTokens ?? 0;
  const outputTokens = opts.outputTokens ?? 0;
  const cachedTokens = Math.min(opts.cachedTokens ?? 0, inputTokens);
  const nonCachedInput = inputTokens - cachedTokens;

  const effectiveTokens =
    nonCachedInput +
    cachedTokens * CACHED_TOKEN_WEIGHT +
    outputTokens * OUTPUT_TOKEN_WEIGHT;

  const brackets = Math.max(1, Math.ceil(effectiveTokens / TOKENS_PER_BRACKET));

  if (brackets === 1) {
    // Small-turn path — preserve existing cache-discount semantics.
    const cacheHit = inputTokens > 0 && cachedTokens / inputTokens > 0.5;
    if (cacheHit) {
      const cacheMult = cacheHitMultiplier(opts.model);
      return { credits: Math.max(1, Math.round(flatScaled * cacheMult)), brackets };
    }
    return { credits: flatScaled, brackets };
  }

  // Long-turn path — proportional charge. Cache already weighted into
  // effective_tokens, don't apply a second discount.
  const proportional = Math.max(1, Math.round(brackets * base * multiplier));
  return { credits: Math.max(flatScaled, proportional), brackets };
}

// ── Credit-based plan definitions ─────────────────────────────────────────
/** New plan shape for the credit-based era. Kept separate from the legacy
 *  PLANS export in plans.ts so Stages 2-3 can dual-write without breaking
 *  existing consumers of token-based allowances. When Stage 3 flips billing
 *  to credits, plans.ts becomes display-only / deprecated. */
export interface CreditPlanDefinition {
  name: string;
  price: number;              // USD / month
  credits: number;            // monthly allowance
  storageGb: number;
  rateLimit: number;          // API requests per minute
  /** Rough ceiling of mixed actions per month. Pitch copy number, not a
   *  hard metering rule. Derived from a typical workload mix: 60% chat,
   *  20% orchestrated, 15% Creative, 5% Teach. */
  approximateMixedActions: number;
}

export const CREDIT_PLANS: Record<PlanTier, CreditPlanDefinition> = {
  free: {
    name: 'Free',
    price: 0,
    credits: 300,
    storageGb: 2,
    rateLimit: 20,
    approximateMixedActions: 150,
  },
  pro: {
    name: 'Pro',
    price: 19,
    credits: 5_000,
    storageGb: 50,
    rateLimit: 60,
    approximateMixedActions: 1_000,
  },
  ultra: {
    name: 'Ultra',
    price: 39,
    credits: 10_000,
    storageGb: 200,
    rateLimit: 120,
    approximateMixedActions: 2_000,
  },
  enterprise: {
    name: 'Enterprise',
    price: 79,
    credits: 20_000,
    storageGb: 500,
    rateLimit: 200,
    approximateMixedActions: 4_000,
  },
  admin: {
    name: 'Admin',
    price: 0,
    credits: 9_999_999,
    storageGb: 10_000,
    rateLimit: 999,
    approximateMixedActions: 9_999_999,
  },
};

// ── Credit top-ups ────────────────────────────────────────────────────────
/** Credit-denominated top-ups. Priced to land 60-70% net margin per bundle.
 *  Sized to be crisp human units (1.5K, 6K, 15K) rather than arbitrary
 *  multiples, so users can budget against the plans (1.5K matches Free's
 *  monthly, 15K matches Pro's monthly). */
export interface CreditTopupDefinition {
  id: 'credits_1500' | 'credits_6000' | 'credits_12500';
  credits: number;
  price: number;
  label: string;
  subtitle: string;
  /** Pre-computed rate for UI comparison — don't duplicate the maths. */
  effectiveRate: string;
  popular?: boolean;
}

export const CREDIT_TOPUPS: CreditTopupDefinition[] = [
  // Prices pinned to the existing token-top-up Stripe Prices ($3 / $8 / $15).
  // IDs (`credits_1500` etc.) are legacy identifiers — the number in the id
  // is the pre-rebalance credit count, not the current one. Don't rename
  // without rotating Stripe Price mappings too. Credit quantities rebalanced
  // 2026-04-23 against published Qwen 3.7 Plus rates. Entry bundle sits
  // slightly worse than Pro's per-credit rate (nudges to plan), middle
  // bundle matches plan, top bundle rewards larger top-up with a 6% discount.
  { id: 'credits_1500',  credits:   750, price:  3, label: '750 credits',   subtitle: 'Quick boost', effectiveRate: '$4.00 / 1K credits' },
  { id: 'credits_6000',  credits: 2_000, price:  8, label: '2,000 credits', subtitle: 'Best value',  effectiveRate: '$4.00 / 1K credits', popular: true },
  { id: 'credits_12500', credits: 4_000, price: 15, label: '4,000 credits', subtitle: 'Power user',  effectiveRate: '$3.75 / 1K credits' },
];

// ── Expected monthly burn (reference) ─────────────────────────────────────
/** Net margin targets modelled into plan sizing. Used by the admin hub's
 *  financials page + anywhere we want to sanity-check plan economics at a
 *  glance. Not consumed at billing time. */
export const MARGIN_TARGETS = {
  typicalNetMargin: 0.55,    // 55% at 60% utilisation — design point
  maxUtilisationNet: 0.30,   // 30% floor at 100% utilisation — safety
  freeSubsidyPerUser: 0.72,  // USD / month worst case on Free
} as const;
