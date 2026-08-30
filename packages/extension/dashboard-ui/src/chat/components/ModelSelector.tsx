import { useState, useRef, useEffect, useMemo, useId } from 'react';
import { t, useLocale } from '../../i18n';
import { FLEET_COPY, isFleetModelId } from '@ava-extension/fleet-copy';

interface ModelSelectorProps {
  models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean; lockedReason?: string }>;
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

// Exported: the composer names the same provider this picker does, and two
// spellings of one vendor is the drift this codebase keeps paying for.
export function providerLabel(provider: string): string {
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
    // The host omits an unlaunched fleet from `models`, so anything here is
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
        <VisionGlyph supported={activeSupportsVision !== false} />
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
            minWidth: 300,
            maxHeight: 420,
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {orchestrated.length > 0 && (
            <>
              <div style={sectionHeaderStyle}>Orchestrated</div>
              {orchestrated.map(o => {
                // Maestro used to be exempt here — `o.id !== 'auto' && !o.available`
                // — on the reasoning that it is the baseline fleet and was never
                // a preview row. That held while a platform connection was the
                // only way anyone got here: Maestro runs on credits, so it was
                // always genuinely reachable.
                //
                // It is not exempt on API Key. Maestro is Qwen, and without a
                // Qwen key there is nothing behind it — but the row still read
                // "Best model per task" and stayed clickable, because this line
                // discarded the availability the host had correctly computed.
                // One row deciding for itself what the host already decided.
                const isPreview = !o.available;
                const active = activeModel === o.id;
                const copy = FLEET_COPY[o.id];
                const label = copy?.label ?? o.name;
                // Admin gate retired 2026-04-30 — locked state only fires
                // when the user has neither a platform connection nor the
                // BYOK keys for this mode's fleet.
                // Host-supplied reason wins — names the one key actually missing.
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
                      // Selectable even without a key. It used to open the
                      // dashboard instead of choosing — which decides for the
                      // user, and leaves the picker as the only place the
                      // requirement is ever stated. Choose it; the composer
                      // says what it needs before anything is typed.
                      onSwitch(m.id); setOpen(false);
                    }}
                    title={!m.available
                      ? `${providerLabel(provider)} needs your own API key`
                      : m.supportsVision === false
                        ? `${m.name} — ${t('model.no_vision_title')}`
                        : m.name}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '8px 10px',
                      background: active && m.available ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                      border: 'none', borderRadius: 6,
                      color: !m.available ? '#6c7086' : active ? '#e0b0ff' : '#cdd6f4',
                      fontSize: 12, cursor: 'pointer',
                      textAlign: 'left',
                      // Dimmed enough to read as "needs something", not so
                      // dim it reads as disabled — it is selectable now.
                      opacity: m.available ? 1 : 0.7,
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {active && m.available && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}
                      <span style={{ fontWeight: active && m.available ? 600 : 400 }}>{m.name}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {!m.available && (
                        <span style={{ fontSize: 10, color: '#facc15', opacity: 0.7 }}>Add key</span>
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
