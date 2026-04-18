/**
 * SignInScreen — first-run / setup-state UI for v0.37.0 OAuth sign-in.
 *
 * Shown when the extension has no model configured (needsSetup === true)
 * and the user hasn't yet signed in or chosen to continue without an
 * account. Replaces the old "paste your platform key" banner with a proper
 * OAuth-first flow.
 *
 * Four options, in priority order:
 *   1. Continue with GitHub — primary CTA, opens browser to /auth/extension
 *      with hint=github
 *   2. Sign in with email — secondary, same flow with hint=email
 *   3. Continue without an account — local-first preserve, opens Dashboard
 *      so the user can configure BYOK provider keys directly
 *   4. Have an API key? Paste it instead — 30-day fallback for users with
 *      existing manually-generated platform keys; opens Dashboard
 *
 * The screen has two display states:
 *   - idle: four options visible
 *   - pending: spinner + "Waiting for browser..." + Cancel button
 *     (controlled by pendingMethod prop)
 */

import { useEffect } from 'react';
import { t } from '../i18n';

interface SignInScreenProps {
  /** If set, a sign-in attempt is in progress — render the pending state */
  pendingMethod: 'github' | 'email' | null;
  /** Last error message from a failed sign-in attempt, if any */
  signInError: string | null;
  /** Start a sign-in with the given method */
  onStartSignIn: (method: 'github' | 'email') => void;
  /** Cancel an in-flight sign-in */
  onCancelSignIn: () => void;
  /** Open the dashboard (for BYOK setup or manual key paste) */
  onOpenDashboard: () => void;
  /** Clear the current sign-in error */
  onClearError: () => void;
}

export function SignInScreen({
  pendingMethod,
  signInError,
  onStartSignIn,
  onCancelSignIn,
  onOpenDashboard,
  onClearError,
}: SignInScreenProps) {
  // Auto-clear the error when the user starts a new attempt
  useEffect(() => {
    if (pendingMethod && signInError) {
      onClearError();
    }
  }, [pendingMethod, signInError, onClearError]);

  // ─── Pending state ──────────────────────────────────────────────────────
  if (pendingMethod) {
    return (
      <div className="w-full max-w-md mx-auto px-6 py-8">
        <div className="flex flex-col items-center text-center">
          {/* Animated spinner */}
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-full border-2 border-purple-500/20" />
            <div
              className="absolute inset-0 w-16 h-16 rounded-full border-2 border-transparent border-t-purple-500 animate-spin"
              style={{ animationDuration: '1s' }}
            />
          </div>

          <h2 className="text-lg font-semibold mb-2">
            {t('signin.waiting_title') || 'Waiting for browser...'}
          </h2>
          <p className="text-sm opacity-60 max-w-sm mb-1">
            {pendingMethod === 'github'
              ? (t('signin.waiting_github') || 'Complete sign-in with GitHub in your browser, then return here.')
              : (t('signin.waiting_email') || 'Complete sign-in with email in your browser, then return here.')}
          </p>
          <p className="text-xs opacity-40 mb-6">
            {t('signin.waiting_timeout') || 'This will time out after 5 minutes.'}
          </p>

          <button
            onClick={onCancelSignIn}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--vscode-panel-border)] bg-transparent hover:bg-[rgba(168,85,247,0.05)] transition-colors"
          >
            {t('signin.cancel') || 'Cancel'}
          </button>
        </div>
      </div>
    );
  }

  // ─── Idle state ────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-md mx-auto px-6 py-6">
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold mb-2">
          {t('signin.welcome_title') || 'Sign in to Ava | Supernova'}
        </h2>
        <p className="text-sm opacity-60">
          {t('signin.welcome_subtitle') || 'Connect your account to sync memory, tasks, and settings across every device.'}
        </p>
      </div>

      {signInError && (
        <div
          className="mb-4 p-3 rounded-lg text-sm"
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: 'rgba(248, 113, 113, 1)',
          }}
        >
          <p className="font-medium mb-0.5">{t('signin.error_title') || 'Sign-in failed'}</p>
          <p className="text-xs opacity-80">{signInError}</p>
        </div>
      )}

      {/* Primary: GitHub */}
      <button
        onClick={() => onStartSignIn('github')}
        className="w-full mb-3 flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-medium text-sm text-white transition-all"
        style={{
          background: 'rgba(36, 41, 46, 1)',
          border: '1px solid rgba(110, 118, 129, 0.4)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(50, 56, 64, 1)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(36, 41, 46, 1)';
        }}
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
        {t('signin.continue_github') || 'Continue with GitHub'}
      </button>

      {/* Secondary: Email */}
      <button
        onClick={() => onStartSignIn('email')}
        className="w-full mb-6 flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-medium text-sm transition-all"
        style={{
          background: 'transparent',
          border: '1px solid rgba(168, 85, 247, 0.35)',
          color: 'var(--vscode-foreground)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(168, 85, 247, 0.08)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
        {t('signin.continue_email') || 'Sign in with email'}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-5 text-xs opacity-40">
        <div className="flex-1 h-px bg-current opacity-30" />
        <span>{t('signin.or') || 'OR'}</span>
        <div className="flex-1 h-px bg-current opacity-30" />
      </div>

      {/* Tertiary: Continue without an account (BYOK / local-first) */}
      <button
        onClick={onOpenDashboard}
        className="w-full mb-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors"
        style={{
          background: 'transparent',
          color: 'var(--vscode-foreground)',
          opacity: 0.7,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = '0.7';
        }}
      >
        {t('signin.continue_local') || 'Continue without an account'}
      </button>

      {/* Manual API-key paste has been removed. The sunset window from the
          v0.37.0 ship date ended; GitHub or email sign-in is the only
          account path now. Existing users still using a manually-pasted
          key continue to work until they next sign in. */}

      <div className="mt-6 text-center">
        <p className="text-[10px] opacity-30 leading-relaxed max-w-xs mx-auto">
          {t('signin.local_first_note') || 'Local-first always. Your data stays on your machine unless you explicitly sync it.'}
        </p>
      </div>
    </div>
  );
}
