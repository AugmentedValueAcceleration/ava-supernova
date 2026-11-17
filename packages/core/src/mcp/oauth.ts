/**
 * Signing in to online MCP servers (plan 2026-11-17-mcp-servers, Phase 3).
 *
 * The SDK does the OAuth itself (discovery, registering Ava as an app, PKCE,
 * refreshing, never handing a token to a different sign-in server). We supply:
 *
 *  - where it's kept: the shared keychain (secrets.ts `auth`), so a sign-in in
 *    the extension works in the IDE too, and nothing lands in ~/.ava/mcp.json;
 *  - the browser: each app's own opener (VS Code's openExternal, Tauri's
 *    opener), never a shell; only https (or http to this computer) is opened;
 *  - the way back: a one-off listener on 127.0.0.1 that catches the redirect,
 *    checks the state, and closes;
 *  - a fence: while signing in, nothing is fetched from deeper inside his
 *    network than the server itself is (a server on the internet can't point
 *    the sign-in at 192.168.x.x or the cloud metadata address 169.254.169.254).
 *
 * A token is only ever sent to the address it was given for: change a
 * server's address and it needs signing in again.
 */

import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { UnauthorizedError, type OAuthClientProvider, type OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { isLocalUrl } from './connection.js';
import { getMcpAuth, setMcpAuth } from './secrets.js';

// ── The browser ─────────────────────────────────────────────────────────────

/** Opens a web page in his browser, without a shell. */
export type McpBrowserOpener = (url: string) => Promise<void>;

let opener: McpBrowserOpener | null = null;

/** Each app calls this once at start: VS Code's openExternal, Tauri's opener. */
export function setMcpBrowserOpener(fn: McpBrowserOpener | null): void {
  opener = fn;
}

export const hasMcpBrowserOpener = (): boolean => opener !== null;

/** A sign-in page we're willing to open: https, or http on this computer. Nothing else (no javascript:, file:, data:…). */
export function checkSignInUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return 'The sign-in address isn\'t a web address.'; }
  if (u.username || u.password) return 'The sign-in address carries a name or password, so it wasn\'t opened.';
  if (u.protocol === 'https:') return null;
  if (u.protocol === 'http:' && isLocalUrl(raw)) return null;
  return `The sign-in address uses ${u.protocol}, so it wasn't opened (only https).`;
}

// ── Where it's kept ─────────────────────────────────────────────────────────

/** What one server's sign-in keeps in the keychain. */
export interface McpAuthRecord {
  /** The exact address the tokens are for. */
  url: string;
  /** Ava as registered with that server's sign-in, and for which way back. */
  client?: OAuthClientInformationMixed;
  clientRedirect?: string;
  tokens?: OAuthTokens;
  /** When he signed in (ms). */
  at?: number;
}

/** The keychain name of a server's sign-in. A project's servers are kept per project. */
export function mcpAuthKey(scope: 'user' | 'project', id: string, projectRoot: string | null): string {
  return scope === 'user' ? `user:${id}` : `project:${projectRoot ?? ''}|${id}`;
}

/** Signed in to this address? (Never says what the tokens are.) */
export async function isSignedIn(key: string, url: string): Promise<boolean> {
  const r = await getMcpAuth<McpAuthRecord>(key).catch(() => undefined);
  return !!r?.tokens && r.url === url;
}

export async function forgetSignIn(key: string): Promise<void> {
  await setMcpAuth(key, null);
}

/** Discovery results, kept in memory only: they're big, and cheap to fetch again. */
const discovery = new Map<string, OAuthDiscoveryState>();

/** A sign-in in progress: the way back, and what to do with the sign-in page. */
export interface McpSignInFlow {
  redirect: string;
  state: string;
  open(url: URL): Promise<void>;
}

/**
 * The SDK's OAuthClientProvider for one server. Without `flow` it only uses
 * a sign-in he already made (refreshing it as needed); with `flow` it may send
 * him to the sign-in page.
 */
export class AvaOAuthProvider implements OAuthClientProvider {
  private verifier = '';

  private constructor(
    private readonly key: string,
    private readonly serverUrl: string,
    private rec: McpAuthRecord,
    private readonly flow?: McpSignInFlow,
  ) {}

  static async create(key: string, serverUrl: string, flow?: McpSignInFlow): Promise<AvaOAuthProvider> {
    const stored = await getMcpAuth<McpAuthRecord>(key);
    // Kept for a different address: nothing of it is used here.
    const rec: McpAuthRecord = stored && stored.url === serverUrl ? { ...stored } : { url: serverUrl };
    return new AvaOAuthProvider(key, serverUrl, rec, flow);
  }

  get hasTokens(): boolean {
    return !!this.rec.tokens;
  }

  get redirectUrl(): string {
    // Without a flow it can't send him anywhere, but the SDK needs a way back
    // to know this is a browser sign-in (not a machine-to-machine one).
    return this.flow?.redirect ?? this.rec.clientRedirect ?? 'http://127.0.0.1/callback';
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Ava Supernova',
      client_uri: 'https://avasupernova.com',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  state(): string {
    return this.flow?.state ?? '';
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    // Registered for a different way back (another port): register again.
    if (this.flow && this.rec.clientRedirect !== this.flow.redirect) return undefined;
    return this.rec.client;
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    this.rec.client = info;
    this.rec.clientRedirect = this.redirectUrl;
    await this.persist();
  }

  tokens(): OAuthTokens | undefined {
    return this.rec.tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.rec.tokens = tokens;
    this.rec.url = this.serverUrl;
    this.rec.at ??= Date.now();
    await this.persist();
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    if (!this.flow) throw new UnauthorizedError('It needs signing in again.');
    await this.flow.open(url);
  }

  saveCodeVerifier(v: string): void {
    this.verifier = v;
  }

  codeVerifier(): string {
    return this.verifier;
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    if (scope === 'verifier') { this.verifier = ''; return; }
    if (scope === 'discovery') { discovery.delete(this.discoveryKey); return; }
    if (scope === 'tokens') {
      // The other app may have just refreshed (and the server swapped the
      // refresh token): take its newer one rather than signing him out.
      const now = await getMcpAuth<McpAuthRecord>(this.key).catch(() => undefined);
      if (now?.tokens && now.url === this.serverUrl && JSON.stringify(now.tokens) !== JSON.stringify(this.rec.tokens)) {
        this.rec.tokens = now.tokens;
        return;
      }
      delete this.rec.tokens;
    } else if (scope === 'client') {
      delete this.rec.client;
      delete this.rec.clientRedirect;
    } else {
      this.rec = { url: this.serverUrl };
      discovery.delete(this.discoveryKey);
    }
    await this.persist();
  }

  saveDiscoveryState(state: OAuthDiscoveryState): void {
    discovery.set(this.discoveryKey, state);
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return discovery.get(this.discoveryKey);
  }

  private get discoveryKey(): string {
    return `${this.key}\n${this.serverUrl}`;
  }

  private async persist(): Promise<void> {
    const empty = !this.rec.tokens && !this.rec.client;
    await setMcpAuth(this.key, empty ? null : this.rec);
  }
}

// ── The way back ────────────────────────────────────────────────────────────

/** The port Ava listens on for the way back; another one if it's taken. */
let preferredPort = 33421;

/** Tests: listen on any free port. */
export function setMcpSignInPort(port: number): void {
  preferredPort = port;
}

export interface McpSignInWords {
  /** Shown in the browser tab when it worked / didn't. */
  done?: string;
  failed?: string;
}

export interface McpCallbackListener {
  redirect: string;
  state: string;
  /** Resolves with the code once the browser comes back (or rejects: refused, timed out, cancelled). */
  code: Promise<string>;
  close(reason?: string): void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(ok: boolean, text: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ava Supernova</title>`
    + `<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f0a1a;color:#cdd6f4;font:16px 'Segoe UI',system-ui,sans-serif}`
    + `div{max-width:440px;padding:28px 32px;border:1px solid rgba(168,85,247,.28);border-radius:14px;background:rgba(26,16,40,.6);text-align:center}`
    + `b{display:block;font-size:30px;margin-bottom:10px;color:${ok ? '#34d399' : '#fbbf24'}}</style></head>`
    + `<body><div><b>${ok ? '&#10003;' : '!'}</b>${esc(text)}</div></body></html>`;
}

/** Listen on 127.0.0.1 for the browser's way back. Five minutes, then it gives up. */
export async function listenForSignIn(words: McpSignInWords = {}, timeoutMs = 5 * 60_000): Promise<McpCallbackListener> {
  const state = randomBytes(24).toString('base64url');
  let settle!: { resolve: (c: string) => void; reject: (e: Error) => void };
  const code = new Promise<string>((resolve, reject) => { settle = { resolve, reject }; });
  code.catch(() => {}); // whoever awaits it hears; nobody listening is fine too
  let done = false;
  let server: Server;
  const finish = (err: Error | null, value?: string) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    server.close();
    server.closeAllConnections?.();
    if (err) settle.reject(err); else settle.resolve(value!);
  };
  server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
    const send = (ok: boolean, text: string) => {
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(page(ok, text));
    };
    const failed = words.failed || "Sign-in didn't finish. You can close this tab and try again from Ava.";
    // Not ours (a stale tab, or someone else's page): refused, and the sign-in keeps waiting.
    if (u.searchParams.get('state') !== state) { send(false, failed); return; }
    const error = u.searchParams.get('error');
    const got = u.searchParams.get('code');
    if (error || !got) {
      send(false, failed);
      const why = u.searchParams.get('error_description');
      finish(new Error(`The server said no: ${error ?? 'no code came back'}${why ? ` (${why.slice(0, 200)})` : ''}.`));
      return;
    }
    send(true, words.done || 'Signed in. You can close this tab and go back to Ava.');
    finish(null, got);
  });
  const listen = (port: number) => new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve((server.address() as { port: number }).port);
    });
  });
  let port: number;
  try { port = await listen(preferredPort); } catch { port = await listen(0); }
  const timer = setTimeout(() => finish(new Error('Nobody finished signing in within five minutes.')), timeoutMs);
  timer.unref?.();
  return {
    redirect: `http://127.0.0.1:${port}/callback`,
    state,
    code,
    close: (reason = 'Sign-in was cancelled.') => finish(new Error(reason)),
  };
}

/** Open the sign-in page with the app's opener, after checking the address. */
export async function openSignInPage(url: URL): Promise<void> {
  const bad = checkSignInUrl(url.href);
  if (bad) throw new Error(bad);
  if (!opener) throw new Error('This app can\'t open a browser for signing in.');
  await opener(url.href);
}

// ── The fence ───────────────────────────────────────────────────────────────

type Zone = 'public' | 'private' | 'loopback' | 'link-local';
const DEPTH: Record<Zone, number> = { public: 0, private: 1, loopback: 2, 'link-local': 3 };

/** How far inside a network an IP address is. */
export function addressZone(ip: string): Zone {
  let a = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) a = mapped[1];
  if (isIP(a) === 4) {
    const [x, y] = a.split('.').map(Number);
    if (x === 127 || x === 0) return 'loopback';
    if (x === 169 && y === 254) return 'link-local';
    if (x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 100 && y >= 64 && y <= 127)) return 'private';
    return 'public';
  }
  if (a === '::1' || a === '::') return 'loopback';
  if (/^fe[89ab]/.test(a)) return 'link-local';
  if (/^f[cd]/.test(a)) return 'private';
  return 'public';
}

async function zoneOf(hostname: string): Promise<Zone> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (host.toLowerCase() === 'localhost') return 'loopback';
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  // The deepest of its addresses counts (a name with one public and one private address is private).
  return ips.reduce<Zone>((z, ip) => (DEPTH[addressZone(ip)] > DEPTH[z] ? addressZone(ip) : z), 'public');
}

/**
 * A fetch for one server's connection and sign-in. The server's own address
 * passes (he chose it). Anything else the sign-in asks for (its metadata,
 * the sign-in server, registering, tokens) must be https (http only when the
 * server itself is on this computer) and no deeper inside his network than
 * the server: an online server can't steer Ava to his router or to the cloud
 * metadata address. Link-local is never reached unless the server lives there.
 */
export function fencedFetch(serverUrl: string, base: FetchLike = fetch): FetchLike {
  const origin = new URL(serverUrl).origin;
  let serverZone: Promise<Zone> | null = null;
  return async (input, init) => {
    const u = new URL(input instanceof URL ? input.href : String(input));
    if (u.origin !== origin) {
      const local = isLocalUrl(serverUrl);
      if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local && isLocalUrl(u.href))) {
        throw new Error(`The sign-in asked Ava to fetch ${u.origin}, which isn't https, so it was refused.`);
      }
      serverZone ??= zoneOf(new URL(serverUrl).hostname).catch(() => 'public' as Zone);
      const [mine, theirs] = await Promise.all([serverZone, zoneOf(u.hostname)]);
      if (DEPTH[theirs] > DEPTH[mine]) {
        throw new Error(`The sign-in asked Ava to fetch ${u.host}, which is inside your network (${theirs}), so it was refused.`);
      }
    }
    return base(input, init);
  };
}
