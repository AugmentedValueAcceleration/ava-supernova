/**
 * Tooltip — themed hover popover.
 *
 * Replaces native `title=""` attributes, which are slow to appear (~1s
 * browser delay), can't be styled, and ignore the IDE's dark theme.
 *
 * Usage:
 *   <Tooltip content="What this button does">
 *     <button>Click me</button>
 *   </Tooltip>
 *
 * The wrapper span has `display: 'contents'` so it doesn't introduce a
 * layout box — flex / grid behaviour of the surrounding container is
 * preserved. Hover and focus both trigger; leave / blur dismiss. Renders
 * the popover via React portal so z-index never has to fight with parent
 * stacking contexts.
 */

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  /** Tooltip body. Plain string or any JSX. */
  content: ReactNode;
  /** Element(s) the tooltip describes. */
  children: ReactNode;
  /** Where to place the tooltip relative to the trigger. */
  placement?: 'top' | 'bottom';
  /** Delay before show, in ms. Default 300 — long enough to avoid noise on
   *  a passing cursor, short enough to feel responsive when hovering with
   *  intent. */
  delay?: number;
  /** Hard cap on tooltip width in px. Default 280 — wide enough for two
   *  lines, narrow enough to never feel like a panel. */
  maxWidth?: number;
  /** When false, the tooltip never opens. Useful for inheriting a parent
   *  decision (e.g. disabled state) without conditional JSX. */
  disabled?: boolean;
}

export function Tooltip({
  content,
  children,
  placement = 'top',
  delay = 300,
  maxWidth = 280,
  disabled = false,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);

  const computePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (placement === 'top') {
      return { top: rect.top - 8, left: rect.left + rect.width / 2 };
    }
    return { top: rect.bottom + 8, left: rect.left + rect.width / 2 };
  }, [placement]);

  const handleEnter = useCallback(() => {
    if (disabled) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const next = computePosition();
      if (next) {
        setPos(next);
        setOpen(true);
      }
    }, delay);
  }, [computePosition, delay, disabled]);

  const handleLeave = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOpen(false);
  }, []);

  // Reposition on scroll / resize while open. Cheap and avoids tooltips
  // floating away from their trigger when the user scrolls a panel.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const next = computePosition();
      if (next) setPos(next);
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, computePosition]);

  // Cleanup pending show timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        // inline-flex (not display:contents) — a real layout box is required
        // so getBoundingClientRect() returns the trigger's actual position.
        // Chromium can return a zero rect for display:contents wrappers,
        // which would render the tooltip pinned to (0,0) off-screen.
        // inline-flex with align-items:center is layout-neutral when the
        // child is a single button or pill segment — it just becomes a
        // flex item containing the original element, no visual change.
        style={{ display: 'inline-flex', alignItems: 'center' }}
      >
        {children}
      </span>
      {open && pos && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            transform: placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            background: 'rgba(15, 10, 26, 0.96)',
            border: '1px solid rgba(168, 85, 247, 0.30)',
            borderRadius: 6,
            padding: '7px 10px',
            fontSize: 11,
            fontWeight: 400,
            color: '#cdd6f4',
            lineHeight: 1.5,
            maxWidth,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            pointerEvents: 'none',
            zIndex: 10000,
            backdropFilter: 'blur(8px)',
            // A short fade in so the tooltip feels intentional rather
            // than abrupt. No fade out — leave is instant so dismissing
            // never lags the cursor.
            animation: 'avaTooltipIn 0.12s ease-out',
          }}
        >
          {content}
        </div>,
        document.body,
      )}
      <style>{`
        @keyframes avaTooltipIn {
          from { opacity: 0; transform: translate(-50%, ${placement === 'top' ? '-95%' : '4px'}); }
          to   { opacity: 1; transform: translate(-50%, ${placement === 'top' ? '-100%' : '0'}); }
        }
      `}</style>
    </>
  );
}
