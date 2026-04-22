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
    credits: 1_500,
    storageGb: 2,
    rateLimit: 20,
    features: [
      '1,500 credits / month',
      '2 GB cloud storage',
      'All supported models via BYOK',
      'Every surface — extension, IDE, companion',
    ],
  },
  pro: {
    name: 'Pro',
    price: 19,
    credits: 15_000,
    storageGb: 50,
    rateLimit: 60,
    features: [
      '15,000 credits / month',
      '50 GB cloud storage',
      'Top-up credits anytime',
      '60 requests / minute',
      'Priority support',
    ],
  },
  ultra: {
    name: 'Ultra',
    price: 39,
    credits: 35_000,
    storageGb: 200,
    rateLimit: 120,
    features: [
      '35,000 credits / month',
      '200 GB cloud storage',
      '120 requests / minute',
      'Highest-priority routing',
      'Early access to new models',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    price: 79,
    credits: 75_000,
    storageGb: 500,
    rateLimit: 200,
    features: [
      '75,000 credits / month',
      '500 GB cloud storage',
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

export interface StorageAddonDefinition {
  id: '50gb' | '250gb' | '1tb';
  gb: number;
  price: number;
  label: string;
  /** One-line pitch surfaced under the title on purchase cards. */
  subtitle: string;
  /** Monthly cost per GB. Lets users see that +1TB is 4c/GB vs +50GB at 6c/GB. */
  effectiveRate: string;
  /** Subtle "Best value" marker in the UI. */
  popular?: boolean;
}

export const STORAGE_ADDONS: StorageAddonDefinition[] = [
  { id: '50gb',  gb: 50,   price: 3,  label: '+50 GB',  subtitle: 'A little more room',        effectiveRate: '$0.06 / GB / mo' },
  { id: '250gb', gb: 250,  price: 12, label: '+250 GB', subtitle: 'Creative Studio scale',     effectiveRate: '$0.048 / GB / mo', popular: true },
  { id: '1tb',   gb: 1024, price: 45, label: '+1 TB',   subtitle: 'Power user',                effectiveRate: '$0.044 / GB / mo' },
];

// ── Website URL builders ──────────────────────────────────────────────────
// Surfaces that can't host checkout themselves (the VS Code webview sandbox,
// Tauri's blocked origins) redirect the user to the website. One helper
// per destination keeps the URL in one place.

export const AVA_SITE_BASE = 'https://ava-supernova.com';

/** Public pricing page — plan cards, top-ups, storage addons all on one page. */
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

/** Pricing page scrolled to the storage add-on grid. */
export function storageAddonUrl(addon: StorageAddonDefinition['id']): string {
  return `${AVA_SITE_BASE}/pricing?storage=${addon}#storage`;
}
