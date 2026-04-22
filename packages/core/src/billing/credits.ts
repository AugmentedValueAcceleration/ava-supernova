// Ava Credits — value-denominated currency for metered operations.
//
// Decoupled from raw provider tokens: 1 credit ≈ $0.0025 at Pro's rate
// ($19 / 15,000 credits + rounding). Action costs reflect value delivered,
// not linear raw cost — a Flash call burns 1 credit, a full orchestration
// burns 10, a video generation burns 100. Target 55% net margin at typical
// (60%) utilisation.
//
// Approved 2026-04-22. Stage 1 of the rollout: this module is the source
// of truth only. Stages 2-4 (meter interceptor, billing switch, UI reveal)
// haven't landed yet, so nothing consumes these constants at runtime.
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
  | 'bg_removal'      // Creative Studio — background removal
  | 'teach_session';  // Teach-mode session (~20 min of tutoring)

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
  image_gen:     10,   // ~$0.02 raw
  video_gen:    100,   // ~$0.40 raw (6s clip)
  voice_gen:      3,   // ~$0.005 raw
  music_gen:     50,   // ~$0.15 raw (longer duration than TTS, shorter than video)
  bg_removal:     2,   // ~$0.002 raw
  teach_session:  2,   // ~$0.003 raw — heavily discounted, not free
};

// ── Cache-hit discount ────────────────────────────────────────────────────
/** When the provider reports a prompt-cache hit, the user pays 0.3× the
 *  normal credit cost. We pass ~70% of the saving to the user and keep
 *  ~30% as a margin cushion for the infra running the cache. Minimum 1
 *  credit is deducted so cache hits are never free (avoids gaming). */
export const CACHE_HIT_MULTIPLIER = 0.3;

/** Compute the credits to deduct for a single metered action. */
export function creditsFor(
  action: CreditAction,
  opts?: { cacheHit?: boolean },
): number {
  const base = CREDIT_COST[action];
  if (opts?.cacheHit) return Math.max(1, Math.round(base * CACHE_HIT_MULTIPLIER));
  return base;
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
    credits: 1_500,
    storageGb: 2,
    rateLimit: 20,
    approximateMixedActions: 750,
  },
  pro: {
    name: 'Pro',
    price: 19,
    credits: 15_000,
    storageGb: 50,
    rateLimit: 60,
    approximateMixedActions: 3_000,
  },
  ultra: {
    name: 'Ultra',
    price: 39,
    credits: 35_000,
    storageGb: 200,
    rateLimit: 120,
    approximateMixedActions: 7_000,
  },
  enterprise: {
    name: 'Enterprise',
    price: 79,
    credits: 75_000,
    storageGb: 500,
    rateLimit: 200,
    approximateMixedActions: 15_000,
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
  // Credit quantities chosen so every larger bundle improves $/credit (volume
  // reward) while the entry bundle sits above Pro's per-credit rate (power-user
  // premium for on-demand boosts outside a plan renewal).
  { id: 'credits_1500',  credits:  1_500, price:  3, label: '1.5K credits', subtitle: 'Quick boost', effectiveRate: '$2.00 / 1K credits' },
  { id: 'credits_6000',  credits:  6_000, price:  8, label: '6K credits',   subtitle: 'Best value',  effectiveRate: '$1.33 / 1K credits', popular: true },
  { id: 'credits_12500', credits: 12_500, price: 15, label: '12.5K credits', subtitle: 'Power user', effectiveRate: '$1.20 / 1K credits' },
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
