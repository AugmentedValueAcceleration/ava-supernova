import { useState, useRef, useEffect, useMemo } from 'react';
import { t, useLocale } from '../i18n';

interface ModelSelectorProps {
  models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean }>;
  activeModel: string | null;
  needsSetup: boolean;
  onSwitch: (modelId: string) => void;
  onOpenDashboard: () => void;
}

// ── Step 1a of extension↔IDE chat alignment ─────────────────────────────────
// Chrome rewritten to mirror the IDE chat header model picker at
// DashboardPages.tsx:3947-4084 — purple-bordered button with a 7px status
// dot (green when connected, grey otherwise), rotating chevron, dropdown
// panel with Orchestrated section header and per-provider group headers.
// Brand-purple wins over VS Code theme tokens per the alignment directive
// (`feedback_extension_ide_mirror.md` — extension matches IDE).
//
// Behaviour and data shape are unchanged. This is purely visual.

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

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Setup placeholder — keeps the empty-state behaviour but in IDE chrome
  if (models.length === 0 && needsSetup) {
    return (
      <p className="text-xs opacity-60 m-0" style={{ color: '#cdd6f4' }}>
        {t('model.no_providers')}{' '}
        <button
          onClick={onOpenDashboard}
          className="cursor-pointer underline bg-transparent border-none p-0 text-xs"
          style={{ color: '#a855f7' }}
        >
          {t('model.open_settings')}
        </button>{' '}
        to add an API key.
      </p>
    );
  }

  if (models.length === 0) return null;

  // Active model display name — Maestro / Supernova have brand labels;
  // every other id maps to its model row's `name` field.
  const activeModelName = activeModel === 'auto'
    ? 'Maestro'
    : activeModel === 'supernova'
      ? 'Supernova'
      : models.find(m => m.id === activeModel)?.name ?? 'Select model';

  // ── Group models for the dropdown ────────────────────────────────────────
  // Pull Orchestrated entries (auto, supernova) into a dedicated section
  // shown first. Group the rest by provider so the dropdown reads like the
  // IDE picker. Available models float to the top of each provider group.
  const { orchestrated, byProvider, providerOrder } = useMemo(() => {
    const orch = models.filter(m => m.id === 'auto' || m.id === 'supernova');
    const rest = models.filter(m => m.id !== 'auto' && m.id !== 'supernova');
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

  const connected = !needsSetup;

  return (
    <div ref={ref} className="relative">
      {/* ── Toggle button ─────────────────────────────────────────────────
          Mirrors DashboardPages.tsx:3954-3971 — purple-bordered chip,
          status dot reflects connection, chevron rotates on open. */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          background: 'rgba(49, 34, 68, 0.5)',
          border: '1px solid rgba(168, 85, 247, 0.2)',
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

      {/* ── Dropdown menu ─────────────────────────────────────────────────
          Mirrors DashboardPages.tsx:3974-4083 — dark purple-tinted panel
          with Orchestrated section + per-provider groups. Active row gets
          a small purple dot and a tinted background. */}
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 999,
            background: 'rgba(26, 16, 40, 0.95)',
            border: '1px solid rgba(168, 85, 247, 0.12)',
            borderRadius: 10,
            padding: 6,
            minWidth: 240,
            maxHeight: 420,
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {/* Orchestrated section — Supernova preview + Maestro */}
          {orchestrated.length > 0 && (
            <>
              <div style={sectionHeaderStyle}>Orchestrated</div>
              {orchestrated.map(o => {
                const isSupernovaPreview = o.id === 'supernova' && !o.available;
                const active = activeModel === o.id;
                const label = o.id === 'auto' ? '✦ Maestro' : '✦ Supernova';
                const subtitle = o.id === 'auto'
                  ? 'Best model per task'
                  : isSupernovaPreview ? 'In development' : 'Polyglot ensemble';
                return (
                  <button
                    key={o.id}
                    disabled={isSupernovaPreview}
                    onClick={() => {
                      if (isSupernovaPreview) return;
                      onSwitch(o.id);
                      setOpen(false);
                    }}
                    title={isSupernovaPreview
                      ? 'Supernova — polyglot multi-model orchestration. In development; rolling out soon.'
                      : o.id === 'auto'
                        ? 'One coordinator handles everything — proven, production-tuned'
                        : 'Multi-model orchestration — coordinator picks the best specialist for each task'}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '8px 10px',
                      background: active && !isSupernovaPreview ? 'rgba(168,85,247,0.15)' : 'transparent',
                      border: 'none', borderRadius: 6,
                      color: isSupernovaPreview ? '#6c7086' : active ? '#e0b0ff' : '#cdd6f4',
                      fontSize: 12, cursor: isSupernovaPreview ? 'default' : 'pointer',
                      textAlign: 'left',
                      opacity: isSupernovaPreview ? 0.55 : 1,
                    }}
                    onMouseEnter={(e) => { if (!isSupernovaPreview && !active) e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
                    onMouseLeave={(e) => { if (!isSupernovaPreview && !active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {active && !isSupernovaPreview && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7' }} />}
                      {label}
                    </span>
                    <span style={{ fontSize: 10, color: isSupernovaPreview ? '#facc15' : '#a855f7' }}>{subtitle}</span>
                  </button>
                );
              })}
              {providerOrder.length > 0 && <div style={dividerStyle} />}
            </>
          )}

          {/* Per-provider groups */}
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
                      background: active && m.available ? 'rgba(168,85,247,0.15)' : 'transparent',
                      border: 'none', borderRadius: 6,
                      color: !m.available ? '#6c7086' : active ? '#e0b0ff' : '#cdd6f4',
                      fontSize: 12, cursor: m.available ? 'pointer' : 'pointer', // pointer either way — click navigates to dashboard for setup
                      textAlign: 'left',
                      opacity: m.available ? 1 : 0.45,
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {active && m.available && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7' }} />}
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
