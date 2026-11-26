/**
 * MCP — Ava as a client of other programs' tools (Model Context Protocol).
 *
 * Plan: Decisions/plans/2026-11-16-blender-mcp.md (private), Phase 1. One client
 * for both kinds of server, so Blender now and Unreal next share it:
 *
 *   - a LOCAL PROGRAM Ava starts and talks to over its input/output (stdio) —
 *     most Blender servers;
 *   - a LOCAL WEB ADDRESS on this computer (Streamable HTTP) — Blender Lab's
 *     official server and Unreal's.
 *
 * Blender's connection is local only (`local-url`): a web address that isn't
 * this computer is refused. Servers the person adds themselves may be online
 * (`url`, plan 2026-11-17-mcp-servers decision 1: their choice, never ours),
 * over https — plain http only to this computer. A server's tools are read
 * when it connects, never hard-coded, so an experimental server changing its
 * tools costs us nothing.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { FetchLike, Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { UNREAL_CALL_TIMEOUT_MS, UnrealCatalog, isUnrealServer, unrealEditorInfo, unrealVersionOk, type UnrealEditorInfo } from './unreal.js';
import { unrealEditorAt } from './unreal-local.js';

/**
 * Keep the server's answer to `initialize`. The SDK keeps only its name,
 * version and capabilities; Unreal puts the open project in the answer's
 * _meta. Wraps whatever onmessage the client installs, so nothing changes
 * for any other message.
 */
function tapInitialize(transport: Transport, seen: (result: unknown) => void): void {
  let handler: Transport['onmessage'];
  let done = false;
  Object.defineProperty(transport, 'onmessage', {
    configurable: true,
    get: () => handler,
    set: (fn: Transport['onmessage']) => {
      handler = fn && ((message, extra) => {
        if (!done) {
          const result = (message as { result?: { serverInfo?: unknown } }).result;
          if (result && typeof result === 'object' && 'serverInfo' in result) { done = true; seen(result); }
        }
        fn(message, extra);
      });
    },
  });
}

export type McpTransportConfig =
  /** A program Ava starts, talking over its input and output. */
  | { kind: 'program'; command: string; args?: string[]; env?: Record<string, string>; cwd?: string }
  /** A server already running on this computer, at a local web address. */
  | { kind: 'local-url'; url: string; headers?: Record<string, string> }
  /** A server the person added, on this computer or online (https). `sse` is
   *  the older MCP web transport some servers still use. */
  | { kind: 'url'; url: string; headers?: Record<string, string>; sse?: boolean; authProvider?: OAuthClientProvider; fetch?: FetchLike };

export interface McpServerConfig {
  /** Short id, also the start of each tool's name for Ava (e.g. "blender_live"). */
  id: string;
  /** What to call it to the person ("Blender"). */
  name: string;
  transport: McpTransportConfig;
}

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
  /** The server's own hints about the tool (MCP annotations). */
  readOnly?: boolean;
  destructive?: boolean;
}

export interface McpCallResult {
  isError: boolean;
  text: string;
  images: Array<{ data: string; mimeType: string }>;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const CLIENT_INFO = { name: 'ava-supernova', version: '1' };

/** True only for this computer: localhost, 127.x.x.x or ::1. */
export function isLocalUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '::1' || /^127(\.\d{1,3}){3}$/.test(host);
}

/** An online server's address: https, or plain http only to this computer. */
export function checkServerUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return `"${raw}" isn't a web address.`; }
  if (u.protocol === 'https:') return null;
  if (u.protocol === 'http:' && isLocalUrl(raw)) return null;
  if (u.protocol === 'http:') return `${u.host} uses plain http, which would send your keys unprotected. Only https is used for a server that isn't on this computer.`;
  return `${u.protocol} addresses can't be MCP servers.`;
}

function makeTransport(cfg: McpTransportConfig, stderrLines: string[]): Transport {
  if (cfg.kind === 'url') {
    const bad = checkServerUrl(cfg.url);
    if (bad) throw new Error(bad);
    const requestInit = cfg.headers ? { headers: cfg.headers } : undefined;
    const opts = { requestInit, authProvider: cfg.authProvider, fetch: cfg.fetch };
    return cfg.sse ? new SSEClientTransport(new URL(cfg.url), opts) : new StreamableHTTPClientTransport(new URL(cfg.url), opts);
  }
  if (cfg.kind === 'local-url') {
    if (!isLocalUrl(cfg.url)) throw new Error(`Only a server on this computer can be connected (got ${cfg.url}).`);
    return new StreamableHTTPClientTransport(new URL(cfg.url), cfg.headers ? { requestInit: { headers: cfg.headers } } : undefined);
  }
  const transport = new StdioClientTransport({
    command: cfg.command,
    args: cfg.args ?? [],
    env: { ...getDefaultEnvironment(), ...(cfg.env ?? {}) },
    cwd: cfg.cwd,
    stderr: 'pipe',
  });
  // Keep the server's last words: when it fails to start, they say why.
  transport.stderr?.on('data', (chunk: Buffer | string) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) stderrLines.push(line.trim());
    }
    if (stderrLines.length > 40) stderrLines.splice(0, stderrLines.length - 40);
  });
  return transport;
}

/** True when a server refused us for want of a sign-in or a valid key. */
export function isUnauthorized(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string; unauthorized?: boolean };
  return e.unauthorized === true || e.name === 'UnauthorizedError' || e.code === 401 || /\b401\b|unauthori[sz]ed/i.test(e.message ?? '');
}

/**
 * Sign in to an online server (oauth.ts). Connecting without a valid sign-in
 * makes the SDK find the server's sign-in, register Ava and hand the page to
 * `authProvider` (which opens his browser); `code` then waits for the browser
 * to come back, and the SDK swaps that code for tokens, which the provider
 * keeps. Resolves true when it signed in, false when it already was.
 */
export async function signInToServer(
  cfg: Extract<McpTransportConfig, { kind: 'url' }>,
  code: () => Promise<string>,
  timeoutMs = 60_000,
): Promise<boolean> {
  if (!cfg.authProvider) throw new Error('Signing in needs a sign-in provider.');
  const transport = makeTransport(cfg, []) as StreamableHTTPClientTransport | SSEClientTransport;
  const client = new Client(CLIENT_INFO, { capabilities: {} });
  let refused: unknown;
  try {
    await client.connect(transport, { timeout: timeoutMs });
  } catch (err) {
    if (!isUnauthorized(err)) throw err;
    refused = err;
  } finally {
    await client.close().catch(() => {});
  }
  if (!refused) return false;
  await transport.finishAuth(await code());
  return true;
}

export class McpConnection {
  private toolList: McpToolInfo[] = [];
  private closed = false;
  /** Calls in flight: a heartbeat never runs while one is (a long compile isn't "gone"). */
  private inFlight = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private readonly closeListeners: Array<() => void> = [];
  private readonly changeListeners: Array<() => void> = [];
  /**
   * Unreal Engine's server (unreal.ts): its tools' read / write / execute
   * labels, read at connect and again when its tools change. Undefined for
   * every other server.
   */
  unreal?: UnrealCatalog;
  /** Unreal: the project the editor has open (from its initialize answer). */
  unrealEditor?: UnrealEditorInfo;
  /** Calls wait for the one before (Unreal runs one at a time on its game thread). */
  private serial = false;
  private queue: Promise<unknown> = Promise.resolve();
  private callTimeoutMs = DEFAULT_TIMEOUT_MS;

  private constructor(
    readonly config: McpServerConfig,
    private readonly client: Client,
    private readonly stderrLines: string[],
  ) {}

  /**
   * Connect and read the server's tools. Fails with the server's own words
   * when it can't start. `transport` is for tests (an in-memory pair).
   */
  static async open(config: McpServerConfig, opts: { timeoutMs?: number; transport?: Transport } = {}): Promise<McpConnection> {
    const stderrLines: string[] = [];
    const transport = opts.transport ?? makeTransport(config.transport, stderrLines);
    const client = new Client(CLIENT_INFO, { capabilities: {} });
    const conn = new McpConnection(config, client, stderrLines);
    let initResult: unknown;
    tapInitialize(transport, (r) => { initResult = r; });
    client.onclose = () => conn.markClosed();
    // A server whose tools change while connected (Unreal, when a plugin or
    // toolset is switched on) says so; read them again rather than offer
    // Ava a list that's gone stale.
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      await conn.refreshTools().catch(() => {});
      if (conn.unreal) conn.unreal = await UnrealCatalog.load(conn, conn.unreal.oneAtATime);
      conn.emitChange();
    });
    try {
      await client.connect(transport, { timeout: opts.timeoutMs ?? 30_000 });
      const info = client.getServerVersion();
      await conn.refreshTools();
      // Known by name (5.9) or, when it reports none (5.8), by its meta-tools.
      const names = conn.toolList.map((t) => t.name);
      if (isUnrealServer(info, names)) {
        // 5.9 says which project is open; 5.8 doesn't, so ask this computer
        // which editor is listening at the address (unreal-local.ts).
        const t = config.transport as { url?: string };
        const editor = unrealEditorInfo(initResult) ?? await unrealEditorAt(t.url);
        const version = info?.version?.trim() || editor?.engineVersion;
        if (!unrealVersionOk(version)) {
          // Too old for Ava (5.8 and later only): don't connect at all.
          const old = new Error(`This Unreal Editor (${version}) is older than 5.8. Ava works with Unreal Engine 5.8 and later.`);
          (old as Error & { unrealTooOld?: string }).unrealTooOld = String(version ?? '');
          throw old;
        }
        conn.serial = true;
        conn.callTimeoutMs = UNREAL_CALL_TIMEOUT_MS;
        conn.unrealEditor = editor;
        conn.unreal = await UnrealCatalog.load(conn, !names.includes('describe_toolsets'));
      }
    } catch (err) {
      await client.close().catch(() => {});
      const said = stderrLines.slice(-5).join(' | ');
      const out = new Error(`Could not connect to ${config.name}: ${err instanceof Error ? err.message : String(err)}${said ? ` (it said: ${said})` : ''}`, { cause: err });
      // An online server that wants a sign-in (or a key it didn't accept).
      (out as Error & { unauthorized?: boolean }).unauthorized = isUnauthorized(err);
      // An Unreal older than 5.8: the manager says so in his language.
      const tooOld = (err as { unrealTooOld?: string } | undefined)?.unrealTooOld;
      if (tooOld !== undefined) (out as Error & { unrealTooOld?: string }).unrealTooOld = tooOld;
      throw out;
    }
    return conn;
  }

  /** The server's name and version, as it reports them. */
  get server(): { name: string; version: string } | undefined {
    const v = this.client.getServerVersion();
    return v ? { name: v.name, version: v.version } : undefined;
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  tools(): McpToolInfo[] {
    return this.toolList;
  }

  /** Re-read the tool list (all pages). */
  async refreshTools(): Promise<McpToolInfo[]> {
    const out: McpToolInfo[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.listTools(cursor ? { cursor } : undefined);
      for (const t of page.tools) {
        out.push({
          name: t.name,
          description: t.description ?? '',
          inputSchema: (t.inputSchema ?? { type: 'object' }) as McpToolInfo['inputSchema'],
          readOnly: t.annotations?.readOnlyHint,
          destructive: t.annotations?.destructiveHint,
        });
      }
      cursor = page.nextCursor;
    } while (cursor);
    this.toolList = out;
    return out;
  }

  /**
   * Call one of the server's tools. Text and images come back separately.
   * For a server that runs one call at a time (Unreal), each call waits for
   * the one before; the wait doesn't count against its timeout.
   */
  call(name: string, args: Record<string, unknown>, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<McpCallResult> {
    if (!this.serial) return this.callNow(name, args, opts);
    const run = this.queue.then(() => this.callNow(name, args, opts), () => this.callNow(name, args, opts));
    this.queue = run.catch(() => {});
    return run;
  }

  private async callNow(name: string, args: Record<string, unknown>, opts: { signal?: AbortSignal; timeoutMs?: number }): Promise<McpCallResult> {
    if (this.closed) throw new Error(`${this.config.name} is not connected.`);
    opts.signal?.throwIfAborted();
    this.inFlight++;
    try {
      return await this.callTool(name, args, opts);
    } finally {
      this.inFlight--;
    }
  }

  private async callTool(name: string, args: Record<string, unknown>, opts: { signal?: AbortSignal; timeoutMs?: number }): Promise<McpCallResult> {
    const res = await this.client.callTool({ name, arguments: args }, undefined, {
      signal: opts.signal,
      timeout: opts.timeoutMs ?? this.callTimeoutMs,
      // Asking for progress gives the server a token to report against, and
      // each report restarts the timeout: a long compile or test play that
      // keeps saying "still going" isn't cut off.
      onprogress: () => {},
      resetTimeoutOnProgress: true,
    });
    const text: string[] = [];
    const images: McpCallResult['images'] = [];
    const content = Array.isArray(res.content) ? res.content : [];
    for (const item of content as Array<Record<string, unknown>>) {
      if (item.type === 'text' && typeof item.text === 'string') text.push(item.text);
      else if (item.type === 'image' && typeof item.data === 'string') images.push({ data: item.data, mimeType: String(item.mimeType ?? 'image/png') });
      else if (item.type === 'resource_link') text.push(`[link: ${String(item.name ?? item.uri ?? '')}]`);
      else if (item.type === 'resource') {
        const r = item.resource as Record<string, unknown> | undefined;
        if (typeof r?.text === 'string') text.push(r.text);
        else text.push(`[resource: ${String(r?.uri ?? '')}]`);
      } else if (item.type === 'audio') text.push('[audio]');
    }
    if (!text.length && res.structuredContent) text.push(JSON.stringify(res.structuredContent));
    return { isError: res.isError === true, text: text.join('\n'), images };
  }

  onClose(listener: () => void): void {
    this.closeListeners.push(listener);
  }

  /** Called when the server's tools changed and were read again. */
  onChange(listener: () => void): void {
    this.changeListeners.push(listener);
  }

  private emitChange(): void {
    for (const l of this.changeListeners) {
      try { l(); } catch { /* a listener's problem is not ours */ }
    }
  }

  /**
   * Notice a web server going away. A server reached over plain web requests
   * (Unreal's editor, any http MCP server) keeps no open link, so closing it
   * went unnoticed until the next call — his report, 19 Nov: Unreal closed,
   * the card still said Connected. MCP's own ping every `everyMs`; two misses
   * in a row and it counts as closed (onClose listeners run). Never while a
   * call is running: Unreal does one thing at a time, and a ten-minute
   * compile is busy, not gone.
   */
  startHeartbeat(everyMs: number, timeoutMs = 4000): void {
    if (this.heartbeat || this.closed) return;
    let misses = 0;
    let pinging = false;
    this.heartbeat = setInterval(() => {
      if (this.closed || pinging || this.inFlight > 0) return;
      pinging = true;
      this.client.ping({ timeout: timeoutMs })
        .then(() => { misses = 0; })
        .catch(() => {
          misses++;
          if (misses >= 2) void this.close();
        })
        .finally(() => { pinging = false; });
    }, everyMs);
    // A heartbeat must never keep a program (the CLI, a test) running on its own.
    (this.heartbeat as { unref?: () => void }).unref?.();
  }

  private markClosed(): void {
    if (this.closed) return;
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }
    this.closed = true;
    for (const l of this.closeListeners) {
      try { l(); } catch { /* a listener's problem is not ours */ }
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.client.close().catch(() => {});
    this.markClosed();
  }

  /** The server's recent error output, for telling the person what went wrong. */
  recentErrors(): string[] {
    return [...this.stderrLines];
  }
}
