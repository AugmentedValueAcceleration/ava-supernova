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
 *  Last verified: 2026-07-17 — every id below re-checked against the
 *  providers' live /models endpoints and official pricing pages. */
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
    'deepseek-v4-pro':   { inputPerMillion: 0.435, outputPerMillion: 0.87 },
    'deepseek-v4-flash': { inputPerMillion: 0.14,  outputPerMillion: 0.28 },
  },
  kimi: {
    // All four verified against Moonshot's per-model pricing pages 2026-07-17.
    // K2.6/K2.5 were previously 0.60/2.40 and 0.55/2.20 here — both wrong, and
    // both disagreed with providers/kimi/models.ts. Cost audits under-reported
    // Kimi spend by ~37% until this was corrected.
    'kimi-k3': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
    'kimi-k2.7-code': { inputPerMillion: 0.95, outputPerMillion: 4.00 },
    'kimi-k2.6': { inputPerMillion: 0.95,  outputPerMillion: 4.00 },
    'kimi-k2.5': { inputPerMillion: 0.60,  outputPerMillion: 3.00 },
  },
  qwen: {
    'qwen3.8-max':  { inputPerMillion: 2.00,  outputPerMillion: 6.00 }, // flagship from 2026-08-03, DashScope intl
  'qwen3.7-max':  { inputPerMillion: 2.50,  outputPerMillion: 7.50 }, // superseded by 3.8 Max; still live upstream
    'qwen3.7-plus': { inputPerMillion: 0.40,  outputPerMillion: 1.60 },
    'qwen3.5-plus': { inputPerMillion: 0.40,  outputPerMillion: 1.20 },
    // Tiered upstream ($0.03/$0.13 <32K, $0.10/$0.40 <256K, $0.20/$0.80 <1M).
    // Middle tier: a real turn clears 32K almost at once.
    'qwen3-coder-next':  { inputPerMillion: 0.12,  outputPerMillion: 0.80 },
    'qwen3-coder-flash': { inputPerMillion: 0.195, outputPerMillion: 0.975 },
    'qwen3.7-flash': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
    'qwen3.5-flash':{ inputPerMillion: 0.05,  outputPerMillion: 0.15 },
  },
  zhipu: {
    'glm-5.2':     { inputPerMillion: 1.40, outputPerMillion: 4.40 },
    'glm-4.5-air': { inputPerMillion: 0.20, outputPerMillion: 1.10 },
  },
  mistral: {
    'mistral-large-3':    { inputPerMillion: 0.50, outputPerMillion: 1.50 },
    'mistral-medium-3.5': { inputPerMillion: 1.50, outputPerMillion: 7.50 },
    'mistral-small-4':    { inputPerMillion: 0.10, outputPerMillion: 0.30 },
  },
  anthropic: {
    'claude-fable-5':             { inputPerMillion: 10.00, outputPerMillion: 50.00 },
    'claude-opus-4-8':            { inputPerMillion: 5.00,  outputPerMillion: 25.00 },
    'claude-opus-4-7':            { inputPerMillion: 5.00,  outputPerMillion: 25.00 },
    'claude-opus-4-6':            { inputPerMillion: 5.00,  outputPerMillion: 25.00 },
    'claude-sonnet-5':            { inputPerMillion: 3.00,  outputPerMillion: 15.00 },
    'claude-haiku-4-5-20251001':  { inputPerMillion: 1.00,  outputPerMillion: 5.00 },
  },
  tencent: {
    'hy3':         { inputPerMillion: 0.15,  outputPerMillion: 0.59 },
    // Kept so usage logged against the April preview still costs out.
    'hy3-preview': { inputPerMillion: 0.063, outputPerMillion: 0.210 },
  },
  nvidia: {
    'nvidia/nemotron-3-ultra-550b-a55b': { inputPerMillion: 0.50, outputPerMillion: 2.20 },
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

function estimateByokUsd(provider: string | undefined, model: string | undefined, inputTokens: number, outputTokens: number): number {
  if (!provider || !model) return 0;
  const rate = PROVIDER_USD_RATES[provider]?.[model];
  if (!rate) return 0;
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
