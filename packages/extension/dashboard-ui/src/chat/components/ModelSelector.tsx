import { useState, useRef, useEffect } from 'react';
import { t, useLocale } from '../../i18n';

interface ModelSelectorProps {
  models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean }>;
  activeModel: string | null;
  needsSetup: boolean;
  onSwitch: (modelId: string) => void;
  onOpenDashboard: () => void;
}

export function ModelSelector({ models, activeModel, needsSetup, onSwitch, onOpenDashboard }: ModelSelectorProps) {
  useLocale();
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

  const isAuto = activeModel === 'auto';
  const isSupernova = activeModel === 'supernova';
  const activeModelName = isAuto
    ? 'Maestro'
    : isSupernova
      ? 'Supernova'
      : (models.find(m => m.id === activeModel)?.name ?? 'Select model');

  // Sort: Auto first, then available, then alphabetical by provider
  const sorted = [...models].sort((a, b) => {
    if (a.id === 'auto') return -1;
    if (b.id === 'auto') return 1;
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
        <span className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${(isAuto || isSupernova) ? 'bg-[#A855F7]' : 'bg-green-500'}`} />
        {isAuto ? '✦ Maestro' : isSupernova ? '✦ Supernova' : activeModelName}
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
          {/* Orchestrated modes — Supernova (polyglot ensemble) on top,
              Maestro (single conductor) below. Both get the highlighted
              promo treatment because they're Ava-orchestrated, not raw
              model picks. Disabled state ('In development') for entries
              the user can preview but not yet activate (e.g. Supernova
              for non-admin while V4 partnership is pending). */}
          {(() => {
            const orchestrated: { id: string; label: string; subtitle: string; title: string }[] = [
              { id: 'supernova', label: '✦ Supernova', subtitle: 'Polyglot ensemble',  title: 'Multi-model orchestration — coordinator picks the best specialist for each task' },
              { id: 'auto',      label: '✦ Maestro',   subtitle: 'Single conductor',    title: 'One coordinator handles everything — proven, production-tuned' },
            ];
            return orchestrated
              .map(o => ({ o, m: sorted.find(s => s.id === o.id) }))
              .filter(x => x.m !== undefined)
              .map(({ o, m }) => {
                const enabled = m!.available;
                const subtitle = enabled ? o.subtitle : 'In development';
                return (
                  <button
                    key={o.id}
                    onClick={() => { if (!enabled) return; onSwitch(o.id); setOpen(false); }}
                    disabled={!enabled}
                    className={`flex items-center gap-2 w-full px-2.5 py-2 border-none text-[12px] text-left
                               text-[var(--vscode-input-foreground)]
                               ${enabled ? 'cursor-pointer' : 'cursor-default opacity-40'}
                               ${enabled && activeModel === o.id
                                 ? 'bg-[rgba(168,85,247,0.15)]'
                                 : enabled
                                   ? 'bg-transparent hover:bg-[rgba(168,85,247,0.08)]'
                                   : 'bg-transparent'}`}
                    title={enabled ? o.title : `${o.label.replace('✦ ', '')} — ${o.subtitle}. In development; admin-gated while DeepSeek partnership is finalised.`}
                  >
                    <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${enabled && activeModel === o.id ? 'bg-[#A855F7]' : 'bg-white/15'}`} />
                    <span className={enabled && activeModel === o.id ? 'font-semibold' : 'font-normal'}>
                      {o.label}
                    </span>
                    <span className={`text-[10px] ml-auto ${enabled ? 'opacity-50' : 'opacity-70 text-[#facc15]'}`}>
                      {subtitle}
                    </span>
                  </button>
                );
              });
          })()}
          {sorted.some(m => m.id === 'auto' || m.id === 'supernova') && (
            <div className="border-t border-[var(--vscode-input-border)] my-1 opacity-30" />
          )}
          <div className="px-2.5 py-1.5 text-[10px] opacity-40 font-semibold tracking-[0.5px] uppercase">
            Models
          </div>
          {sorted.filter(m => m.id !== 'auto' && m.id !== 'supernova').map(m => (
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
              title={m.available ? m.name : `Add ${m.provider} API key to use ${m.name}`}
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
