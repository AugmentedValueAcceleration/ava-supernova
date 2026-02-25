import { useState, useRef, useEffect } from 'react';
import { CheckIcon, ChevronDownIcon } from './Icons';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}

export function Select({ value, onChange, options }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-4 py-2.5 text-left text-sm text-white outline-none transition focus:border-[var(--accent)]"
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDownIcon className={`ml-2 h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] py-1 shadow-lg">
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
                className={`flex w-full items-center justify-between border-none px-4 py-2 text-left text-sm transition ${
                  isSelected
                    ? 'bg-[var(--accent)]/10 text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-white'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && <CheckIcon className="ml-2 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
