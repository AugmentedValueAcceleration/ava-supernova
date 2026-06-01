/**
 * SignInManager — orchestrates the OAuth device authorization flow for
 * the Ava Supernova VS Code extension.
 *
 * Flow (two paths to completion — whichever lands first wins):
 *   1. User clicks "Continue with GitHub" / "Sign in with email"
 *   2. startSignIn() generates a state param, persists the pending attempt to
 *      globalState (survives reloads + is visible to every window), opens the
 *      browser to /auth/extension, and starts BOTH:
 *        a. a 5-minute timeout, and
 *        b. a polling loop against /api/auth/extension/poll
 *   3. The user authorizes in the browser, which:
 *        - redirects to vscode://…/auth?code=…&state=… (the fast PUSH path), and
 *        - creates a device_auth_codes row the poll can PULL
 *   4a. PUSH: VS Code routes the URI to handleCallback(), which exchanges the
 *       code for a platform key.
 *   4b. PULL: the poll loop sees the authorized code and gets the key back —
 *       this is the reliable fallback for when the deep link never routes back
 *       (OS quirks, Remote/WSL/Codespaces, multi-window, host reloaded).
 *   5. Whichever path resolves first stores the key in context.secrets and
 *      notifies the UI; the `resolved` guard makes completion idempotent so
 *      the other path is a no-op.
 *
 * The deep-link exchange is best-effort: if it fails, we DON'T surface an error
 * or stop polling — the poll loop is the backstop, and only a real timeout (or
 * cancel) reports failure. This is what makes the flow robust instead of
 * temperamental.
 *
 * device_id is persisted in globalState (stable per install). The pending
 * attempt is persisted too, so a reload mid-auth resumes via resumePendingSignIn().
 */

import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

const DEVICE_ID_STATE_KEY = 'avaSupernova.deviceId';
const PENDING_SIGN_IN_KEY = 'avaSupernova.pendingSignIn';
const PLATFORM_KEY_SECRET = 'ava-supernova.platformKey';
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 2500;
const DEFAULT_WEB_ORIGIN = 'https://ava-supernova.com';

export type SignInMethod = 'github' | 'email';

export interface SignInAccount {
  id: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  tier?: string;
}

export type SignInEventHandler =
  | { type: 'sign_in_started' }
  | { type: 'sign_in_complete'; account: SignInAccount }
  | { type: 'sign_in_failed'; error: string }
  | { type: 'sign_in_cancelled' };

interface PendingSignIn {
  state: string;
  method: SignInMethod;
  startedAt: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

/** Shape persisted to globalState — no live handles, just enough to resume. */
interface PersistedPending {
  state: string;
  method: SignInMethod;
  startedAt: number;
}

export class SignInManager {
  private readonly context: vscode.ExtensionContext;
  private pending: PendingSignIn | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /** Set the instant a key is obtained + stored; makes completion idempotent
   *  across the deep-link and polling paths. Reset on each startSignIn. */
  private resolved = false;
  private listeners = new Set<(event: SignInEventHandler) => void>();
  private readonly webOrigin: string;

  constructor(context: vscode.ExtensionContext, webOrigin?: string) {
    this.context = context;
    // Allow override for local dev — defaults to production
    this.webOrigin = webOrigin ?? DEFAULT_WEB_ORIGIN;
  }

  /**
   * Subscribe to sign-in lifecycle events. Returns a disposable that
   * removes the listener when called.
   */
  onEvent(handler: (event: SignInEventHandler) => void): vscode.Disposable {
    this.listeners.add(handler);
    return { dispose: () => this.listeners.delete(handler) };
  }

  private emit(event: SignInEventHandler): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* listener errors must not break other listeners */
      }
    }
  }

  /**
   * Get (or generate on first call) the stable per-install device identifier.
   * Stored in context.globalState so it persists across VS Code restarts but
   * is unique per extension installation.
   */
  private getDeviceId(): string {
    let deviceId = this.context.globalState.get<string>(DEVICE_ID_STATE_KEY);
    if (!deviceId) {
      // 48 hex chars = 192 bits of entropy. Stable for the lifetime of the
      // install; regenerated only on uninstall/reinstall.
      deviceId = randomBytes(24).toString('hex');
      this.context.globalState.update(DEVICE_ID_STATE_KEY, deviceId);
    }
    return deviceId;
  }

  /**
   * True if a sign-in attempt is currently in flight.
   */
  isPending(): boolean {
    return this.pending !== null;
  }

  /**
   * Start a sign-in attempt. Generates state, persists the pending attempt,
   * opens the browser to /auth/extension, and starts the timeout + poll loop.
   * If another sign-in is already pending, cancels it cleanly first.
   */
  async startSignIn(method: SignInMethod): Promise<void> {
    if (this.pending) {
      this.cancelPending('A newer sign-in attempt was started.');
    }

    const state = randomBytes(16).toString('hex');
    const deviceId = this.getDeviceId();
    const startedAt = Date.now();
    this.resolved = false;

    this.pending = {
      state,
      method,
      startedAt,
      timeoutHandle: setTimeout(() => this.handleTimeout(), SIGN_IN_TIMEOUT_MS),
    };
    // Persist so a host reload (or another window) can resume + complete.
    void this.context.globalState.update(PENDING_SIGN_IN_KEY, {
      state, method, startedAt,
    } as PersistedPending);

    const url = new URL('/auth/extension', this.webOrigin);
    url.searchParams.set('state', state);
    url.searchParams.set('device_id', deviceId);
    url.searchParams.set('platform', 'extension');
    url.searchParams.set('hint', method);

    this.emit({ type: 'sign_in_started' });
    this.startPolling();

    console.log('[Ava] Opening sign-in URL:', url.toString());
    try {
      await vscode.env.openExternal(vscode.Uri.parse(url.toString()));
      console.log('[Ava] Browser open call resolved');
    } catch (err) {
      // Browser failed to open — clean up and report. (Polling can't help if
      // the user never got to the authorize page.)
      const message = err instanceof Error ? err.message : String(err);
      this.cancelPending();
      console.log('[Ava] openExternal failed:', message);
      this.emit({ type: 'sign_in_failed', error: `Could not open browser: ${message}` });
      throw err;
    }
  }

  /**
   * Resume a sign-in that was in flight when the host last reloaded. Reads the
   * persisted pending attempt; if it's still within the 5-minute window, it
   * restores the timeout and restarts polling so an authorization that happened
   * (or happens) during/after the reload still completes. Safe to call on every
   * activation — a no-op when there's nothing pending or it has expired.
   */
  resumePendingSignIn(): void {
    if (this.pending) return; // already have a live attempt
    const persisted = this.context.globalState.get<PersistedPending>(PENDING_SIGN_IN_KEY);
    if (!persisted) return;

    const elapsed = Date.now() - persisted.startedAt;
    if (elapsed >= SIGN_IN_TIMEOUT_MS) {
      void this.context.globalState.update(PENDING_SIGN_IN_KEY, undefined);
      return;
    }

    this.resolved = false;
    this.pending = {
      state: persisted.state,
      method: persisted.method,
      startedAt: persisted.startedAt,
      timeoutHandle: setTimeout(() => this.handleTimeout(), SIGN_IN_TIMEOUT_MS - elapsed),
    };
    console.log('[Ava] Resuming pending sign-in after reload');
    this.emit({ type: 'sign_in_started' });
    this.startPolling();
  }

  /**
   * Handle the vscode://.../auth callback from the website (the fast push path).
   * Validates state, exchanges code for a platform key, completes. Returns true
   * if the callback was consumed, false if it was for a different/stale attempt.
   *
   * Best-effort: if the exchange fails we DON'T report an error or stop polling
   * — the poll loop remains the backstop.
   */
  async handleCallback(uri: vscode.Uri): Promise<boolean> {
    const query = new URLSearchParams(uri.query);
    const code = query.get('code');
    const state = query.get('state');
    const error = query.get('error');
    console.log('[Ava] handleCallback: code=', !!code, 'state=', !!state, 'error=', error || 'none', 'pending=', !!this.pending);

    if (error) {
      this.cancelPending();
      this.emit({ type: 'sign_in_failed', error });
      return true;
    }

    if (!code || !state) {
      console.log('[Ava] Callback missing code or state — ignoring');
      return false;
    }

    if (this.resolved) return true; // already signed in via the other path

    // Validate against the (possibly resumed) pending attempt.
    if (!this.pending || this.pending.state !== state) {
      console.log('[Ava] State mismatch or no pending sign-in — ignoring callback');
      return false;
    }

    const deviceId = this.getDeviceId();
    try {
      const exchangeUrl = new URL('/api/auth/extension/exchange', this.webOrigin);
      console.log('[Ava] Exchanging code at', exchangeUrl.toString());
      const response = await fetch(exchangeUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, device_id: deviceId, state }),
      });
      console.log('[Ava] Exchange response status:', response.status);

      if (!response.ok) {
        // Don't fail the whole attempt — the poll loop may still complete it.
        let message = `Exchange failed: HTTP ${response.status}`;
        try {
          const body = (await response.json()) as { error?: string } | null;
          if (body?.error) message = body.error;
        } catch { /* not JSON */ }
        console.log('[Ava] Exchange failed (poll remains the fallback):', message);
        return true;
      }

      const data = (await response.json()) as { key?: string; account?: SignInAccount | null } | null;
      const key = typeof data?.key === 'string' ? data.key : null;
      const account = (data?.account ?? null) as SignInAccount | null;
      if (!key) {
        console.log('[Ava] Exchange response missing key (poll remains the fallback)');
        return true;
      }

      await this.finish(key, account);
      return true;
    } catch (err) {
      // Network error on the deep-link exchange — log, let polling carry on.
      const message = err instanceof Error ? err.message : String(err);
      console.log('[Ava] Exchange request error (poll remains the fallback):', message);
      return true;
    }
  }

  /** Start the polling loop (no-op if already running). */
  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => { void this.pollOnce(); }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** One poll tick against /api/auth/extension/poll. */
  private async pollOnce(): Promise<void> {
    if (this.resolved || !this.pending) { this.stopPolling(); return; }
    const deviceId = this.getDeviceId();
    try {
      const pollUrl = new URL('/api/auth/extension/poll', this.webOrigin);
      const response = await fetch(pollUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId }),
      });
      if (!response.ok) return; // transient (rate limit / blip) — keep polling
      const data = (await response.json()) as
        { status?: string; key?: string; account?: SignInAccount | null } | null;
      if (data?.status !== 'complete') return; // still pending
      const key = typeof data.key === 'string' ? data.key : null;
      if (!key) return;
      await this.finish(key, (data.account ?? null) as SignInAccount | null);
    } catch {
      // Network blip — keep polling until success or timeout.
    }
  }

  /** Idempotent completion — first path to obtain a key wins; the rest no-op. */
  private async finish(key: string, account: SignInAccount | null): Promise<void> {
    if (this.resolved) return;
    this.resolved = true;
    if (this.pending) {
      clearTimeout(this.pending.timeoutHandle);
      this.pending = null;
    }
    this.stopPolling();
    void this.context.globalState.update(PENDING_SIGN_IN_KEY, undefined);

    await this.context.secrets.store(PLATFORM_KEY_SECRET, key);
    this.emit({ type: 'sign_in_complete', account: account ?? { id: 'unknown' } });
  }

  /**
   * Cancel any pending sign-in attempt. Called when the user clicks Cancel,
   * or when a newer sign-in starts.
   */
  cancelSignIn(): void {
    if (!this.pending) return;
    this.cancelPending();
    this.emit({ type: 'sign_in_cancelled' });
  }

  private cancelPending(reason?: string): void {
    this.stopPolling();
    void this.context.globalState.update(PENDING_SIGN_IN_KEY, undefined);
    if (!this.pending) return;
    clearTimeout(this.pending.timeoutHandle);
    this.pending = null;
    if (reason) {
      this.emit({ type: 'sign_in_failed', error: reason });
    }
  }

  private handleTimeout(): void {
    if (this.resolved || !this.pending) return;
    this.pending = null;
    this.stopPolling();
    void this.context.globalState.update(PENDING_SIGN_IN_KEY, undefined);
    this.emit({
      type: 'sign_in_failed',
      error: 'Sign-in timed out after 5 minutes. Please try again.',
    });
  }
}
