// Canonical plan, top-up, and storage add-on definitions used across every
// Ava surface (web, extension, IDE). Before this file, the extension carried
// its own divergent copy (e.g. top-ups listed as 2.5M/$5 instead of the
// canonical 3M/$3), which caused the in-app pricing to drift from what the
// website actually charged at checkout.
//
// Everything here is pure data + pure URL builders — no runtime deps, safe
// to import from any surface that takes @ava/core.

export type PlanTier = 'free' | 'pro' | 'ultra' | 'enterprise' | 'admin';

export interface PlanDefinition {
  /** Display name (Free, Pro, Ultra, Enterprise). */
  name: string;
  /** Monthly USD price. Zero for free/admin. */
  price: number;
  /** Monthly managed-Qwen token allowance. */
  tokens: number;
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
    tokens: 3_000_000,
    storageGb: 2,
    rateLimit: 20,
    features: [
      '3M managed Qwen tokens / month',
      '2 GB cloud storage',
      'All supported models via BYOK',
      'Every surface — extension, IDE, companion',
    ],
  },
  pro: {
    name: 'Pro',
    price: 19,
    tokens: 15_000_000,
    storageGb: 50,
    rateLimit: 60,
    features: [
      '15M managed Qwen tokens / month',
      '50 GB cloud storage',
      'Top-up tokens anytime',
      '60 requests / minute',
      'Priority support',
    ],
  },
  ultra: {
    name: 'Ultra',
    price: 39,
    tokens: 40_000_000,
    storageGb: 200,
    rateLimit: 120,
    features: [
      '40M managed Qwen tokens / month',
      '200 GB cloud storage',
      '120 requests / minute',
      'Highest-priority routing',
      'Early access to new models',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    price: 79,
    tokens: 100_000_000,
    storageGb: 500,
    rateLimit: 200,
    features: [
      '100M managed Qwen tokens / month',
      '500 GB cloud storage',
      '200 requests / minute',
      'SSO + dedicated support',
      'Custom integrations on request',
    ],
  },
  admin: {
    name: 'Admin',
    price: 0,
    tokens: 999_999_999,
    storageGb: 10_000,
    rateLimit: 999,
    features: [],
  },
};

export interface TokenTopupDefinition {
  id: 'tokens_3m' | 'tokens_10m' | 'tokens_25m';
  tokens: number;
  price: number;
  label: string;
  /** One-line pitch surfaced under the title on purchase cards. */
  subtitle: string;
  /** Effective rate for value comparison. Pre-computed so UIs don't
   *  duplicate the "$X per 1M" maths across surfaces. */
  effectiveRate: string;
  /** Flagged in UIs with a subtle "Best value" marker + border
   *  treatment. Only one per category should carry this. */
  popular?: boolean;
}

export const TOKEN_TOPUPS: TokenTopupDefinition[] = [
  { id: 'tokens_3m',  tokens: 3_000_000,  price: 3,  label: '3M tokens',  subtitle: 'Quick boost',   effectiveRate: '$1.00 per 1M' },
  { id: 'tokens_10m', tokens: 10_000_000, price: 8,  label: '10M tokens', subtitle: 'Best value',    effectiveRate: '$0.80 per 1M', popular: true },
  { id: 'tokens_25m', tokens: 25_000_000, price: 15, label: '25M tokens', subtitle: 'Power user',    effectiveRate: '$0.60 per 1M' },
];

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
export function tokenTopupUrl(topup: TokenTopupDefinition['id']): string {
  return `${AVA_SITE_BASE}/pricing?topup=${topup}#tokens`;
}

/** Pricing page scrolled to the storage add-on grid. */
export function storageAddonUrl(addon: StorageAddonDefinition['id']): string {
  return `${AVA_SITE_BASE}/pricing?storage=${addon}#storage`;
}
