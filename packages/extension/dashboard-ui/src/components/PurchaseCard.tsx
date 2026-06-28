// Unified purchase card — used for token top-ups and storage add-ons
// on the extension Billing tab. Matches the IDE + website shape:
// amount + subtitle, big price + effective rate, and a state-aware
// CTA (Live / Coming Soon / Active). Popular items get a subtle
// "Best value" inline badge and accent border rather than a loud
// ribbon — this is a billing panel, not a pricing page.

import { t, useLocale } from '../i18n';

interface PurchaseCardProps {
  title: string;
  subtitle: string;
  price: string;
  priceSuffix?: string;
  effectiveRate: string;
  popular?: boolean;
  state: 'live' | 'coming_soon' | 'active';
  /** Button label. When state='active' this typically reads "Top up again"
   *  or "Manage". When state='coming_soon' the button is non-interactive. */
  ctaLabel: string;
  onClick?: () => void;
}

export function PurchaseCard({
  title, subtitle, price, priceSuffix, effectiveRate, popular, state, ctaLabel, onClick,
}: PurchaseCardProps) {
  useLocale();
  const isInteractive = state !== 'coming_soon';
  const isActive = state === 'active';

  const borderClass = popular
    ? 'border-[var(--accent)]/40 shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)_inset]'
    : isActive
      ? 'border-emerald-500/30'
      : 'border-[var(--border-card)]';

  return (
    <div
      className={`relative flex flex-col rounded-xl border bg-[var(--bg-card)] p-4 transition ${borderClass} ${!isInteractive ? 'opacity-80' : ''}`}
    >
      {/* Popular / Active callout — inline, not a ribbon */}
      {popular && (
        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">
          <span>⭐</span>
          <span>{t('dash.purchase.best_value')}</span>
        </div>
      )}
      {isActive && !popular && (
        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
          <span>✓</span>
          <span>{t('dash.purchase.active')}</span>
        </div>
      )}

      {/* Primary amount */}
      <p className="text-base font-semibold text-white">{title}</p>
      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{subtitle}</p>

      {/* Price */}
      <p className="mt-3 text-2xl font-bold text-white tabular-nums">
        {price}
        {priceSuffix && <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">{priceSuffix}</span>}
      </p>
      <p className="mt-0.5 text-[10px] text-[var(--text-muted)] tabular-nums">{effectiveRate}</p>

      {/* CTA — pinned to the card bottom (mt-auto) so every button aligns across
          the row regardless of content height. One unified outlined-accent style
          for all cards; popular is distinguished by its border + callout, not the
          button. Mirrors the IDE IdePurchaseCard. */}
      <button
        onClick={isInteractive ? onClick : undefined}
        disabled={!isInteractive}
        className={`mt-auto w-full rounded-lg py-2 text-[11px] font-semibold transition ${
          !isInteractive
            ? 'cursor-not-allowed border border-[var(--border-input)] bg-[var(--bg-input)] text-[var(--text-muted)]'
            : 'border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]'
        }`}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
