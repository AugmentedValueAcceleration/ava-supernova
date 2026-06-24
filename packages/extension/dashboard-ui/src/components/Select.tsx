import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, ChevronDownIcon } from './Icons';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** `md` (default) = full-size settings control; `sm` = compact inline
   *  control that fits beside inputs (matches the plan-builder rows). */
  size?: 'sm' | 'md';
  /** Extra classes on the wrapper — width / margins for inline placement. */
  className?: string;
  /** Native-style tooltip passthrough. */
  title?: string;
}

const MENU_DESIRED_HEIGHT = 240; // px — the old max-h-60

export function Select({ value, onChange, options, size = 'md', className = '', title }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  // The menu is rendered in a portal on document.body with fixed positioning
  // so it escapes any `overflow-hidden`/clipping ancestor (e.g. a rounded
  // modal). Position is measured from the trigger and flips above when there
  // isn't room below.
  const reposition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < MENU_DESIRED_HEIGHT && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      120,
      Math.min(MENU_DESIRED_HEIGHT, (openUp ? spaceAbove : spaceBelow) - gap - 8),
    );
    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      minWidth: rect.width,
      maxWidth: Math.max(rect.width, window.innerWidth - rect.left - 8),
      maxHeight,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    const onScrollResize = () => reposition();
    document.addEventListener('mousedown', handleClick);
    // capture: catch scrolls on any ancestor (the modal body scrolls), not just window
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [open, reposition]);

  const selected = options.find(o => o.value === value);
  // `sm` matches the canonical input register (inputCls: px-2.5 py-1.5 text-[12px])
  // so dropdowns line up exactly beside text inputs and date pickers.
  const btnSize = size === 'sm' ? 'px-2.5 py-1.5 text-[12px]' : 'px-4 py-2.5 text-sm';
  const optSize = size === 'sm' ? 'px-3 py-1.5 text-[12px]' : 'px-4 py-2 text-sm';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={title}
        className={`flex w-full items-center justify-between rounded-lg border border-[var(--border-input)] bg-[#1a1028] ${btnSize} text-left text-white outline-none transition focus:border-[var(--accent)]`}
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDownIcon className={`ml-2 h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        // Portaled to body with fixed positioning so the modal's
        // `overflow-hidden` (needed for its rounded corners) can't clip it.
        // bg-card var is 60% opaque which reads transparent when floating over
        // other content, so force the solid hex + backdrop-blur.
        <div
          ref={menuRef}
          style={menuStyle}
          className="z-[1000] overflow-y-auto rounded-lg border border-[var(--border-card)] bg-[#1a1028] py-1 shadow-lg backdrop-blur-sm"
        >
          {options.map(option => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 border-none ${optSize} text-left transition ${
                  isSelected
                    ? 'bg-[var(--accent)]/10 text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-white'
                }`}
              >
                <span className="whitespace-nowrap">{option.label}</span>
                {isSelected && <CheckIcon className="ml-2 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
