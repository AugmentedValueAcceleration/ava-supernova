# Creative Studio Credit-Math Audit — 2026-05-15

**Status:** Incomplete — server-side data unreachable from CI environment. Operator action required.

---

## Step 1 — Source-of-truth constants (current)

The architecture changed since the original spec. There is **no `CREDITS` object** in
`CreativeStudio.tsx`. The page imports `CREDIT_COST` directly from
`packages/core/src/billing/credits.ts` (the canonical billing source), and the four
estimate helpers reference that table. The spec's per-surface constants were eliminated
in the 2026-04-25 rebalance — the core table is now the single source of truth for both
the preview and the server charge.

### Current `CREDIT_COST` values (from `packages/core/src/billing/credits.ts`)

| Action | Current value | Original spec value | Delta |
|--------|--------------|--------------------|----|
| `image_gen` | **12** per variation | 50 per variation | −76% |
| `music_gen` | **50** (flat) | 200 baseline, linear w/ duration | −75% (+ logic change) |
| `voice_gen` | **10** per 500-char chunk (min 1) | 12 per 100-char chunk, min 24 | Different chunking unit |
| `video_gen` | **150** (6 s), **~250** (10 s, calc'd) | 2 000 (6 s), 3 500 (10 s) | −93% |

### Estimate helper logic (current, in `CreativeStudio.tsx` lines 126–147)

```
estimateImageCredits(variations) = CREDIT_COST.image_gen * max(1, variations)
                                 = 12 * max(1, variations)

estimateMusicCredits(_durationSec) = CREDIT_COST.music_gen   // flat, ignores duration
                                   = 50

estimateVoiceCredits(textLen) = CREDIT_COST.voice_gen * max(1, ceil(textLen / 500))
                              = 10 * max(1, ceil(textLen / 500))

estimateVideoCredits(durationSec):
  if durationSec == 10  → Math.round(150 * (10/6)) = 250
  else                  → 150
```

The music helper explicitly ignores `durationSec` — the server charges flat per
generation regardless of track length.

---

## Step 2 — Server-side data: UNREACHABLE

The audit requires querying Supabase project `dpxdjnpqaxhsydoeaogl` via
`https://api.supabase.com/v1/projects/dpxdjnpqaxhsydoeaogl/database/query`.

The remote execution environment's **network policy blocks outbound connections to
`api.supabase.com`**. The request returned `Host not in allowlist` at the TCP/HTTP
layer — this is not a 401/403, it is a network-policy restriction.

Because server-side charge data could not be retrieved, **Steps 2 and 3 (compare
estimate vs actual) could not be executed.** The divergence statistics, bias
classification, and PR/no-PR decision all depend on that data.

### What to look for when you run the queries manually

The billing pipeline uses `chargeCredits()` in `packages/core/src/billing/meter.ts`,
which emits `credits_charged` dataset events via `avaEvents`. During Stage 2
(dual-write), these events are recorded alongside raw token usage; server billing
continues to run on raw tokens. Stage 3 (not yet live) will flip credits to primary.

**Likely table candidates** (verify against your migration history):

- `public.usage_logs` — per-request log; check for `action`, `credits`, and
  `asset_type` / `generation_kind` columns added by migration 203 or later.
- `public.creative_assets` — if the platform writes a row per generated asset, it may
  carry `credits_charged`.

**Suggested query once you have API access:**

```sql
SELECT
  action,
  COUNT(*)                                       AS n,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY credits) AS median_credits,
  MIN(credits) AS min_credits,
  MAX(credits) AS max_credits,
  AVG(credits) AS avg_credits
FROM public.usage_logs          -- swap for actual table name
WHERE action IN ('image_gen','music_gen','voice_gen','video_gen')
  AND created_at >= NOW() - INTERVAL '14 days'
GROUP BY action
ORDER BY action;
```

For the voice divergence check, also pull `raw_input_tokens` or the voice
text-length parameter (if stored) so you can reconstruct what the client would
have estimated:

```sql
SELECT
  action,
  credits,
  -- adapt column names to your schema
  params->>'text_length' AS text_len,
  10 * GREATEST(1, CEIL((params->>'text_length')::int / 500.0)) AS estimate
FROM public.usage_logs
WHERE action = 'voice_gen'
  AND created_at >= NOW() - INTERVAL '14 days'
LIMIT 50;
```

---

## Step 3 — Divergence analysis: PENDING

Not computable without server data. Expected formula once data is available:

```
divergence_pct = (actual_credits - estimate_credits) / estimate_credits * 100
```

Thresholds for auto-PR:
- Median divergence < 5% both ways → no change needed
- Median divergence > 5%, systematic bias → PR on `credit-math-tune-2026-05-15`
- Mixed / noisy → this report branch, operator review

---

## Architectural notes for operator

1. **The spec values in the audit brief are stale.** The April 2026 rebalance
   (comments in `credits.ts`) dropped image from 50→12, video from 2 000→150,
   music from 200→50, and changed voice chunking from 100-char to 500-char units.
   If the audit brief was written against the pre-rebalance numbers, the "expected"
   constants need updating before you re-run this audit.

2. **Single source of truth is working correctly.** `CreativeStudio.tsx` now imports
   directly from `@ava/core/billing/credits` rather than maintaining its own
   constants. Any future constant change in `credits.ts` automatically updates both
   the preview and the charge with no drift possible at the constant layer. Drift can
   only come from the helper _formulas_ diverging from the server's application of
   those constants (e.g., if the server applies a per-model multiplier the client
   doesn't know about).

3. **Music is intentionally flat.** The client helper ignores `durationSec` because
   the server charges flat per generation. If a future provider starts scaling by
   duration, both the helper and the server constant need updating together.

4. **Voice chunking changed.** Old spec: 100-char chunks, min 24 credits. Current:
   500-char chunks, min 10 credits. A 50-char utterance now costs 10 (one chunk ×
   10), whereas under the old formula it cost 24 (floor). A 500-char script costs 10
   (one chunk), vs 60 old (5 chunks × 12). Verify the server uses the same 500-char
   boundary.

---

## Action required

To complete this audit, the operator needs to:

1. **Run the queries above** from a machine or environment with access to
   `api.supabase.com` using the PAT in the audit brief (or a fresh one if it has
   rotated).
2. For each kind, compute median divergence against the formulas in Step 1.
3. If systematic bias > 5% is found in any kind, open a PR on
   `credit-math-tune-2026-05-15` editing only the constants in
   `packages/core/src/billing/credits.ts` (which is now the single source of truth
   for both preview and server charge).
4. Mark the PR as draft if any single constant change exceeds 25%.
