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
  name: string;
  prefix: string;
  tagline: string;
  example: string;
};

const MODES: Mode[] = [
  { id: 'code', name: 'Work', prefix: '>>', tagline: 'Builder mindset. Ships code.', example: 'add a cancel button to the upload form' },
  { id: 'plan', name: 'Plan', prefix: '::', tagline: 'Architect. Read-only. Thinks first.', example: 'should I extract this logic into a service?' },
  { id: 'chat', name: 'Chat', prefix: '..', tagline: 'Friend mindset. No tools.', example: 'how do I feel about this launch date?' },
  { id: 'teach', name: 'Teach', prefix: '??', tagline: 'Tutor. Builds a curriculum for you.', example: 'teach me Rust async from zero' },
  { id: 'security', name: 'Security', prefix: '!!', tagline: 'Auditor. OWASP scan + report.', example: 'audit this API for injection risks' },
  { id: 'brainstorm', name: 'Brainstorm', prefix: '**', tagline: 'Ideator. Challenges ideas.', example: 'what should I build with 2 weeks free?' },
];

function formatTokens(n: number | null): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function WelcomeModal({
  modelName, freeTokensLimit, freeTokensUsed, isConnected, onClose, onOpenDashboardPage,
}: WelcomeModalProps) {
  const [step, setStep] = useState(0);
  const [selectedMode, setSelectedMode] = useState<Mode>(MODES[0]);

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
            Skip
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {step === 0 && (
            <div>
              <h2 id="welcome-title" className="text-xl font-light text-white mb-2">You just installed your dev partner.</h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-5">
                Ava lives in VS Code now. Same brain as the web, companion and desktop IDE — just embedded where you code.
              </p>

              {/* Account + token summary */}
              <div className="rounded-xl border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)]/50 p-4 space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Model</span>
                  <span className="text-xs font-medium text-white">{modelName || 'Not set'}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Free tokens</span>
                  <span className="text-xs font-medium text-emerald-400">
                    {tokensRemaining !== null ? `${formatTokens(tokensRemaining)} left` : 'BYOK — no limit'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Account</span>
                  <span className="text-xs font-medium text-white">{isConnected ? 'Connected' : 'Local / BYOK'}</span>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 id="welcome-title" className="text-xl font-light text-white mb-2">Pick the mindset you're in.</h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
                Modes change how Ava thinks — the tools she uses and the risks she takes. Switch any time with <kbd className="px-1.5 py-0.5 rounded bg-[var(--vscode-input-background)] text-[10px]">Ctrl+Shift+1–6</kbd> or the mode pill in the chat header.
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
                      <span className="text-sm font-medium text-white">{m.name}</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">{m.tagline}</p>
                  </button>
                ))}
              </div>

              <div className="rounded-lg bg-[var(--vscode-input-background)]/50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Try this in {selectedMode.name} mode
                </p>
                <p className="text-xs font-mono text-[var(--text-secondary)]">
                  <span className="text-[var(--color-accent,#a855f7)]">{selectedMode.prefix}</span> {selectedMode.example}
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 id="welcome-title" className="text-xl font-light text-white mb-2">Memory that learns your code.</h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
                Ava gets better the more you work together — remembering patterns, decisions and conventions, not raw file contents.
              </p>

              <ul className="space-y-2 mb-4">
                {[
                  { strong: 'Saves locally', body: 'to ~/.ava for shared context and .ava in each project for project-specific notes.' },
                  { strong: 'Remembers intent', body: 'architecture decisions, naming preferences, recurring patterns — not your source.' },
                  { strong: 'Cloud sync is opt-in', body: 'toggle Local / Cloud / Both in the chat header. Default is Local.' },
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
                  Your code never leaves this machine unless you choose to sync memory to your account.
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 id="welcome-title" className="text-xl font-light text-white mb-2">Try this now.</h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
                Open a file in VS Code, then paste this into the chat below:
              </p>

              <div className="rounded-lg border border-[var(--color-accent,#a855f7)]/30 bg-[rgba(168,85,247,0.08)] p-4 mb-5">
                <p className="text-sm font-mono text-white">
                  explain what this file does and how it's used
                </p>
              </div>

              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                Or explore
              </p>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => { onOpenDashboardPage('documentation'); complete(); }}
                  className="rounded-lg border border-[var(--vscode-panel-border)] bg-transparent p-3 text-left hover:bg-[var(--vscode-input-background)]/40 transition cursor-pointer"
                >
                  <p className="text-xs font-medium text-white">📘 Docs</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Every mode, every tool</p>
                </button>
                <button
                  onClick={() => { onOpenDashboardPage('creative-studio'); complete(); }}
                  className="rounded-lg border border-[var(--vscode-panel-border)] bg-transparent p-3 text-left hover:bg-[var(--vscode-input-background)]/40 transition cursor-pointer"
                >
                  <p className="text-xs font-medium text-white">🎨 Creative</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Images, music, video</p>
                </button>
                <button
                  onClick={() => { onOpenDashboardPage('account'); complete(); }}
                  className="rounded-lg border border-[var(--vscode-panel-border)] bg-transparent p-3 text-left hover:bg-[var(--vscode-input-background)]/40 transition cursor-pointer"
                >
                  <p className="text-xs font-medium text-white">⚙️ Settings</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Models, keys, sync</p>
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
            ← Back
          </button>
          <button
            onClick={step === 3 ? complete : () => setStep(s => s + 1)}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-[var(--color-accent,#a855f7)] hover:opacity-90 transition cursor-pointer border-none"
          >
            {step === 3 ? "Let's go" : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
