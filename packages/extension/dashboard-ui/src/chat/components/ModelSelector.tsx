import { useState, useRef, useEffect, useMemo } from 'react';
import { t, useLocale } from '../../i18n';

interface ModelSelectorProps {
  models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean }>;
  activeModel: string | null;
  needsSetup: boolean;
  onSwitch: (modelId: string) => void;
  onOpenDashboard: () => void;
}

// ── Step 1a of extension↔IDE chat alignment ─────────────────────────────────
// Mirror of webview-ui/src/components/ModelSelector.tsx — same chrome rewrite
// to match the IDE chat header model picker at DashboardPages.tsx:3947-4084.
// Edits land in lockstep on both extension copies (panel webview + dashboard
// chat webview) per `feedback_extension_ide_mirror.md`.

const PROVIDER_LABEL: Record<string, string> = {
  qwen: 'Qwen',
  kimi: 'Kimi',
  deepseek: 'DeepSeek',
  anthropic: 'Anthropic',
  zhipu: 'GLM',
  glm: 'GLM',
  mistral: 'Mistral',
  minimax: 'MiniMax',
  generic: 'Local',
  platform: 'Platform',
};

function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider.toLowerCase()] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function ModelSelector({ models, activeModel, needsSetup, onSwitch, onOpenDashboard }: ModelSelectorProps) {
  useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // useMemo MUST run before any conditional return — hook rules.
  const { orchestrated, byProvider, providerOrder } = useMemo(() => {
    const orch = models.filter(m => m.id === 'auto' || m.id === 'supernova' || m.id === 'aurora');
    const rest = models.filter(m => m.id !== 'auto' && m.id !== 'supernova' && m.id !== 'aurora');
    const groups = new Map<string, typeof models>();
    for (const m of rest) {
      const arr = groups.get(m.provider) ?? [];
      arr.push(m);
      groups.set(m.provider, arr);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => (a.available === b.available ? a.name.localeCompare(b.name) : a.available ? -1 : 1));
    }
    const order = Array.from(groups.keys()).sort((a, b) => providerLabel(a).localeCompare(providerLabel(b)));
    return { orchestrated: orch, byProvider: groups, providerOrder: order };
  }, [models]);

  if (models.length === 0 && needsSetup) {
    return (
      <p className="text-xs opacity-60 m-0" style={{ color: '#cdd6f4' }}>
        {t('model.no_providers')}{' '}
        <button
          onClick={onOpenDashboard}
          className="cursor-pointer underline bg-transparent border-none p-0 text-xs"
          style={{ color: 'var(--accent)' }}
        >
          {t('model.open_settings')}
        </button>{' '}
        to add an API key.
      </p>
    );
  }

  if (models.length === 0) return null;

  const activeModelName = activeModel === 'auto'
    ? 'Maestro'
    : activeModel === 'supernova'
      ? 'Supernova'
      : activeModel === 'aurora'
        ? 'Aurora'
        : models.find(m => m.id === activeModel)?.name ?? 'Select model';

  const connected = !needsSetup;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          background: 'rgba(49, 34, 68, 0.5)',
          border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
          borderRadius: 8,
          color: '#cdd6f4',
          fontSize: 12, fontWeight: 500, cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: connected ? '#a6e3a1' : '#6c7086',
          flexShrink: 0,
        }} />
        {activeModelName}
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 999,
            background: '#160f23',
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            borderRadius: 10,
            padding: 6,
            minWidth: 240,
            maxHeight: 420,
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {orchestrated.length > 0 && (
            <>
              <div style={sectionHeaderStyle}>Orchestrated</div>
              {orchestrated.map(o => {
                const isPreview = (o.id === 'supernova' || o.id === 'aurora') && !o.available;
                const active = activeModel === o.id;
                const label = o.id === 'auto'
                  ? '✦ Maestro'
                  : o.id === 'supernova'
                    ? '✦ Supernova'
                    : '✦ Aurora';
                // Admin gate retired 2026-04-30 — locked state only fires
                // when the user has neither a platform connection nor the
                // BYOK keys for this mode's fleet.
                const subtitle = o.id === 'auto'
                  ? 'Best model per task'
                  : o.id === 'aurora'
                    ? (isPreview ? 'Add Mistral key' : 'EU stack — Mistral end-to-end')
                    : isPreview ? 'Add DeepSeek + Qwen keys' : 'Polyglot ensemble';
                return (
                  <button
                    key={o.id}
                    disabled={isPreview}
                    onClick={() => {
                      if (isPreview) return;
                      onSwitch(o.id);
                      setOpen(false);
                    }}
                    title={isPreview
                      ? (o.id === 'aurora'
                          ? 'Aurora — EU-stack Mistral-only routing. Sign in for platform access, or add a Mistral API key for BYOK.'
                          : 'Supernova — DeepSeek + Qwen polyglot ensemble. Sign in for platform access, or add DeepSeek + Qwen API keys for BYOK.')
                      : o.id === 'auto'
                        ? 'One coordinator handles everything — proven, production-tuned'
                        : o.id === 'aurora'
                          ? 'Aurora — Mistral-only three-tier EU stack. Large 3 coordinator + heavy specialists, Medium 3.5 for Builder + mid-tier + vision + long-form, Small 4 at the intent gate. Stays inside European infrastructure.'
                          : 'Multi-model orchestration — coordinator picks the best specialist for each task'}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '8px 10px',
                      background: active && !isPreview ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                      border: 'none', borderRadius: 6,
                      color: isPreview ? '#6c7086' : active ? '#e0b0ff' : '#cdd6f4',
                      fontSize: 12, cursor: isPreview ? 'default' : 'pointer',
                      textAlign: 'left',
                      opacity: isPreview ? 0.55 : 1,
                    }}
                    onMouseEnter={(e) => { if (!isPreview && !active) e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)'; }}
                    onMouseLeave={(e) => { if (!isPreview && !active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {active && !isPreview && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}
                      {label}
                    </span>
                    <span style={{ fontSize: 10, color: isPreview ? '#facc15' : 'var(--accent)' }}>{subtitle}</span>
                  </button>
                );
              })}
              {providerOrder.length > 0 && <div style={dividerStyle} />}
            </>
          )}

          {providerOrder.map((provider, idx) => (
            <div key={provider}>
              <div style={sectionHeaderStyle}>{providerLabel(provider)}</div>
              {byProvider.get(provider)?.map(m => {
                const active = m.id === activeModel;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      if (!m.available) { onOpenDashboard(); setOpen(false); return; }
                      onSwitch(m.id); setOpen(false);
                    }}
                    title={m.available ? m.name : `Add ${providerLabel(provider)} API key to unlock`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '8px 10px',
                      background: active && m.available ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                      border: 'none', borderRadius: 6,
                      color: !m.available ? '#6c7086' : active ? '#e0b0ff' : '#cdd6f4',
                      fontSize: 12, cursor: 'pointer',
                      textAlign: 'left',
                      opacity: m.available ? 1 : 0.45,
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {active && m.available && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}
                      <span style={{ fontWeight: active && m.available ? 600 : 400 }}>{m.name}</span>
                    </span>
                    {!m.available && (
                      <span style={{ fontSize: 10, color: '#facc15', opacity: 0.7 }}>Add key</span>
                    )}
                  </button>
                );
              })}
              {idx < providerOrder.length - 1 && <div style={dividerStyle} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#6c7086',
  padding: '6px 10px 4px',
  textTransform: 'uppercase',
  letterSpacing: 0.8,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'rgba(49, 34, 68, 0.5)',
  margin: '6px 0',
};
