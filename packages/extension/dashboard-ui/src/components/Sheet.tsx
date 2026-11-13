// The modal shell the short-lived health panels sit in — assist, duplicate,
// log, prep. (It lived in ShoppingListSheet.tsx until the shopping list became
// its own tab on 13 Nov 2026; see ShoppingPage.tsx.)

import { useEffect } from 'react';
import { t } from '../i18n';

export function Sheet({ title, subtitle, onClose, children }: {
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Escape closes. A modal you can only leave by finding the X is a modal that
  // traps somebody mid-shop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 sm:p-6" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-[620px] flex-col overflow-hidden rounded-xl border border-[var(--accent)]/25 bg-gradient-to-br from-[#100d1a] to-[#181327] shadow-[0_0_80px_color-mix(in_srgb,_var(--accent)_15%,_transparent)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--accent)]/14 px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-medium text-[var(--text-primary)]">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t('health.plans.cancel')}
            className="shrink-0 cursor-pointer border-none bg-transparent text-lg leading-none text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
