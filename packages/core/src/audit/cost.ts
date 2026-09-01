// Cost attribution for audit entries.
//
// Two billing models, two unit conventions:
//   - Platform mode: charge in credits via creditsForTurn() — same math
//     the server bills with, so the audit row's credit number matches
//     the actual charge byte-for-byte.
//   - BYOK mode: estimate USD from the provider's published per-token
//     rate × the call's token counts. Rates live in PROVIDER_USD_RATES
//     below — keep this small + visible rather than importing from a
//     bigger model registry, since the bench repo is already the
//     auditable source of truth for model facts.

import { creditsForTurn } from '../billing/credits.js';
import type { AuditCost } from './types.js';

interface ProviderRate {
  /** USD per million input tokens. */
  inputPerMillion: number;
  /** USD per million output tokens. */
  outputPerMillion: number;
}

/** BYOK provider rate cards. Sourced from each provider's public pricing
 *  page — verify before adding entries. Update in PRs only, never via
 *  silent commits, so the rate-card history is auditable in git blame.
 *  Last verified: 2026-08-16 — every id below diffed against the provider
 *  catalogues in src/providers/<name>/models.ts, which are themselves checked
 *  against the live /models endpoints and official pricing pages.
 *
 *  That diff is worth re-running rather than eyeballing. On 2026-08-16 it
 *  found three prices that disagreed with the catalogue (qwen3.5-plus,
 *  qwen3.5-flash, mistral-small-4), six dead Anthropic ids, and three models
 *  shipped to BYOK with no rate at all. None of it was visible by reading. */
const PROVIDER_USD_RATES: Record<string, Record<string, ProviderRate>> = {
  // MiniMax was absent entirely until 2026-07-17, so BYOK MiniMax turns
  // costed at $0.00 in the audit rather than being estimated.
  minimax: {
    // M3 ≤512k rate ("Permanent 50% off"); >512k turns bill at 2x this.
    'MiniMax-M3': { inputPerMillion: 0.30, outputPerMillion: 1.20 },
    'MiniMax-M2.7': { inputPerMillion: 0.30, outputPerMillion: 1.20 },
    'MiniMax-M2.7-highspeed': { inputPerMillion: 0.60, outputPerMillion: 2.40 },
  },
  deepseek: {
    // Off-peak rates from the 2026-08-16 tariff. Peak (01:00-04:00 and
    // 06:00-10:00 UTC) is exactly double both figures.
    'deepseek-v4-pro':   { inputPerMillion: 0.66, outputPerMillion: 1.98 },
    'deepseek-v4-flash': { inputPerMillion: 0.22, outputPerMillion: 0.66 },
  },
  kimi: {
    // All four verified against Moonshot's per-model pricing pages 2026-07-17.
    // K2.6/K2.5 were previously 0.60/2.40 and 0.55/2.20 here — both wrong, and
    // both disagreed with providers/kimi/models.ts. Cost audits under-reported
    // Kimi spend by ~37% until this was corrected.
    'kimi-k3': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
    'kimi-k2.7-code': { inputPerMillion: 0.95, outputPerMillion: 4.00 },
    'kimi-k2.6': { inputPerMillion: 0.95,  outputPerMillion: 4.00 },
    // UNREACHABLE — retained only so existing receipts still cost out.
    // Dropped from the catalogue ahead of Moonshot's 31 August switch-off, so
    // nothing can select it and no new call can produce it. The rate stays
    // purely so audit entries recorded while it was live keep their real cost
    // instead of silently restating as free. Not a general keep-everything
    // rule: k2.6 above is a different case, hidden from the picker but still
    // reachable by fallback, so it can produce new charges.
    'kimi-k2.5': { inputPerMillion: 0.60,  outputPerMillion: 3.00 },
  },
  qwen: {
    'qwen3.8-max':  { inputPerMillion: 2.00,  outputPerMillion: 6.00 }, // flagship from 2026-08-03, DashScope intl
    // UNREACHABLE — retained only so existing receipts still cost out.
    // Retired from the catalogue 2026-08-09 in favour of 3.8 Max, which is
    // cheaper and more capable, so nothing routes here any more.
    'qwen3.7-max':  { inputPerMillion: 2.50,  outputPerMillion: 7.50 },
    'qwen3.7-plus': { inputPerMillion: 0.40,  outputPerMillion: 1.60 },
    // Was $0.40 in — double the real rate, so BYOK 3.5 Plus turns were
    // costed at twice what they actually cost. Corrected 2026-08-16.
    'qwen3.5-plus': { inputPerMillion: 0.20,  outputPerMillion: 1.20 },
    // Tiered upstream ($0.03/$0.13 <32K, $0.10/$0.40 <256K, $0.20/$0.80 <1M).
    // Middle tier: a real turn clears 32K almost at once.
    'qwen3-coder-next':  { inputPerMillion: 0.12,  outputPerMillion: 0.80 },
    'qwen3-coder-flash': { inputPerMillion: 0.195, outputPerMillion: 0.975 },
    'qwen3.7-flash': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
    // Was $0.15 out against a real $0.40 — a 2.7x under-report on the
    // highest-volume model we run. Corrected 2026-08-16.
    'qwen3.5-flash':{ inputPerMillion: 0.05,  outputPerMillion: 0.40 },
  },
  xiaomi: {
    // Absent entirely until 2026-08-16, so BYOK MiMo turns costed at $0.00
    // — the same hole MiniMax had above.
    'mimo-v2.5-pro': { inputPerMillion: 1.00, outputPerMillion: 3.00 },
    'mimo-v2.5':     { inputPerMillion: 0.40, outputPerMillion: 2.00 },
  },
  zhipu: {
    'glm-5.3':       { inputPerMillion: 1.40, outputPerMillion: 4.40 },
    // List, not the launch promotion ($0.075/M input to 2026-09-09).
    'glm-5.3-flash': { inputPerMillion: 0.15, outputPerMillion: 0.50 },
    // UNREACHABLE - retained only so existing receipts still cost out, the
    // same as hy3-preview below. Retired 2026-09-01 when 5.3 landed.
    'glm-5.2':       { inputPerMillion: 1.40, outputPerMillion: 4.40 },
    'glm-4.5-air':   { inputPerMillion: 0.20, outputPerMillion: 1.10 },
  },
  mistral: {
    'mistral-large-3':    { inputPerMillion: 0.50, outputPerMillion: 1.50 },
    'mistral-medium-3.5': { inputPerMillion: 1.50, outputPerMillion: 7.50 },
    // Was $0.10/$0.30 against a real $0.15/$0.60 — Aurora's high-volume
    // workhorse, under-reported on both figures. Corrected 2026-08-16.
    'mistral-small-4':    { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  },
  // An anthropic block of six models sat here until 2026-08-16. Anthropic
  // was removed across every surface on 13 August and no catalogue defines
  // those ids any more, so the rates could never be reached: the lookup is
  // keyed on a provider we no longer have. Removed rather than kept as
  // history, unlike the retired ids below — those still cost out real logged
  // usage, whereas these could only cost out a provider that is gone.
  tencent: {
    'hy3':         { inputPerMillion: 0.15,  outputPerMillion: 0.59 },
    // UNREACHABLE — retained only so existing receipts still cost out.
    // The April preview, replaced by the GA hy3 above.
    'hy3-preview': { inputPerMillion: 0.063, outputPerMillion: 0.210 },
  },
  nvidia: {
    'nvidia/nemotron-3-ultra-550b-a55b':  { inputPerMillion: 0.50, outputPerMillion: 2.20 },
    // Added 2026-08-16, the same day it reached the BYOK surfaces. Shipping a
    // model without its rate is how the MiniMax and MiMo holes happened.
    'nvidia/nemotron-3.5-lightning-30b-a3b': { inputPerMillion: 0.05, outputPerMillion: 0.20 },
  },
};

/** Compute the cost record for an audit entry. Tools that don't carry
 *  token counts (file_read, ls, etc.) get an empty cost — they're free
 *  in both billing models. Returns undefined when there's nothing to
 *  attribute, so the receipt UI can render a dash instead of "$0.00". */
export function computeCost(opts: {
  mode: 'platform' | 'byok';
  toolName: string;
  inputTokens?: number;
  outputTokens?: number;
  provider?: string;
  model?: string;
  cacheHit?: boolean;
}): AuditCost | undefined {
  const { mode, inputTokens = 0, outputTokens = 0, provider, model, cacheHit } = opts;
  const tokens = inputTokens + outputTokens;
  if (tokens === 0) return undefined;

  if (mode === 'platform') {
    const { credits } = creditsForTurn('chat_turn', { inputTokens, outputTokens, model, cachedTokens: cacheHit ? inputTokens : 0 });
    return {
      mode: 'platform',
      credits,
      tokens: { input: inputTokens, output: outputTokens },
      provider,
      model,
    };
  }

  // BYOK — estimate USD from provider rate card.
  const usd = estimateByokUsd(provider, model, inputTokens, outputTokens);
  return {
    mode: 'byok',
    usd,
    tokens: { input: inputTokens, output: outputTokens },
    provider,
    model,
  };
}

/** Returns undefined — NOT zero — when there is no rate for the model.
 *
 *  This used to return 0, which formatCost then rendered as "$0.0000": a
 *  receipt claiming a call was free when the truth was that nobody had
 *  entered a price for it. That is how three separate holes stayed invisible
 *  — MiniMax until 2026-07-17, then Xiaomi and Nemotron 3.5 Lightning until
 *  2026-08-16 — because a missing model looked exactly like a free one.
 *
 *  undefined renders as "—", which is the honest answer. A cost audit that
 *  under-reports is worse than one that admits a gap, because only the second
 *  kind gets fixed. */
function estimateByokUsd(provider: string | undefined, model: string | undefined, inputTokens: number, outputTokens: number): number | undefined {
  if (!provider || !model) return undefined;
  const rate = PROVIDER_USD_RATES[provider]?.[model];
  if (!rate) return undefined;
  return (inputTokens / 1_000_000) * rate.inputPerMillion + (outputTokens / 1_000_000) * rate.outputPerMillion;
}

/** Format a cost record for display. Returns a short string suitable
 *  for table cells: "12 credits", "$0.04", "—" when no cost data. */
export function formatCost(cost: AuditCost | undefined): string {
  if (!cost) return '—';
  if (cost.mode === 'platform' && cost.credits != null) return `${cost.credits} credit${cost.credits === 1 ? '' : 's'}`;
  if (cost.mode === 'byok' && cost.usd != null)         return `$${cost.usd.toFixed(cost.usd >= 0.01 ? 4 : 6)}`;
  return '—';
}
