import type { KeyboardEvent } from 'react';

/**
 * A number input with OUR stepper instead of the browser's. The native
 * spinner is a grey Windows widget that ignores the theme — the operator
 * flagged it the first time the load-range card was seen live. The native
 * control is kept (keyboard arrows, inputMode, validation) with its spinner
 * hidden via the `ava-number` class; the two chevrons beside it nudge by
 * `step` and never go below `min`.
 */
interface NumberFieldProps {
  value: string;
  onChange: (next: string) => void;
  step?: number;
  min?: number;
  inputMode?: 'numeric' | 'decimal';
  placeholder?: string;
  widthClass?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}

export function NumberField({ value, onChange, step = 1, min = 0, inputMode = 'numeric', placeholder, widthClass = 'w-24', autoFocus, onEnter }: NumberFieldProps) {
  const nudge = (dir: 1 | -1) => {
    const cur = value.trim() === '' ? 0 : Number(value);
    if (!Number.isFinite(cur)) return;
    const next = Math.max(min, Math.round((cur + dir * step) * 100) / 100);
    onChange(String(next));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onEnter) onEnter();
  };
  const chevron = 'flex items-center justify-center h-[11px] w-5 border-none bg-transparent cursor-pointer text-[var(--text-muted)] hover:text-[var(--accent)] p-0 leading-none';
  return (
    <span className={`inline-flex items-stretch rounded-lg border border-[var(--border)] focus-within:border-[var(--accent)] ${widthClass}`}>
      <input
        type="number"
        className="ava-number min-w-0 flex-1 bg-transparent px-2 py-1 text-[13px] text-[var(--text-primary)] border-none outline-none"
        value={value}
        step={step}
        min={min}
        inputMode={inputMode}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <span className="flex flex-col justify-center pr-1" aria-hidden="true">
        <button type="button" tabIndex={-1} className={chevron} onClick={() => nudge(1)}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg>
        </button>
        <button type="button" tabIndex={-1} className={chevron} onClick={() => nudge(-1)}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </span>
    </span>
  );
}
