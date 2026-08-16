// Ava Credits — value-denominated currency for metered operations.
//
// Decoupled from raw provider tokens: 1 credit ≈ $0.0038 at Pro's rate
// ($19 / 5,000 credits + rounding). Action costs reflect value delivered,
// not linear raw cost — a Flash call burns 1 credit, a full orchestration
// burns 10, a video generation burns 100. Target 30% net margin at typical
// (60%) utilisation (was 55% → 40% → 30%; see MODEL_COST_MULTIPLIER), sized
// against published Qwen 3.7 Plus rates with no provider-discount assumption.
//
// Rebalanced 2026-04-23 after Alibaba walked back the 50% discount on
// 3.7 Plus. Prior allowances (Free 1,500 / Pro 15,000 / Ultra 35,000 /
// Enterprise 75,000) were penciled against a $0.0025/credit design and a
// discount cushion, neither of which held at launch. New allowances
// (5K / 10K / 20K paid) were sized for margin on published rates.
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
  | 'video_gen'       // Creative Studio — video generation (5s/10s clip)
  | 'voice_gen'       // Creative Studio — TTS
  | 'music_gen'       // Creative Studio — music generation
  | 'logo_gen'        // Creative Studio — logo (construction, no model cost; value-priced)
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
  image_gen:     12,   // ~$0.04 raw (Wan) — bumped 10→12 (2026-04-25 calibration)
  video_gen:    150,   // 720p base tier (Wan) — see VIDEO_GEN_CREDITS for resolution tiers
  voice_gen:     10,   // ~$0.03 raw (Qwen3-TTS ~500 chars) — bumped 3→10 (2026-04-25)
  music_gen:     50,   // retired — no non-MiniMax music model; kept for billing plumbing
  logo_gen:      20,   // $0 raw (pure construction) — value-priced at parity with an icon
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
 *  SUPERSEDED IN PART, 2026-08-16. Everything below describes a table built
 *  by scaling ratios that were themselves hand-calibrated. Four entries
 *  (qwen3.7-plus, qwen3.8-max, qwen3.5-flash, mistral-medium-3.5) have since
 *  been re-derived from MEASURED traffic and no longer follow it — including
 *  the anchor the others were scaled against. Read the per-entry notes as
 *  authoritative over this header wherever the two disagree.
 *
 *  Recalibrated 2026-07-19 to a 30% net margin target (was 40%, was 55%
 *  before that). Every multiplier scaled by 6/7 — the exact factor to
 *  move 40% → 30% (price = cost / (1 − margin)). Trade is deliberate:
 *  thinner margin per existing user, materially more credits per dollar,
 *  the difference goes back to the user. "Value over margin" —
 *  sustainability floor, not ceiling.
 *
 *  NOTE: 30% is the *typical* target at ~60% utilisation. The margin at
 *  100% utilisation has NOT been re-modelled since the 40% rebalance —
 *  see MARGIN_TARGETS. Derive it before cutting further; heavy users are
 *  where a low target turns negative first.
 *
 *  Mirror of web's credits-pricing.ts MODEL_COST_MULTIPLIER — keep them
 *  in sync; web is the authoritative billing surface and core's meter
 *  dual-writes for dataset audit. Default 1.0 for unlisted models. */
export const MODEL_COST_MULTIPLIER: Record<string, number> = {
  // 30% margin (2026-07-23). Every value below is the prior 40% multiplier
  // scaled by 6/7 — the exact factor to move 40% → 30% (price = cost/(1−m),
  // so 0.6/0.7 = 6/7). The relative calibration between models is preserved;
  // only the margin moved. The 2026-07-19 header noted this recalibration but
  // the numbers were never actually scaled — this completes it.
  //
  // DeepSeek repriced on 2026-08-16 16:00 UTC and split the tariff into peak
  // (01:00-04:00 + 06:00-10:00 UTC) and off-peak, peak being exactly 2×.
  //
  // These two multipliers are the only ones in this table derived from
  // MEASURED traffic rather than list price. 2140 real calls (2026-05-24 →
  // 08-11) were re-priced hour by hour under both tariffs:
  //
  //   peak exposure   2.2% of input tokens   (a uniform clock would give 29.2%)
  //   V4 Pro          cost ×1.556  →  0.66 × 1.556 = 1.03
  //   V4 Flash        cost ×1.686  →  0.37 × 1.686 = 0.62
  //
  // Peak exposure is that low because our users work European daytime, which
  // is DeepSeek's quiet window. It is a real, measured advantage and NOT a
  // safe assumption to carry forward — if usage spreads to other timezones,
  // re-measure before trusting these. The 2× peak tariff means the worst case
  // is roughly double.
  //
  // Estimating from list price alone would have got BOTH wrong: the formula
  // used elsewhere in this table weights output 4× input, but real DeepSeek
  // turns run about 200:1 input-to-output, so the input line is what matters
  // and the output rise (which looked alarming at +128%) barely registers.
  //
  // SECOND PASS, same day. The first pass scaled the OLD multiplier by the
  // cost ratio, which holds the previous margin — including any calibration
  // error already in it. There was one. Re-derived by holding charge-to-cost
  // constant against the Medium 3.5 anchor across 9782 logged calls (539
  // token-less error rows excluded), which accounts for the 4× output
  // weighting in BOTH this multiplier and the bracket count:
  //
  //   V4 Pro    2081 calls, 240:1   1.03 → 1.35   (was undercharged)
  //   V4 Flash    52 calls,  30:1   0.62 → 0.44   (was overcharged)
  //
  // V4 Flash's 52 calls are a thin sample — revisit as its volume grows.
  //
  // HELD, AND THE DERIVATION ABOVE IS NOW SUSPECT. Both values were solved by
  // holding charge-to-cost constant against Medium 3.5, and Medium 3.5 has
  // since been found 24% low — so whatever error sat in the anchor was copied
  // straight into these. DeepSeek also caches, and its own measured range is
  // 0.89-1.79 for V4 Pro: 1.35 is mid-range, which is the honest place to
  // wait rather than a value anybody verified. Left until
  // usage_logs.cached_tokens can pin the hit rate.
  'deepseek-v4-pro':            1.35,
  'deepseek-v4-pro-platform':   1.35,
  'deepseek-v4-flash':            0.44,
  'deepseek-v4-flash-platform':   0.44,
  // ── Re-derived 2026-08-16 against MEASURED traffic ──────────────────
  // The four entries below were solved from real usage rather than list
  // price: every logged call replayed through computeRequestCredits PER CALL
  // (brackets are a per-call ceiling with a floor of one, so summing tokens
  // first erases hundreds of minimums), then solved for a 30% margin.
  //
  // PROVISIONAL — corrected 2026-08-16, hours after they shipped.
  //
  // These were introduced as "decidable at any cache rate, because Qwen and
  // Mistral do not cache". That was wrong. It came from testing ONE model,
  // qwen3.5-flash, and generalising it to two whole providers. Re-tested
  // against the live APIs:
  //
  //   qwen3.7-plus        reports prompt_tokens_details.cached_tokens
  //   qwen3.8-max         reports it
  //   mistral-medium-3.5  reports it
  //   qwen3.5-flash       does NOT — the only one the original claim fit
  //
  // So three of the four CAN cache, and the replay behind their numbers
  // treated cache as zero on both sides — cost and charge. Real cost was
  // probably lower than assumed, which pushes the multiplier down; but the
  // companion cache discount added the same day pushes the charge down too,
  // so the two partly cancel and the net is not knowable without data.
  //
  // They are kept rather than reverted because the values they replaced were
  // measurably worse — the Mistral anchor sat near 13% against a 30% target
  // and the whole table was calibrated off it. Reverting would restore a
  // known error to fix an unknown one. But treat all four as unsettled,
  // alongside DeepSeek and Kimi, until usage_logs.cached_tokens can answer
  // it. Only qwen3.5-flash below is genuinely cache-independent.
  //
  // Cross-checked: at 0% cache these agree to two decimals with a separate
  // calculation run from a different starting point. That check confirmed the
  // arithmetic, not the premise — which is exactly how the premise survived.
  //
  // Qwen 3.7 Plus — Maestro conductor. $0.40/$1.60, 866 calls. 0.82 → 0.94.
  // It has now moved three times in a day: 0.51 by margin rescale, 0.82 by
  // anchoring to Medium 3.5, and 0.94 by measurement. Only the last one was
  // derived from what the traffic actually costs; the first two inherited
  // whatever error sat in their reference.
  'qwen3.7-plus':               0.94,
  'qwen-plus':                  0.94,  // legacy DashScope alias
  // Qwen 3.8 Max — $2.00/$6.00, 354 calls. 2.58 → 1.36, a 47% CUT and the
  // largest overcharge the measurement found. The old 2.58 came from the
  // 0.4952 x (in + 4*out)/5 formula, which weights output at four times
  // input; 3.8 Max traffic runs the other way round, so the formula priced a
  // shape this model does not have.
  //
  // qwen3.7-max keeps its formula-derived value: it has too little traffic to
  // measure, and a guess from a formula beats a guess from nothing.
  'qwen3.8-max':                1.36,
  'qwen3.7-max':                3.22,
  'qwen3.5-plus':               0.44,
  // Qwen 3.5 Flash — Maestro chat / image_gen / intent gate. $0.05/$0.40,
  // 3001 calls, the highest-volume model we run. 0.22 → 0.16, a 27% cut.
  // (The Omni Flash entry this note used to cover is gone — no catalogue ever
  // defined that model.)
  'qwen3.5-flash':              0.16,
  'qwen-flash':                 0.16,
  // Mistral Small 4 — Aurora's high-volume workhorse. $0.15/$0.60. 0.99 → 0.85.
  'mistral-small-4':            0.85,
  'mistral-small-4-platform':   0.85,
  // Mistral Large 3 — Aurora's heavy reserve/fallback. $0.50/$1.50. 1.07 → 0.92.
  'mistral-large-3':            0.92,
  'mistral-large-3-platform':   0.92,
  // Mistral Medium 3.5 — Aurora's lead seat. $1.50/$7.50, 223 calls.
  // 3.12 → 3.87, undercharging by 24%.
  //
  // It was the ANCHOR every other multiplier was calibrated against, and
  // nobody had checked the anchor itself. It sat near 13% against a 30%
  // target, so everything derived from it inherited that — the table was
  // internally consistent and collectively wrong, which is exactly why it
  // never looked broken.
  'mistral-medium-3.5':           3.87,
  'mistral-medium-3.5-platform':  3.87,
  // Kimi K3 — Longxiang's coordinator AND Builder. $3.00/$15.00, EXACTLY 2×
  // Medium 3.5 on both input and output, so this was set at 2× the anchor:
  // 3.12 × 2 = 6.24. Priciest in the table — real cost, not markup.
  //
  // HELD DELIBERATELY, AND IT IS NOW INCONSISTENT. The anchor moved to 3.87,
  // so the rule that produced 6.24 would now say 7.74. It is not being
  // followed, because K3 caches: measurement puts the honest answer between
  // 6.80 and 8.19 depending on a hit rate we cannot yet read, and the whole
  // current range sits ABOVE 6.24 — so today's value undercharges at every
  // rate. Moving it on a rule whose own anchor was just found wrong would
  // repeat the mistake that made this re-derivation necessary. Left until
  // usage_logs.cached_tokens has enough Kimi rows to answer it.
  'kimi-k3':                      6.24,
  'kimi-k3-platform':             6.24,
  // Kimi K2.7 Code — Longxiang fleet member, now openable as a single credit
  // model. $0.95/$4.00 (verified against the Moonshot API). Multiplier from
  // the 30% formula, 0.4952 × (in + 4×out)/5 = 0.4952 × 3.39 = 1.68. Native
  // vision. NEW entry — had no multiplier, so it was silently defaulting to
  // 1.0× (an undercharge) wherever the router used it.
  'kimi-k2.7-code':               1.68,
  'kimi-k2.7-code-platform':      1.68,
};

/** Per-mode cost multiplier — applied AFTER the model multiplier in
 *  `creditsForTurn` / `creditsFor`. Lets a mode price itself based on
 *  the richness of its specialist fleet, independent of which model
 *  the orchestrator picks for a given role.
 *
 *  All modes 1.0× as of the 2026-04-29 40% rebalance. Aurora used to
 *  carry a 1.3× bump to compensate for Medium 3.5's price; that's been
 *  folded into the per-model multiplier (Medium 3.5 = 3.12×) instead.
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
  // Longxiang works like every other fleet: a plan runs it on credits, BYOK
  // runs it on the user's own keys once all three are present. Flat 1.0× —
  // K3's cost is carried honestly by its per-model multiplier (7.28) above
  // rather than hidden in a fleet-level bump, matching the reasoning that
  // moved Aurora's premium off a mode multiplier and onto Medium 3.5.
  longxiang: 1.0,
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
/** A generated health plan: training only, nutrition only, or both. */
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
 * Scales by DAY at the weekly rate, rounded up, minimum 1. Single
 * (fitness | meal) = 5 cr/week; combined = 10.
 *   single   1d = 1 · 3d = 3 · 7d = 5 · 28d = 20 · 84d = 60
 *   combined 1d = 2 · 3d = 5 · 7d = 10 · 28d = 40 · 84d = 120
 *
 * It used to round UP TO WHOLE WEEKS, which meant a 1-day plan cost exactly
 * what a 7-day plan cost. That was a harmless edge case while the offered
 * durations were 1/7/28/56/84 and nobody picked 1. It stopped being harmless
 * when the durations became 1/3/7: we would have been steering people toward
 * the shortest plan while charging them a full week for a seventh of the
 * output, which is indefensible however you dress it up.
 *
 * Every price that existed before is unchanged — 7, 14, 21, 28, 56 and 84 days
 * all come out identical, because 28/7 x 5 is 20 by either route. Only the two
 * new short durations move, and only downward.
 */
export function creditsForPlan(type: HealthPlanKind, durationDays: number): number {
  const perWeek = type === 'combined' ? PLAN_CREDITS_PER_WEEK.combined : PLAN_CREDITS_PER_WEEK.single;
  return Math.max(1, Math.ceil(((durationDays || 1) * perWeek) / 7));
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
  /** 30% at ~60% utilisation — the live design point as of 2026-07-19.
   *  MODEL_COST_MULTIPLIER is the source of truth; this mirrors its target
   *  so the hub's financials page reports what we actually charge. It sat
   *  at 0.55 while billing was calibrated to 0.40, which overstated margin
   *  in our own planning for months. */
  typicalNetMargin: 0.30,
  /** ⚠ UNVERIFIED — not re-derived since the 2026-04-29 rebalance. The old
   *  pair (0.55 typical / 0.30 max) implied a ~25pt drop between 60% and
   *  100% utilisation; carrying that spread onto a 30% typical lands here.
   *  Treat as a flag to model properly, NOT as a measured figure — heavy
   *  users are where a thin target goes negative first, and this is the
   *  number that must be derived before any further cut. */
  maxUtilisationNet: 0.05,
  /** USD / month worst case on Free — funded out of paid margin, so it
   *  gets harder to carry as the target comes down. */
  freeSubsidyPerUser: 0.72,
} as const;
