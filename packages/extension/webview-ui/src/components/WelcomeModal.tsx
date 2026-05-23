// First-run welcome modal. Surfaces once after the user has passed
// setup (signed in OR added a BYOK key and picked a model). Four
// screens: orientation → modes → memory → try-this-now. Dismissed
// permanently via the mark_onboarded message.
//
// Design principles applied:
//   • One idea per step, max two lines of body.
//   • Teaches "mode = mindset" instead of dumping the six-mode grid
//     as terminology.
//   • Sets the local-first expectation explicitly on the memory
//     screen so users don't assume cloud magic.
//   • Final step is ONE obvious next move, not a menu.
//
// Accessibility: ESC closes the modal (treated as completing — no
// guilt reshow). Focus trap via tabIndex on the container.
//
// Not platform-gated — renders in the chat webview because that's
// where users land after the sign-in flow completes.

import { useState, useEffect } from 'react';
import { t, useLocale } from '../i18n';

interface WelcomeModalProps {
  modelName: string | null;
  freeTokensLimit: number | null;
  freeTokensUsed: number | null;
  isConnected: boolean;
  /** Called when the user dismisses the modal by any path — Skip, ESC,
   *  "Let's go" on the final step, or clicking a deep-link card.
   *  The parent handles the mark_onboarded postMessage + state flip. */
  onClose: () => void;
  /** Deep-link to a dashboard page — used by the three shortcut cards
   *  on the final step. Parent wires this to the open_dashboard_page
   *  host message. */
  onOpenDashboardPage: (page: 'documentation' | 'creative-studio' | 'account') => void;
}

type Mode = {
  id: 'code' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm';
  prefix: string;
};

// Static config only — display strings (name / tagline / example) are
// resolved from locale keys at render time. Never hold live t() output here.
const MODES: Mode[] = [
  { id: 'code', prefix: '>>' },
  { id: 'plan', prefix: '::' },
  { id: 'chat', prefix: '..' },
  { id: 'teach', prefix: '??' },
  { id: 'security', prefix: '!!' },
  { id: 'brainstorm', prefix: '**' },
];

export function WelcomeModal({
  modelName, freeTokensLimit, freeTokensUsed, isConnected, onClose, onOpenDashboardPage,
}: WelcomeModalProps) {
  useLocale();
  const [step, setStep] = useState(0);
  const [selectedMode, setSelectedMode] = useState<Mode>(MODES[0]);

  const modeName = (m: Mode) => t(`welcome_modal.mode.${m.id}.name`);
  const modeTagline = (m: Mode) => t(`welcome_modal.mode.${m.id}.tagline`);
  const modeExample = (m: Mode) => t(`welcome_modal.mode.${m.id}.example`);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const complete = () => onClose();

  const tokensRemaining = (freeTokensLimit != null && freeTokensUsed != null)
    ? Math.max(0, freeTokensLimit - freeTokensUsed)
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div
        className="w-[min(560px,92vw)] max-h-[86vh] overflow-y-auto rounded-2xl border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] shadow-2xl"
        tabIndex={-1}
      >
        {/* Step indicator */}
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex items-center gap-2">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === step ? 24 : 8,
                  background: i <= step ? 'var(--color-accent, #a855f7)' : 'rgba(168,85,247,0.2)',
                }}
              />
            ))}
          </div>
          <button
            onClick={complete}
            className="text-[11px] text-[var(--text-muted)] hover:text-white bg-transparent border-none cursor-pointer"
          >
            {t('welcome_modal.skip')}
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {step === 0 && (
            <div>
              <h2 id="welcome-title" className="text-xl font-light text-white mb-2">{t('welcome_modal.step0.title')}</h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-5">
                {t('welcome_modal.step0.body')}
              </p>

              {/* Account + token summary */}
              <div className="rounded-xl border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)]/50 p-4 space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t('welcome_modal.model')}</span>
                  <span className="text-xs font-medium text-white">{modelName || t('welcome_modal.not_set')}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t('welcome_modal.free_credits')}</span>
                  <span className="text-xs font-medium text-emerald-400">
                    {tokensRemaining !== null ? t('welcome_modal.credits_left', { count: tokensRemaining.toLocaleString('en-US') }) : t('welcome_modal.byok_no_limit')}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t('welcome_modal.account')}</span>
                  <span className="text-xs font-medium text-white">{isConnected ? t('welcome_modal.connected') : t('welcome_modal.local_byok')}</span>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 id="welcome-title" className="text-xl font-light text-white mb-2">{t('welcome_modal.step1.title')}</h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
                {t('welcome_modal.step1.body_before')} <kbd className="px-1.5 py-0.5 rounded bg-[var(--vscode-input-background)] text-[10px]">Ctrl+Shift+1–6</kbd> {t('welcome_modal.step1.body_after')}
              </p>

              <div className="grid grid-cols-2 gap-2 mb-3">
                {MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMode(m)}
                    className={`text-left p-3 rounded-lg border transition ${
                      selectedMode.id === m.id
                        ? 'border-[var(--color-accent,#a855f7)]/50 bg-[rgba(168,85,247,0.08)]'
                        : 'border-[var(--vscode-panel-border)] bg-transparent hover:bg-[var(--vscode-input-background)]/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-[var(--color-accent,#a855f7)]">{m.prefix}</span>
                      <span className="text-sm font-medium text-white">{modeName(m)}</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">{modeTagline(m)}</p>
                  </button>
                ))}
              </div>

              <div className="rounded-lg bg-[var(--vscode-input-background)]/50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  {t('welcome_modal.try_in_mode', { mode: modeName(selectedMode) })}
                </p>
                <p className="text-xs font-mono text-[var(--text-secondary)]">
                  <span className="text-[var(--color-accent,#a855f7)]">{selectedMode.prefix}</span> {modeExample(selectedMode)}
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 id="welcome-title" className="text-xl font-light text-white mb-2">{t('welcome_modal.step2.title')}</h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
                {t('welcome_modal.step2.body')}
              </p>

              <ul className="space-y-2 mb-4">
                {[
                  { strong: t('welcome_modal.step2.item1_strong'), body: t('welcome_modal.step2.item1_body') },
                  { strong: t('welcome_modal.step2.item2_strong'), body: t('welcome_modal.step2.item2_body') },
                  { strong: t('welcome_modal.step2.item3_strong'), body: t('welcome_modal.step2.item3_body') },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--color-accent,#a855f7)]" />
                    <span className="text-xs text-[var(--text-secondary)]">
                      <span className="text-white font-medium">{item.strong}</span> — {item.body}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-xs text-emerald-300">
                  {t('welcome_modal.step2.note')}
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 id="welcome-title" className="text-xl font-light text-white mb-2">{t('welcome_modal.step3.title')}</h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
                {t('welcome_modal.step3.body')}
              </p>

              <div className="rounded-lg border border-[var(--color-accent,#a855f7)]/30 bg-[rgba(168,85,247,0.08)] p-4 mb-5">
                <p className="text-sm font-mono text-white">
                  {t('welcome_modal.step3.example')}
                </p>
              </div>

              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                {t('welcome_modal.step3.or_explore')}
              </p>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => { onOpenDashboardPage('documentation'); complete(); }}
                  className="rounded-lg border border-[var(--vscode-panel-border)] bg-transparent p-3 text-left hover:bg-[var(--vscode-input-background)]/40 transition cursor-pointer"
                >
                  <p className="text-xs font-medium text-white">📘 {t('welcome_modal.card.docs')}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t('welcome_modal.card.docs_desc')}</p>
                </button>
                <button
                  onClick={() => { onOpenDashboardPage('creative-studio'); complete(); }}
                  className="rounded-lg border border-[var(--vscode-panel-border)] bg-transparent p-3 text-left hover:bg-[var(--vscode-input-background)]/40 transition cursor-pointer"
                >
                  <p className="text-xs font-medium text-white">🎨 {t('welcome_modal.card.creative')}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t('welcome_modal.card.creative_desc')}</p>
                </button>
                <button
                  onClick={() => { onOpenDashboardPage('account'); complete(); }}
                  className="rounded-lg border border-[var(--vscode-panel-border)] bg-transparent p-3 text-left hover:bg-[var(--vscode-input-background)]/40 transition cursor-pointer"
                >
                  <p className="text-xs font-medium text-white">⚙️ {t('welcome_modal.card.settings')}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t('welcome_modal.card.settings_desc')}</p>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--vscode-panel-border)]">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-xs text-[var(--text-muted)] hover:text-white bg-transparent border-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← {t('welcome_modal.back')}
          </button>
          <button
            onClick={step === 3 ? complete : () => setStep(s => s + 1)}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-[var(--color-accent,#a855f7)] hover:opacity-90 transition cursor-pointer border-none"
          >
            {step === 3 ? t('welcome_modal.lets_go') : `${t('welcome_modal.next')} →`}
          </button>
        </div>
      </div>
    </div>
  );
}
