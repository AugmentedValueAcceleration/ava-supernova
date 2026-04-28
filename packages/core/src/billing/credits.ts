// Ava Credits — value-denominated currency for metered operations.
//
// Decoupled from raw provider tokens: 1 credit ≈ $0.0038 at Pro's rate
// ($19 / 5,000 credits + rounding). Action costs reflect value delivered,
// not linear raw cost — a Flash call burns 1 credit, a full orchestration
// burns 10, a video generation burns 100. Target 55% net margin at typical
// (60%) utilisation, sized against published Qwen 3.6 Plus rates with no
// provider-discount assumption.
//
// Rebalanced 2026-04-23 after Alibaba walked back the 50% discount on
// 3.6 Plus. Prior allowances (Free 1,500 / Pro 15,000 / Ultra 35,000 /
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
  video_gen:    150,   // ~$0.48 raw (Hailuo 02 Pro 1080p 6s) — bumped 100→150 (2026-04-25)
  voice_gen:     10,   // ~$0.03 raw (Speech 2.8 HD ~500 chars) — bumped 3→10 (2026-04-25)
  music_gen:     50,   // ~$0.15 raw (Music 2.5 / 2.6 paid; Free pinned to Music 2.0 ~$0.03)
  bg_removal:     2,   // ~$0.002 raw
};

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
 *  Calibrated 2026-04-25 against published rates and the 55% net margin
 *  target. Mirror of web's credits-pricing.ts MODEL_COST_MULTIPLIER —
 *  keep them in sync; web is the authoritative billing surface and core's
 *  meter dual-writes for dataset audit. Default 1.0 for unlisted models. */
export const MODEL_COST_MULTIPLIER: Record<string, number> = {
  // V4 Pro is ~6× Qwen 3.6 Plus on input, ~2× on output. Blended 4.3× on
  // typical agentic-heavy turns. 6.0× restores margin parity with Qwen 3.6
  // (was 5.0× → ~5% margin; now 6.0× → ~21% margin). 2026-04-25 recalibration.
  'deepseek-v4-pro':            6.0,
  'deepseek-v4-pro-platform':   6.0,
  'qwen3.6-plus':               1.5,
  'qwen-plus':                  1.5,
  'qwen3.5-plus':               1.2,
  'qwen3.5-omni-plus':          1.2,
  // Mistral pricing is competitive with Qwen — Small 4 sub-1× (cheaper
  // than the anchor), Large 3 about par. Calibrated 2026-04-28 against
  // published rates: Small 4 $0.15/$0.60 ≈ 40% of Qwen 3.6 Plus blended,
  // Large 3 $0.50/$1.50 ≈ 95% of Qwen 3.6 Plus blended. Mirrors web's
  // credits-pricing.ts MODEL_COST_MULTIPLIER — keep them in sync.
  'mistral-small-4':            0.6,
  'mistral-small-4-platform':   0.6,
  'mistral-large-3':            1.4,
  'mistral-large-3-platform':   1.4,
};

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
 *  (Qwen 3.6 Plus: 5.86×, V4 Pro: 2.0×, Qwen Flash: 8×). A flat 4× weight
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
  },
): { credits: number; brackets: number } {
  const base = CREDIT_COST[action];
  const multiplier = modelCostMultiplier(opts.model);
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
  // 2026-04-23 against published Qwen 3.6 Plus rates. Entry bundle sits
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
