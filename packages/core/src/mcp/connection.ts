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
 * Local only, on purpose: a web address that isn't this computer is refused,
 * so nothing here can send work off the machine. A server's tools are read
 * when it connects, never hard-coded, so an experimental server changing its
 * tools costs us nothing.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export type McpTransportConfig =
  /** A program Ava starts, talking over its input and output. */
  | { kind: 'program'; command: string; args?: string[]; env?: Record<string, string>; cwd?: string }
  /** A server already running on this computer, at a local web address. */
  | { kind: 'local-url'; url: string; headers?: Record<string, string> };

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

function makeTransport(cfg: McpTransportConfig, stderrLines: string[]): Transport {
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

export class McpConnection {
  private toolList: McpToolInfo[] = [];
  private closed = false;
  private readonly closeListeners: Array<() => void> = [];

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
    client.onclose = () => conn.markClosed();
    try {
      await client.connect(transport, { timeout: opts.timeoutMs ?? 30_000 });
      await conn.refreshTools();
    } catch (err) {
      await client.close().catch(() => {});
      const said = stderrLines.slice(-5).join(' | ');
      throw new Error(`Could not connect to ${config.name}: ${err instanceof Error ? err.message : String(err)}${said ? ` (it said: ${said})` : ''}`);
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

  /** Call one of the server's tools. Text and images come back separately. */
  async call(name: string, args: Record<string, unknown>, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<McpCallResult> {
    if (this.closed) throw new Error(`${this.config.name} is not connected.`);
    const res = await this.client.callTool({ name, arguments: args }, undefined, {
      signal: opts.signal,
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
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

  private markClosed(): void {
    if (this.closed) return;
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
