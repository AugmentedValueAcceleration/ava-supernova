/**
 * SignInManager — orchestrates the OAuth device authorization flow for
 * the Ava Supernova VS Code extension.
 *
 * Flow:
 *   1. User clicks "Continue with GitHub" or "Sign in with email" in the
 *      extension's sign-in UI
 *   2. startSignIn() generates a random state parameter, retrieves the
 *      per-install device_id, opens the browser to /auth/extension, and
 *      tracks the pending attempt with a 5-minute timeout
 *   3. User signs in on the website, authorizes the device, and the
 *      website redirects to vscode://augmentedvalueacceleration.ava-supernova/auth
 *   4. VS Code routes the URI to the extension's UriHandler, which
 *      delegates to handleCallback()
 *   5. handleCallback() validates state, POSTs { code, device_id, state }
 *      to /api/auth/extension/exchange, stores the returned platform key
 *      in context.secrets, and notifies the UI
 *
 * Only one sign-in can be pending at a time. A second startSignIn() call
 * while one is in flight cancels the previous one cleanly. The 5-minute
 * timeout is generous — it accommodates users who have to verify their
 * email before landing on the authorize screen.
 *
 * State stored on this class is per-extension-session. device_id is
 * persisted in context.globalState so it's stable across restarts.
 */

import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

const DEVICE_ID_STATE_KEY = 'avaSupernova.deviceId';
const PLATFORM_KEY_SECRET = 'ava-supernova.platformKey';
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
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

export class SignInManager {
  private readonly context: vscode.ExtensionContext;
  private pending: PendingSignIn | null = null;
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
   * Start a sign-in attempt. Generates state, opens the browser to the
   * /auth/extension page, sets up the timeout. If another sign-in is
   * already pending, cancels it cleanly first.
   */
  async startSignIn(method: SignInMethod): Promise<void> {
    // Cancel any previous pending attempt first
    if (this.pending) {
      this.cancelPending('A newer sign-in attempt was started.');
    }

    const state = randomBytes(16).toString('hex');
    const deviceId = this.getDeviceId();

    const pending: PendingSignIn = {
      state,
      method,
      startedAt: Date.now(),
      timeoutHandle: setTimeout(() => {
        this.handleTimeout();
      }, SIGN_IN_TIMEOUT_MS),
    };
    this.pending = pending;

    // Build the /auth/extension URL
    const url = new URL('/auth/extension', this.webOrigin);
    url.searchParams.set('state', state);
    url.searchParams.set('device_id', deviceId);
    url.searchParams.set('platform', 'extension');
    url.searchParams.set('hint', method);

    this.emit({ type: 'sign_in_started' });

    console.log('[Ava] Opening sign-in URL:', url.toString());
    try {
      await vscode.env.openExternal(vscode.Uri.parse(url.toString()));
      console.log('[Ava] Browser open call resolved');
    } catch (err) {
      // Browser failed to open — clean up and report
      this.cancelPending();
      const message = err instanceof Error ? err.message : String(err);
      console.log('[Ava] openExternal failed:', message);
      this.emit({ type: 'sign_in_failed', error: `Could not open browser: ${message}` });
      throw err;
    }
  }

  /**
   * Handle the vscode://.../auth callback from the website. Called by the
   * extension's UriHandler registered in extension.ts. Validates state,
   * exchanges code for platform key, stores the key, emits completion.
   *
   * Returns true if the callback was consumed (valid state), false if it
   * was for a different or stale sign-in attempt (the caller should
   * ignore the URI).
   */
  async handleCallback(uri: vscode.Uri): Promise<boolean> {
    const query = new URLSearchParams(uri.query);
    const code = query.get('code');
    const state = query.get('state');
    const error = query.get('error');
    console.log('[Ava] handleCallback: code=', !!code, 'state=', !!state, 'error=', error || 'none', 'pending=', !!this.pending);

    // Explicit error from the authorize flow (rare but possible)
    if (error) {
      this.cancelPending();
      this.emit({ type: 'sign_in_failed', error });
      return true;
    }

    if (!code || !state) {
      console.log('[Ava] Callback missing code or state — ignoring');
      // Malformed callback — not ours or not a real sign-in callback
      return false;
    }

    // Validate state matches the pending attempt
    if (!this.pending || this.pending.state !== state) {
      console.log('[Ava] State mismatch or no pending sign-in — ignoring callback');
      // Not matching — either no pending, or state mismatch (CSRF or stale)
      return false;
    }

    // Clear the pending state — we've matched it, even if the exchange
    // itself fails below we shouldn't re-process this callback.
    const pending = this.pending;
    clearTimeout(pending.timeoutHandle);
    this.pending = null;

    const deviceId = this.getDeviceId();

    // Exchange the code for a real platform key
    try {
      const exchangeUrl = new URL('/api/auth/extension/exchange', this.webOrigin);
      console.log('[Ava] Exchanging code at', exchangeUrl.toString());
      const response = await fetch(exchangeUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          device_id: deviceId,
          state: pending.state,
        }),
      });
      console.log('[Ava] Exchange response status:', response.status);

      if (!response.ok) {
        let message = `Exchange failed: HTTP ${response.status}`;
        try {
          const body = (await response.json()) as { error?: string } | null;
          if (body?.error) message = body.error;
        } catch { /* response wasn't JSON */ }
        console.log('[Ava] Exchange failed:', message);
        this.emit({ type: 'sign_in_failed', error: message });
        return true;
      }

      const data = (await response.json()) as { key?: string; account?: SignInAccount | null } | null;
      const key = typeof data?.key === 'string' ? data.key : null;
      const account = (data?.account ?? null) as SignInAccount | null;

      if (!key) {
        this.emit({ type: 'sign_in_failed', error: 'Exchange response missing platform key.' });
        return true;
      }

      // Store the key in VS Code secrets — replaces any existing key
      await this.context.secrets.store(PLATFORM_KEY_SECRET, key);

      this.emit({
        type: 'sign_in_complete',
        account: account ?? { id: 'unknown' },
      });

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit({ type: 'sign_in_failed', error: `Exchange request failed: ${message}` });
      return true;
    }
  }

  /**
   * Cancel any pending sign-in attempt. Called when the user clicks
   * Cancel in the pending UI, or when a newer sign-in starts.
   */
  cancelSignIn(): void {
    if (!this.pending) return;
    this.cancelPending();
    this.emit({ type: 'sign_in_cancelled' });
  }

  private cancelPending(reason?: string): void {
    if (!this.pending) return;
    clearTimeout(this.pending.timeoutHandle);
    this.pending = null;
    if (reason) {
      this.emit({ type: 'sign_in_failed', error: reason });
    }
  }

  private handleTimeout(): void {
    if (!this.pending) return;
    this.pending = null;
    this.emit({
      type: 'sign_in_failed',
      error: 'Sign-in timed out after 5 minutes. Please try again.',
    });
  }
}
