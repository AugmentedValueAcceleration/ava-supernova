/**
 * ConnectAccount — dashboard-side sign-in screen.
 *
 * Mirrors the webview-ui SignInScreen component. Three options now that
 * the manual paste-API-key fallback has been removed:
 *
 *   1. Continue with GitHub (primary) — opens /auth/extension?hint=github
 *   2. Sign in with email (secondary) — opens /auth/extension?hint=email
 *   3. Continue without an account — dismisses, routes to BYOK config
 *
 * Two display states:
 *   - idle: the three options visible
 *   - pending: spinner + "Waiting for browser..." + Cancel button
 *
 * Receives the pending state and events via props from App.tsx, which
 * manages the actual sign-in state in its reducer.
 */

import { useLocale } from '../i18n';
import { post } from '../App';

interface ConnectAccountProps {
  onSkipAccount: () => void;
  pendingSignIn: 'github' | 'email' | null;
  signInError: string | null;
  onClearSignInError: () => void;
  /** Start a sign-in — flips to pending state optimistically AND posts to extension host */
  onStartSignIn: (method: 'github' | 'email') => void;
}

export function ConnectAccount({
  onSkipAccount,
  pendingSignIn,
  signInError,
  onClearSignInError,
  onStartSignIn,
}: ConnectAccountProps) {
  useLocale();

  // ── Pending state ──────────────────────────────────────────────────────
  if (pendingSignIn) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        {/* Animated spinner */}
        <div className="relative mx-auto mb-6 h-16 w-16">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--accent)]/20" />
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--accent)]"
            style={{ animation: 'spin 1s linear infinite' }}
          />
        </div>

        <h2 className="mb-2 text-lg font-semibold">
          Waiting for browser...
        </h2>
        <p className="mb-1 text-sm text-[var(--text-secondary)]">
          {pendingSignIn === 'github'
            ? 'Complete sign-in with GitHub in your browser, then return here.'
            : 'Complete sign-in with email in your browser, then return here.'}
        </p>
        <p className="mb-8 text-xs text-[var(--text-muted)]">
          This will time out after 5 minutes.
        </p>

        <button
          onClick={() => post({ type: 'cancel_sign_in' })}
          className="rounded-lg border border-[var(--border-input)] bg-transparent px-4 py-2 text-sm transition hover:bg-[var(--bg-input)]"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-12 max-w-md">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="mb-2 bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] bg-clip-text text-2xl font-bold text-transparent">
          Ava Supernova
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Sign in to sync memory, tasks, and settings across every device
        </p>
      </div>

      {/* Error banner */}
      {signInError && (
        <div
          className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
          onClick={onClearSignInError}
          style={{ cursor: 'pointer' }}
        >
          <p className="mb-0.5 font-medium">Sign-in failed</p>
          <p className="text-xs opacity-80">{signInError}</p>
          <p className="mt-1 text-[10px] opacity-60">(click to dismiss)</p>
        </div>
      )}

      {/* Primary: GitHub */}
      <button
        onClick={() => onStartSignIn('github')}
        className="mb-3 flex w-full items-center justify-center gap-3 rounded-lg border border-[#6e7681]/40 bg-[#24292e] py-3 text-sm font-medium text-white transition hover:bg-[#32383f]"
      >
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
        Continue with GitHub
      </button>

      {/* Secondary: Email */}
      <button
        onClick={() => onStartSignIn('email')}
        className="mb-6 flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--accent)]/35 bg-transparent py-3 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--accent)]/10"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
        Sign in with email
      </button>

      {/* Divider */}
      <div className="mb-5 flex items-center gap-3 text-xs text-[var(--text-muted)]">
        <div className="h-px flex-1 bg-[var(--border-card)]" />
        <span>OR</span>
        <div className="h-px flex-1 bg-[var(--border-card)]" />
      </div>

      {/* Tertiary: Continue without account (BYOK / local-first) */}
      <div className="mb-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5 text-center">
        <p className="mb-2 text-sm font-semibold">Use your own API keys</p>
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          Skip account creation and configure your own provider keys directly. Local-first — your data stays on your machine.
        </p>
        <button
          onClick={onSkipAccount}
          className="w-full rounded-lg border border-[var(--border-input)] bg-transparent py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)] hover:text-white"
        >
          Configure API Keys &rarr;
        </button>
      </div>

      {/* Footer */}
      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
        No account?{' '}
        <button
          onClick={() => onStartSignIn('email')}
          className="border-none bg-transparent text-xs text-[var(--gradient-start)] hover:underline"
        >
          Sign up free &rarr;
        </button>
      </p>
    </div>
  );
}
