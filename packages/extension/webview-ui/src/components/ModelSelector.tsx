import { useState, useRef, useEffect } from 'react';
import { t } from '../i18n';

interface ModelSelectorProps {
  models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean }>;
  activeModel: string | null;
  needsSetup: boolean;
  onSwitch: (modelId: string) => void;
  onOpenDashboard: () => void;
}

export function ModelSelector({ models, activeModel, needsSetup, onSwitch, onOpenDashboard }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (models.length === 0 && needsSetup) {
    return (
      <p className="text-xs opacity-60 m-0">
        {t('model.no_providers')}{' '}
        <button
          onClick={onOpenDashboard}
          className="text-[var(--vscode-textLink-foreground)] cursor-pointer underline bg-transparent border-none p-0 text-xs"
        >
          {t('model.open_settings')}
        </button>{' '}
        to add an API key.
      </p>
    );
  }

  if (models.length === 0) return null;

  const activeModelName = models.find(m => m.id === activeModel)?.name ?? 'Select model';

  // Sort: available first, then alphabetical by provider
  const sorted = [...models].sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.provider.localeCompare(b.provider);
  });

  return (
    <div ref={ref} className="relative">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-[3px] rounded
                   bg-[var(--vscode-input-background)]
                   text-[var(--vscode-input-foreground)]
                   border border-[var(--vscode-input-border)]
                   text-[11px] cursor-pointer outline-none whitespace-nowrap"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block shrink-0" />
        {activeModelName}
        <span className="text-[8px] opacity-50 ml-0.5">▼</span>
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          className="absolute top-[calc(100%+4px)] left-0 min-w-[220px] max-h-[400px] overflow-y-auto rounded-md overflow-x-hidden z-[1000]
                     bg-[var(--vscode-input-background)]
                     border border-[var(--vscode-input-border)]
                     shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
        >
          <div className="px-2.5 py-1.5 text-[10px] opacity-40 font-semibold tracking-[0.5px] uppercase">
            Models
          </div>
          {sorted.map(m => (
            <button
              key={m.id}
              onClick={() => {
                if (!m.available) { onOpenDashboard(); setOpen(false); return; }
                onSwitch(m.id); setOpen(false);
              }}
              className={`flex items-center gap-2 w-full px-2.5 py-1.5 border-none text-[12px] text-left
                         ${m.available ? 'cursor-pointer' : 'cursor-default'}
                         ${!m.available
                           ? 'opacity-35 text-[var(--vscode-input-foreground)]'
                           : 'text-[var(--vscode-input-foreground)]'}
                         ${m.available && m.id === activeModel
                           ? 'bg-[rgba(168,85,247,0.15)]'
                           : m.available
                             ? 'bg-transparent hover:bg-[rgba(168,85,247,0.08)]'
                             : 'bg-transparent'}`}
              title={m.available ? m.name : `Add ${m.provider} API key to unlock`}
            >
              <span
                className={`w-[5px] h-[5px] rounded-full shrink-0
                           ${m.id === activeModel && m.available ? 'bg-[#A855F7]' : m.available ? 'bg-white/15' : 'bg-white/5'}`}
              />
              <span className={m.id === activeModel && m.available ? 'font-semibold' : 'font-normal'}>
                {m.name}
              </span>
              <span className="text-[10px] opacity-35 ml-auto">{m.provider}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
