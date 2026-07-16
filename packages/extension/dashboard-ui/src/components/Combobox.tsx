import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A free-form text field with a themed suggestion dropdown.
 *
 * Exists because `<input list>` + `<datalist>` renders the browser's own
 * dropdown — light-themed, unstyleable, and visibly foreign next to our
 * Selects. This keeps the "pick a preset or type your own" behaviour that a
 * plain Select would take away, while looking like everything around it.
 *
 * The menu is portaled to <body> with fixed positioning — exactly like Select —
 * so a modal's max-height/overflow can't clip it, and it flips above the field
 * when there isn't room below.
 *
 * `size` mirrors Select's API so a Combobox lines up with a Select in the same
 * grid row: `sm` = compact inline register, `md` (default) = full-size control.
 */
interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Preset values offered in the dropdown. Typing is never restricted to them. */
  options: string[];
  placeholder?: string;
  size?: 'sm' | 'md';
}

const MENU_DESIRED_HEIGHT = 200;

export function Combobox({ value, onChange, options, placeholder, size = 'md' }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const reposition = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < MENU_DESIRED_HEIGHT && spaceAbove > spaceBelow;
    const maxHeight = Math.max(96, Math.min(MENU_DESIRED_HEIGHT, (openUp ? spaceAbove : spaceBelow) - gap - 8));
    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      maxHeight,
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
      if (menuRef.current?.contains(target)) return;
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

  // Matches Select's registers exactly so heights agree in a grid row.
  const inputSize = size === 'sm' ? 'px-2.5 py-1.5 text-[12px]' : 'px-4 py-2.5 text-sm';
  const optSize = size === 'sm' ? 'px-3 py-1.5 text-[12px]' : 'px-4 py-2 text-sm';

  // Filter as you type, but never show an empty box — with no matches we close.
  const q = value.trim().toLowerCase();
  const matches = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;

  return (
    <div className="relative" ref={wrap}>
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] ${inputSize} text-white placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]/50`}
      />
      {open && matches.length > 0 && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="z-[1000] overflow-y-auto rounded-lg border border-[var(--border-card)] bg-[#1a1028] py-1 shadow-lg backdrop-blur-sm"
        >
          {matches.map((o) => (
            <button
              key={o}
              type="button"
              onMouseDown={(e) => e.preventDefault()} // keep focus so the input doesn't blur-close first
              onClick={() => { onChange(o); setOpen(false); }}
              className={`flex w-full items-center ${optSize} text-left border-none cursor-pointer transition ${
                o === value
                  ? 'bg-[var(--accent)]/15 text-white'
                  : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--accent)]/10 hover:text-white'
              }`}
            >
              {o}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
