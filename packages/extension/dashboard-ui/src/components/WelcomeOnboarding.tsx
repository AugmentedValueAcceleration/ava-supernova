// First-run welcome — adaptive, immersive, for-everyone. Lives in the dashboard
// (Command Centre) so it greets everyone on startup, signed in or not. Opens
// with "What brings you to Ava?" and tailors the tour, then reveals the breadth.
// Shared data: ../onboarding/flow. Copy: onboarding.* (core i18n).

import { useState, useEffect } from 'react';
import { t, useLocale } from '../i18n';
import { PATHS, MODES, BREADTH, stepsFor, pathById, type Destination, type OnboardingPath } from '../onboarding/flow';

interface Props {
  isConnected: boolean;
  welcomeOnStartup: boolean;
  onSetWelcomeOnStartup: (enabled: boolean) => void;
  onClose: () => void;
  /** Navigate the dashboard to a page (overview/chat/journal/learning/health/account/...). */
  onNavigate: (page: string) => void;
}

const STEPS = stepsFor('extension'); // identity, path, tailored, breadth, connect, ready
const ACCENT = 'var(--accent)';

// Standard button — mirrors the chat "New Chat" pill: translucent purple fill,
// purple border + text, subtle hover. The house button style.
const BTN = 'rounded-lg text-sm font-semibold cursor-pointer transition bg-[var(--accent)]/10 border border-[var(--accent)]/25 text-[var(--accent)] hover:bg-[var(--accent)]/20';

const DEST_PAGE: Record<Destination, string> = {
  chat: 'chat',
  journal: 'journal',
  learning: 'learning',
  health: 'health',
  home: 'overview',
};

export function WelcomeOnboarding({ isConnected, welcomeOnStartup, onSetWelcomeOnStartup, onClose, onNavigate }: Props) {
  useLocale();
  const [idx, setIdx] = useState(0);
  const [pathId, setPathId] = useState<string | null>(null);
  const step = STEPS[idx]?.id ?? 'ready';
  const path = pathId ? pathById(pathId) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = () => setIdx((i) => Math.min(i + 1, STEPS.length - 1));
  const back = () => setIdx((i) => Math.max(i - 1, 0));
  const choosePath = (p: OnboardingPath) => { setPathId(p.id); next(); };
  const canNext = step !== 'path' || !!pathId;

  const launch = () => {
    if (path) onNavigate(DEST_PAGE[path.destination]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div
        className="relative flex flex-col rounded-2xl border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-2xl overflow-hidden"
        style={{ width: 'min(1100px, 94vw)', height: 'min(760px, 92vh)', background: 'var(--bg-card, #1a1020)' }}
      >
        {/* Top bar: progress + skip */}
        <div className="flex items-center gap-2 px-6 py-4 border-b border-[rgba(255,255,255,0.06)]">
          {STEPS.map((s, i) => (
            <span key={s.id} className="h-1.5 rounded-full transition-all" style={{ width: i === idx ? 28 : 8, background: i <= idx ? ACCENT : 'rgba(255,255,255,0.15)' }} />
          ))}
          <div className="flex-1" />
          <button onClick={onClose} className="text-xs text-[var(--text-muted)] hover:text-white bg-transparent border-none cursor-pointer">{t('onboarding.skip')}</button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          {step === 'identity' && <IdentityStep />}
          {step === 'path' && <PathStep selected={pathId} onPick={choosePath} />}
          {step === 'tailored' && path && <TailoredStep path={path} />}
          {step === 'breadth' && <BreadthStep />}
          {step === 'connect' && <ConnectStep isConnected={isConnected} onConnect={() => { onNavigate('account'); onClose(); }} />}
          {step === 'ready' && <ReadyStep path={path} onNavigate={onNavigate} onClose={onClose} />}
        </div>

        {/* Footer nav */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-[rgba(255,255,255,0.06)]">
          <button onClick={back} disabled={idx === 0} className={`px-4 py-2 ${BTN} disabled:opacity-30`}>{t('onboarding.back')}</button>
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] cursor-pointer select-none">
            <input type="checkbox" checked={welcomeOnStartup} onChange={(e) => onSetWelcomeOnStartup(e.target.checked)} />
            {t('onboarding.show_on_startup')}
          </label>
          <div className="flex-1" />
          {step === 'ready' ? (
            <button onClick={launch} className={`px-6 py-2 ${BTN}`}>{t('onboarding.ready.go')}</button>
          ) : (
            <button onClick={next} disabled={!canNext} className={`px-6 py-2 ${BTN} disabled:opacity-40`}>{t('onboarding.next')}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function IdentityStep() {
  // Ava's headshot — the host injects a webview-safe URI on #root
  // (data-ava-avatar-uri), the same one the chat bubbles use.
  const avatarUri = typeof document !== 'undefined' ? document.getElementById('root')?.dataset.avaAvatarUri : '';
  return (
    <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto">
      <div className="w-24 h-24 rounded-full mb-6 overflow-hidden flex items-center justify-center text-3xl" style={{ background: 'linear-gradient(135deg, var(--accent), #6366f1)', border: '1px solid color-mix(in srgb, var(--accent) 33%, transparent)' }}>
        {avatarUri
          ? <img src={avatarUri} alt="Ava" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          : '✨'}
      </div>
      <h1 className="text-4xl font-semibold text-[var(--text-primary,#e5e5e5)] mb-4">{t('onboarding.identity.title')}</h1>
      <p className="text-base leading-relaxed text-[var(--text-secondary)]">{t('onboarding.identity.body')}</p>
    </div>
  );
}

function PathStep({ selected, onPick }: { selected: string | null; onPick: (p: OnboardingPath) => void }) {
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-semibold text-[var(--text-primary,#e5e5e5)] mb-1 text-center">{t('onboarding.path.title')}</h2>
      <p className="text-sm text-[var(--text-muted)] mb-6 text-center">{t('onboarding.path.subtitle')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PATHS.map((p) => (
          <button key={p.id} onClick={() => onPick(p)} className="text-left p-4 rounded-xl border cursor-pointer transition flex items-start gap-3"
            style={{ borderColor: selected === p.id ? ACCENT : 'rgba(255,255,255,0.1)', background: selected === p.id ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent' }}>
            <span className="text-2xl">{p.icon}</span>
            <span>
              <span className="block text-sm font-semibold text-[var(--text-primary,#e5e5e5)] mb-0.5">{t(p.labelKey)}</span>
              <span className="block text-xs text-[var(--text-muted)] leading-relaxed">{t(p.blurbKey)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TailoredStep({ path }: { path: OnboardingPath }) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-3xl">{path.icon}</span>
        <h2 className="text-2xl font-semibold text-[var(--text-primary,#e5e5e5)]">{t(path.labelKey)}</h2>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">{t('onboarding.tailored.heading')}</p>
      <div className="space-y-3">
        {path.tailoredKeys.map((base) => (
          <div key={base} className="p-4 rounded-xl border border-[rgba(255,255,255,0.1)]">
            <div className="text-sm font-semibold text-[var(--text-primary,#e5e5e5)] mb-1.5">{t(`${base}.title`)}</div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{t('onboarding.try_this')}</span>
              <code className="text-xs px-2 py-1 rounded" style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: ACCENT }}>{t(`${base}.example`)}</code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BreadthStep() {
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-semibold text-[var(--text-primary,#e5e5e5)] mb-1 text-center">{t('onboarding.breadth.title')}</h2>
      <p className="text-sm text-[var(--text-muted)] mb-6 text-center">{t('onboarding.breadth.subtitle')}</p>
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mb-2">{t('onboarding.breadth.group.modes')}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {MODES.map((m) => (
            <div key={m.id} className="p-2.5 rounded-lg border border-[rgba(255,255,255,0.08)] flex items-center gap-2">
              <code className="text-xs" style={{ color: ACCENT }}>{m.prefix}</code>
              <span className="text-xs text-[var(--text-secondary)]">{t(m.labelKey)}</span>
            </div>
          ))}
        </div>
      </div>
      {BREADTH.filter((g) => g.surfaces.includes('extension')).map((g) => (
        <div key={g.titleKey} className="mb-5">
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mb-2">{t(g.titleKey)}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {g.items.map((it) => (
              <div key={it.labelKey} className="p-3 rounded-lg border border-[rgba(255,255,255,0.08)] flex items-start gap-2.5">
                <span className="text-lg">{it.icon}</span>
                <span>
                  <span className="block text-xs font-semibold text-[var(--text-primary,#e5e5e5)]">{t(it.labelKey)}</span>
                  <span className="block text-[11px] text-[var(--text-muted)]">{t(it.blurbKey)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConnectStep({ isConnected, onConnect }: { isConnected: boolean; onConnect: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto">
      <div className="w-16 h-16 rounded-full mb-5 flex items-center justify-center text-2xl" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)' }}>{isConnected ? '✓' : '🔒'}</div>
      <h2 className="text-2xl font-semibold text-[var(--text-primary,#e5e5e5)] mb-2">{t('onboarding.connect.title')}</h2>
      <p className="text-sm text-[var(--text-muted)] mb-1">{t('onboarding.connect.subtitle')}</p>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">{t('onboarding.connect.body')}</p>
      {!isConnected && (
        <button onClick={onConnect} className={`px-5 py-2 ${BTN}`}>{t('onboarding.connect.title')}</button>
      )}
    </div>
  );
}

function ReadyStep({ path, onNavigate, onClose }: { path: OnboardingPath | undefined; onNavigate: (p: string) => void; onClose: () => void }) {
  const pathLabel = path ? t(path.labelKey) : t('onboarding.path.explore.label');
  const cards: { icon: string; label: string; desc: string; page: string }[] = [
    { icon: '📘', label: t('onboarding.ready.docs'), desc: t('onboarding.ready.docs_desc'), page: 'documentation' },
    { icon: '🎨', label: t('onboarding.ready.create'), desc: t('onboarding.ready.create_desc'), page: 'creative-studio' },
    { icon: '⚙️', label: t('onboarding.ready.settings'), desc: t('onboarding.ready.settings_desc'), page: 'account' },
  ];
  return (
    <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto">
      <div className="text-4xl mb-4">🚀</div>
      <h2 className="text-3xl font-semibold text-[var(--text-primary,#e5e5e5)] mb-3">{t('onboarding.ready.title')}</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-8">{t('onboarding.ready.body').replace('{path}', pathLabel)}</p>
      <div className="grid grid-cols-3 gap-3 w-full">
        {cards.map((c) => (
          <button key={c.page} onClick={() => { onNavigate(c.page); onClose(); }} className="text-left p-3 rounded-xl border border-[rgba(255,255,255,0.1)] cursor-pointer hover:bg-white/5 transition">
            <div className="text-lg mb-1">{c.icon}</div>
            <div className="text-xs font-semibold text-[var(--text-primary,#e5e5e5)]">{c.label}</div>
            <div className="text-[11px] text-[var(--text-muted)]">{c.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
