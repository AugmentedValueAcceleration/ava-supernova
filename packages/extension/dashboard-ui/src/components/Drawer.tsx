import type { ReactNode } from 'react';
import { useEffect } from 'react';

/**
 * The right-hand drawer.
 *
 * Health & Nutrition established this: you click a thing in a list, it arrives
 * from the right, and the list stays behind it. A centred box hides the list
 * you just picked from and reads as a different product one tab across — which
 * is exactly what the Library's preview used to do.
 *
 * This exists as a component because the same markup had already been written
 * out by hand in three places (the plans drawer, the plan-setup drawer, the
 * shopping list sheet). A fourth copy would have guaranteed the four drift
 * apart; one component is what makes "the same view" true rather than
 * aspirational.
 *
 * The shell only. Callers that want the standard header pass `title`; the ones
 * whose content brings its own header simply do not.
 */
export function Drawer({
  onClose,
  children,
  title,
  subtitle,
  /** Panel width cap. A plan runs to eighty-four days and wants more room
   *  than a shopping list does. */
  maxWidth = 560,
  /** Above another overlay when a drawer opens on top of one. */
  zIndex = 50,
  closeLabel = 'Close',
}: {
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  maxWidth?: number;
  zIndex?: number;
  closeLabel?: string;
}) {
  // Escape closes it. Every drawer had to remember this separately before, and
  // the Library's preview never did.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex justify-end bg-black/60 backdrop-blur-[2px]"
      style={{ zIndex, animation: 'ava-fade-in 160ms ease-out' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth, animation: 'ava-slide-in-right 220ms cubic-bezier(0.32, 0.72, 0, 1)' }}
        className="flex h-full w-full flex-col overflow-hidden border-l border-[var(--accent)]/25 bg-gradient-to-b from-[#100d1a] to-[#150f22] shadow-[-24px_0_60px_rgba(0,0,0,0.5)]"
      >
        {title !== undefined && (
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--accent)]/14 px-5 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-[14px] font-medium text-[var(--text-primary)]">{title}</h2>
              {subtitle && <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
