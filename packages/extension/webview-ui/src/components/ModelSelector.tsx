import { useState, useRef, useEffect, useMemo, useId } from 'react';
import { t, useLocale } from '../i18n';
import { FLEET_COPY, isFleetModelId } from '@ava-extension/fleet-copy';

interface ModelSelectorProps {
  models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean; lockedReason?: string }>;
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

/**
 * Paperclip = "this model takes image attachments" — deliberately the SAME
 * glyph as the composer's attach button, struck through when it doesn't.
 * Reusing the composer icon means there's nothing new to learn: that symbol is
 * the attach button, so a strike reads as "attach won't work here".
 *
 * Shown on every row AND on the collapsed toggle — the answer you most need is
 * "can the model I'm on right now see?", and that shouldn't cost a click. On
 * the rows it's on every one, not just the blind ones, so absence is comparable
 * at a glance; a marker you only see occasionally is a marker nobody learns.
 *
 * The strike cuts a real transparent gap via an SVG mask rather than painting a
 * halo in the surface colour: the menu and the toggle sit on different
 * backgrounds, so any hard-coded halo would be wrong on one of them.
 *
 * Icon-only, so it costs no translation; the tooltip carries the words.
 *
 * Mirror of dashboard-ui/src/chat/components/ModelSelector.tsx.
 */
function VisionGlyph({ supported }: { supported: boolean }) {
  const maskId = useId();
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
      style={{ color: '#6c7086', opacity: supported ? 0.45 : 0.9, flexShrink: 0 }}
    >
      {!supported && (
        <mask id={maskId}>
          <rect width="16" height="16" fill="white" />
          <line x1="2.5" y1="13.5" x2="13.5" y2="2.5" stroke="black" strokeWidth="3" strokeLinecap="round" />
        </mask>
      )}
      <path
        d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a2.75 2.75 0 1 1-3.935-3.84l4.486-4.486a1.75 1.75 0 0 1 2.505 2.44L6.623 9.573a.75.75 0 0 1-1.08-1.04l4.473-4.563z"
        fill="currentColor"
        mask={supported ? undefined : `url(#${maskId})`}
      />
      {!supported && (
        <line x1="2.5" y1="13.5" x2="13.5" y2="2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  );
}

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

  // ── Group models for the dropdown ────────────────────────────────────────
  // Pull Orchestrated entries (auto, supernova) into a dedicated section
  // shown first. Group the rest by provider so the dropdown reads like the
  // IDE picker. Available models float to the top of each provider group.
  // MUST run before any conditional return — React hooks rules. Otherwise
  // the empty-state early returns below will desync hook order between
  // renders (React #310).
  const { orchestrated, byProvider, providerOrder } = useMemo(() => {
    // No launch-flag check needed here: the host (AvaViewProvider) omits an
    // unlaunched fleet from `models` entirely, so anything that arrives is
    // meant to be shown.
    const orch = models.filter(m => isFleetModelId(m.id));
    const rest = models.filter(m => !isFleetModelId(m.id));
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
  // Fleet labels come from the shared table with the ✦ glyph stripped — the
  // collapsed toggle shows the brand name plain.
  const activeModelName = FLEET_COPY[activeModel ?? '']?.label.replace('✦ ', '')
    ?? models.find(m => m.id === activeModel)?.name
    ?? 'Select model';

  // Vision state of the model you're actually on — surfaced on the collapsed
  // toggle so "can this see?" doesn't require opening the picker. The fleets
  // live in `models` too, so this covers them without special-casing.
  const activeSupportsVision = models.find(m => m.id === activeModel)?.supportsVision;

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
        <VisionGlyph supported={activeSupportsVision !== false} />
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
            minWidth: 300,
            maxHeight: 420,
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {/* Orchestrated section — Supernova preview + Maestro */}
          {orchestrated.length > 0 && (
            <>
              <div style={sectionHeaderStyle}>{t('dash.model.orchestrated')}</div>
              {orchestrated.map(o => {
                // Maestro is excluded from the locked state as before — it is
                // the baseline fleet and was never rendered as a preview row.
                // Maestro is NOT exempt. It used to be — `o.id !== 'auto' &&`
                // — from when a platform connection was the only route here and
                // Maestro always ran on credits. On API Key it is Qwen, and
                // without a Qwen key the row still read "Best model per task"
                // and stayed clickable. Its locked copy already existed and
                // could never be reached. Mirrors dashboard-ui.
                const isPreview = !o.available;
                const active = activeModel === o.id;
                const copy = FLEET_COPY[o.id];
                const label = copy?.label ?? o.name;
                // Admin gate retired 2026-04-30 — locked state only fires
                // when the user has neither a platform connection nor the
                // BYOK keys for this mode's fleet. Subtitle calls out the
                // unlock path so the picker doubles as a sign-in nudge
                // (except Longxiang, where signing in is not a path at all).
                // Host-supplied reason wins — it names the one key actually
                // missing, so this reads the same as the IDE's picker.
                const subtitle = isPreview ? (o.lockedReason ?? copy?.subLocked) : copy?.sub;
                return (
                  <button
                    key={o.id}
                    disabled={isPreview}
                    onClick={() => {
                      if (isPreview) return;
                      onSwitch(o.id);
                      setOpen(false);
                    }}
                    title={isPreview ? copy?.tipLocked : copy?.tip}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '8px 10px',
                      background: active && !isPreview ? 'rgba(168,85,247,0.15)' : 'transparent',
                      border: 'none', borderRadius: 6,
                      color: isPreview ? '#6c7086' : active ? '#e0b0ff' : '#cdd6f4',
                      fontSize: 12, cursor: isPreview ? 'default' : 'pointer',
                      textAlign: 'left',
                      opacity: isPreview ? 0.55 : 1,
                    }}
                    onMouseEnter={(e) => { if (!isPreview && !active) e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
                    onMouseLeave={(e) => { if (!isPreview && !active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {active && !isPreview && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7' }} />}
                      {label}
                    </span>
                    <span style={{ fontSize: 10, color: isPreview ? '#facc15' : '#a855f7' }}>{subtitle}</span>
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
                    title={!m.available
                      ? `Add ${providerLabel(provider)} API key to unlock`
                      : m.supportsVision === false
                        ? `${m.name} — ${t('model.no_vision_title')}`
                        : m.name}
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
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {!m.available && (
                        <span style={{ fontSize: 10, color: '#facc15', opacity: 0.7 }}>{t('model.add_key')}</span>
                      )}
                      {/* `!== false` mirrors the composer's `=== false` gate: an
                          older host that omits the flag means "unknown", and we
                          don't brand a model blind on a guess. */}
                      <VisionGlyph supported={m.supportsVision !== false} />
                    </span>
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
