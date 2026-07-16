import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MiniDatePicker } from './MiniDatePicker';

/**
 * A themed date field: a button showing the picked date (or a placeholder) that
 * opens our MiniDatePicker, replacing the native (light) browser date input.
 *
 * Extracted from GeneralProfilePage so the Tasks overlay and the profile share
 * one implementation instead of two drifting copies.
 *
 * The calendar is portaled to <body> with fixed positioning — exactly like
 * Select — so a modal's max-height/overflow can't clip it, and it flips above
 * the field when there isn't room below. An absolutely-positioned popover got
 * cut off at the bottom of the New Task dialog.
 *
 * `size` mirrors Select's API so a DateField can sit next to a Select in the
 * same row and line up: `sm` = the compact inline register, `md` (default) =
 * the full-size form control.
 */
interface DateFieldProps {
  value: string | null; // YYYY-MM-DD
  onChange: (iso: string | null) => void;
  size?: 'sm' | 'md';
  /** Shown when no date is picked. */
  placeholder?: string;
}

// MiniDatePicker renders a fixed 220px-wide panel; this is its approximate
// height (header + up to 6 week rows) and is used to decide flip direction.
const CAL_WIDTH = 220;
const CAL_DESIRED_HEIGHT = 260;

export function DateField({ value, onChange, size = 'md', placeholder = '—' }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const calRef = useRef<HTMLDivElement>(null);
  const [calStyle, setCalStyle] = useState<React.CSSProperties>({});

  const reposition = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < CAL_DESIRED_HEIGHT && spaceAbove > spaceBelow;
    // Keep the panel on-screen horizontally when the field sits near the right edge.
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - CAL_WIDTH - 8));
    setCalStyle({
      position: 'fixed',
      left,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrap.current?.contains(target)) return;
      if (calRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScrollResize = () => reposition();
    document.addEventListener('mousedown', onDown);
    // capture: catch scrolls on any ancestor (the modal body scrolls), not just window
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [open, reposition]);

  // Matches Select's btnSize registers exactly so heights agree in a grid row.
  const btnSize = size === 'sm' ? 'px-2.5 py-1.5 text-[12px]' : 'px-4 py-2.5 text-sm';

  const pretty = value
    ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : placeholder;

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between rounded-lg border border-[var(--border-input)] bg-[#1a1028] ${btnSize} text-left text-white outline-none transition focus:border-[var(--accent)] cursor-pointer`}
      >
        <span className={value ? '' : 'text-[var(--text-muted)]'}>{pretty}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="ml-2 text-[var(--text-muted)] shrink-0"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      {open && createPortal(
        <div ref={calRef} style={calStyle} className="z-[1000]">
          <MiniDatePicker value={value ?? ''} onChange={(iso) => { onChange(iso || null); setOpen(false); }} />
        </div>,
        document.body,
      )}
    </div>
  );
}
