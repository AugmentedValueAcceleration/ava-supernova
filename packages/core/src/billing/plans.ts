// Canonical plan, top-up, and storage add-on definitions used across every
// Ava surface (web, extension, IDE). Post-credits rename (migration 203):
// allowances are denominated in Ava Credits, not raw Qwen tokens. Credit
// cost per action lives in ./credits.ts and is re-exported from this module
// so every consumer imports from a single path.
//
// Everything here is pure data + pure URL builders — no runtime deps, safe
// to import from any surface that takes @ava/core.

// Re-export the action-cost table + credit helpers so importers of
// @ava/core/billing can get everything (plans + credit pricing) without
// chasing sub-paths.
export * from './credits.js';

export type PlanTier = 'free' | 'pro' | 'ultra' | 'enterprise' | 'admin';

export interface PlanDefinition {
  /** Display name (Free, Pro, Ultra, Enterprise). */
  name: string;
  /** Monthly USD price. Zero for free/admin. */
  price: number;
  /** Monthly Ava Credits allowance. */
  credits: number;
  /** Included cloud storage in GB (before add-ons). */
  storageGb: number;
  /** API requests per minute. */
  rateLimit: number;
  /** Decision-critical feature bullets shown on upgrade cards. */
  features: string[];
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  free: {
    name: 'Free',
    price: 0,
    credits: 300,
    storageGb: 2,
    rateLimit: 20,
    features: [
      '300 credits / month',
      '4 fleets + single models on credits',
      'Any model via BYOK — costs no credits',
      'Every surface — extension, IDE, companion',
    ],
  },
  pro: {
    name: 'Pro',
    price: 19,
    credits: 5_000,
    storageGb: 25,
    rateLimit: 60,
    features: [
      '5,000 credits / month',
      '4 fleets + single models on credits',
      'Top-up credits anytime',
      '60 requests / minute',
      'Priority support',
    ],
  },
  ultra: {
    name: 'Ultra',
    price: 39,
    credits: 10_000,
    storageGb: 100,
    rateLimit: 120,
    features: [
      '10,000 credits / month',
      '4 fleets + single models on credits',
      '120 requests / minute',
      'Highest-priority routing',
      'Early access to new models',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    price: 79,
    credits: 20_000,
    storageGb: 500,
    rateLimit: 200,
    features: [
      '20,000 credits / month',
      '4 fleets + single models on credits',
      '200 requests / minute',
      'SSO + dedicated support',
      'Custom integrations on request',
    ],
  },
  admin: {
    name: 'Admin',
    price: 0,
    credits: 999_999_999,
    storageGb: 10_000,
    rateLimit: 999,
    features: [],
  },
};

// ── Top-up shapes ────────────────────────────────────────────────────────
// The authoritative top-up catalog lives in credits.ts (CREDIT_TOPUPS +
// CreditTopupDefinition). Deprecated token-era aliases below keep any
// import site we haven't migrated compiling.

import { CREDIT_TOPUPS, type CreditTopupDefinition } from './credits.js';

/** @deprecated — use CreditTopupDefinition. */
export type TokenTopupDefinition = CreditTopupDefinition;

/** @deprecated — use CREDIT_TOPUPS. Points at the same array. */
export const TOKEN_TOPUPS: CreditTopupDefinition[] = CREDIT_TOPUPS;

// ── Website URL builders ──────────────────────────────────────────────────
// Surfaces that can't host checkout themselves (the VS Code webview sandbox,
// Tauri's blocked origins) redirect the user to the website. One helper
// per destination keeps the URL in one place.

export const AVA_SITE_BASE = 'https://ava-supernova.com';

/** Public pricing page — plan cards + top-ups all on one page. */
export function pricingUrl(): string {
  return `${AVA_SITE_BASE}/pricing`;
}

/** Dashboard billing — current plan, Stripe portal, active top-ups. Signed-in view. */
export function dashboardBillingUrl(): string {
  return `${AVA_SITE_BASE}/dashboard/billing`;
}

/** Pricing page with intent hint so the page can highlight the right card. */
export function upgradeUrl(target: Exclude<PlanTier, 'free' | 'admin'>): string {
  return `${AVA_SITE_BASE}/pricing?upgrade=${target}`;
}

/** Pricing page scrolled to the top-up grid. */
export function creditTopupUrl(topup: CreditTopupDefinition['id']): string {
  return `${AVA_SITE_BASE}/pricing?topup=${topup}#credits`;
}

/** @deprecated — use creditTopupUrl. */
export const tokenTopupUrl = creditTopupUrl;
