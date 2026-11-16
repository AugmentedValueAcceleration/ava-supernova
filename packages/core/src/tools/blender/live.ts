/**
 * Blender Live — Ava working in the person's OPEN Blender through Blender
 * Lab's official MCP server. Plan: Decisions/plans/2026-11-16-blender-mcp.md
 * (private), Phase 2: the connection.
 *
 *   Ava ⇄ (stdio) ⇄ blender-mcp  [uv run, in ~/.ava/mcp/blender/<version>/]
 *                       ⇄ (TCP, localhost:9876) ⇄ the "MCP" add-on inside Blender
 *
 * The server is Blender's own file (GPL-3.0) — never shipped with Ava; the
 * person's copy, fetched from Blender's release page on their yes (Phase 4).
 * It opens a fresh socket to Blender for every request, so it starts fine with
 * Blender closed; whether Blender is ready is a separate check of the add-on's
 * port.
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { connect as netConnect } from 'node:net';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { AVA_HOME, CONFIG_PATH } from '../../core/constants.js';
import { McpConnection } from '../../mcp/connection.js';
import { findBlender } from './find-blender.js';

export const BLENDER_MCP_HOST = '127.0.0.1';
export const BLENDER_MCP_PORT = 9876;
/** Live needs the add-on, which needs Blender 5.1 or newer. */
export const BLENDER_LIVE_MIN = '5.1.0';

export const blenderMcpRoot = () => process.env.AVA_BLENDER_MCP_DIR || join(AVA_HOME, 'mcp', 'blender');

export type LiveState =
  | 'needs-uv'        // uv isn't installed
  | 'needs-server'    // Blender's MCP server bundle isn't in ~/.ava/mcp/blender
  | 'off'             // ready to connect, Live not switched on
  | 'blender-closed'  // connected to the server, but no Blender with the add-on running
  | 'ready'           // connected, and Blender answered
  | 'error';

export interface LiveStatus {
  state: LiveState;
  /** The open Blender's version, when it answered. */
  blenderVersion?: string;
  /** The server bundle's version (e.g. "1.0.3"). */
  serverVersion?: string;
  /** Plain words for the room, and for Ava. */
  message: string;
}

// ── What's on the machine ───────────────────────────────────────────────────

function onPath(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(process.platform === 'win32' ? 'where.exe' : 'which', [cmd], { windowsHide: true, timeout: 5000 }, (err, out) => {
      const first = String(out ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean);
      resolve(err || !first ? null : first);
    });
  });
}

/** uv, from PATH or where its own installer puts it (which isn't always on an app's PATH). */
export async function findUv(): Promise<string | null> {
  if (process.env.AVA_UV_PATH && existsSync(process.env.AVA_UV_PATH)) return process.env.AVA_UV_PATH;
  const found = await onPath('uv');
  if (found) return found;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const exe = process.platform === 'win32' ? 'uv.exe' : 'uv';
  for (const dir of [join(home, '.local', 'bin'), join(home, '.cargo', 'bin')]) {
    if (home && existsSync(join(dir, exe))) return join(dir, exe);
  }
  // WinGet (uv's documented Windows route): a running app doesn't see the PATH
  // change until it restarts, so look where WinGet puts it.
  const local = process.env.LOCALAPPDATA;
  if (process.platform === 'win32' && local) {
    const links = join(local, 'Microsoft', 'WinGet', 'Links', exe);
    if (existsSync(links)) return links;
    const pkgs = join(local, 'Microsoft', 'WinGet', 'Packages');
    for (const entry of await readdir(pkgs, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory() && entry.name.startsWith('astral-sh.uv_') && existsSync(join(pkgs, entry.name, exe))) return join(pkgs, entry.name, exe);
    }
  }
  return null;
}

const versionKey = (v: string) => v.split(/[.-]/).map((n) => Number(n) || 0);
function newer(a: string, b: string): boolean {
  const x = versionKey(a), y = versionKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}
export const versionAtLeast = (v: string, min: string) => v === min || newer(v, min);

/** The newest unpacked server bundle: ~/.ava/mcp/blender/<version>/ with Blender's manifest. */
export async function installedServer(): Promise<{ dir: string; version: string } | null> {
  let best: { dir: string; version: string } | null = null;
  for (const entry of await readdir(blenderMcpRoot(), { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const dir = join(blenderMcpRoot(), entry.name);
    try {
      const m = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as { version?: string; server?: { type?: string } };
      if (m.server?.type !== 'uv' || !m.version) continue;
      if (!best || newer(m.version, best.version)) best = { dir, version: m.version };
    } catch { /* not a bundle */ }
  }
  return best;
}

/** Is a Blender with the add-on's server running? (Its port answers.) */
export function addonListening(port = BLENDER_MCP_PORT, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = netConnect({ host: BLENDER_MCP_HOST, port });
    const done = (ok: boolean) => { sock.destroy(); resolve(ok); };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

// ── The room's setting (his call, 16 Nov: one setting for the room) ─────────
// In ~/.ava/config.json beside the Blender path, so the extension and the IDE
// share it: switch Live on in one, it's on in the other.

const configPath = () => process.env.AVA_CONFIG_PATH || CONFIG_PATH;

export async function blenderLiveWanted(): Promise<boolean> {
  try {
    const cfg = JSON.parse(await readFile(configPath(), 'utf-8')) as { preferences?: { blenderLive?: boolean } };
    return cfg.preferences?.blenderLive === true;
  } catch {
    return false;
  }
}

export async function setBlenderLiveWanted(on: boolean): Promise<void> {
  let cfg: Record<string, unknown> = {};
  try { cfg = JSON.parse(await readFile(configPath(), 'utf-8')); } catch { /* none yet */ }
  const prefs = { ...((cfg.preferences as Record<string, unknown> | undefined) ?? {}) };
  if (on) prefs.blenderLive = true; else delete prefs.blenderLive;
  cfg.preferences = prefs;
  await mkdir(dirname(configPath()), { recursive: true });
  const tmp = `${configPath()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(cfg, null, 2), 'utf-8');
  await rename(tmp, configPath());
}

/** The model open Live in their Blender (one model, one place: Headless won't touch it). */
export interface LiveModel { slug: string; name: string; dir: string; blend: string }

// ── The connection ──────────────────────────────────────────────────────────

const MESSAGES: Record<LiveState, string> = {
  'needs-uv': 'Live needs uv (a small tool that runs Blender\'s MCP server). I can install it for you.',
  'needs-server': 'Live needs Blender\'s official MCP server. I can fetch it from Blender\'s release page for you.',
  off: 'Live is off — I work headless.',
  'blender-closed': 'Blender isn\'t open with the MCP add-on running. Open Blender 5.1 or newer and start the add-on.',
  ready: 'Connected to your Blender.',
  error: 'Live hit a problem connecting.',
};

type Listener = (s: LiveStatus) => void;

export class BlenderLive {
  private static instance: BlenderLive | null = null;
  static current(): BlenderLive {
    if (!BlenderLive.instance) BlenderLive.instance = new BlenderLive();
    return BlenderLive.instance;
  }

  private conn: McpConnection | null = null;
  private connecting: Promise<LiveStatus> | null = null;
  private last: LiveStatus = { state: 'off', message: MESSAGES.off };
  private readonly listeners: Listener[] = [];
  private watcher: ReturnType<typeof setInterval> | null = null;
  /** The model open Live right now (set by design_live_open_model). */
  openModel: LiveModel | null = null;
  /** For tests: start a different server than Blender's bundle. */
  launch?: (env: Record<string, string>) => Promise<McpConnection>;

  get connection(): McpConnection | null {
    return this.conn?.isOpen ? this.conn : null;
  }

  get lastStatus(): LiveStatus {
    return this.last;
  }

  onChange(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => { const i = this.listeners.indexOf(listener); if (i >= 0) this.listeners.splice(i, 1); };
  }

  private set(s: LiveStatus): LiveStatus {
    const changed = s.state !== this.last.state || s.blenderVersion !== this.last.blenderVersion || s.message !== this.last.message;
    this.last = s;
    if (changed) for (const l of this.listeners) { try { l(s); } catch { /* not ours */ } }
    return s;
  }

  /** What's missing before Live can connect, without connecting. */
  async prerequisites(): Promise<LiveStatus | { uv: string; server: { dir: string; version: string } }> {
    if (this.launch) return { uv: 'test', server: { dir: '.', version: 'test' } };
    const uv = await findUv();
    if (!uv) return { state: 'needs-uv', message: MESSAGES['needs-uv'] };
    const server = await installedServer();
    if (!server) return { state: 'needs-server', message: MESSAGES['needs-server'] };
    return { uv, server };
  }

  /** Switch Live on: start the server and see whether Blender answers. */
  async connect(): Promise<LiveStatus> {
    if (this.connection) return this.refresh();
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const pre = await this.prerequisites();
      if ('state' in pre) return this.set(pre);
      const env: Record<string, string> = { BLENDER_MCP_HOST: BLENDER_MCP_HOST, BLENDER_MCP_PORT: String(BLENDER_MCP_PORT) };
      const blender = await findBlender().catch(() => null);
      if (blender?.path) env.BLENDER_PATH = blender.path;
      try {
        this.conn = this.launch
          ? await this.launch(env)
          : await McpConnection.open({
              id: 'blender_live', name: 'Blender',
              transport: { kind: 'program', command: pre.uv, args: ['run', '--quiet', 'blender-mcp'], cwd: pre.server.dir, env },
            }, { timeoutMs: 120_000 }); // the first start sets up Python and the server's libraries
        this.conn.onClose(() => {
          this.conn = null;
          this.set({ state: 'error', serverVersion: pre.server.version, message: 'Blender\'s MCP server stopped. Switch Live off and on to restart it.' });
        });
      } catch (err) {
        return this.set({ state: 'error', message: `${MESSAGES.error} ${err instanceof Error ? err.message : String(err)}` });
      }
      this.watch();
      return this.refresh(pre.server.version);
    })().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  /**
   * While Live is on, notice Blender opening and closing: a cheap port check
   * every few seconds, and one question to Blender only when that changes.
   */
  private watch(): void {
    if (this.watcher || this.launch) return;
    this.watcher = setInterval(() => {
      if (!this.connection) return;
      void addonListening().then((up) => {
        const ready = this.last.state === 'ready';
        if (up && !ready) void this.refresh();
        if (!up && ready) {
          this.openModel = null;
          this.set({ state: 'blender-closed', serverVersion: this.last.serverVersion, message: MESSAGES['blender-closed'] });
        }
      });
    }, 4000);
    (this.watcher as unknown as { unref?: () => void }).unref?.();
  }

  /** Re-check Blender (opened or closed since). Cheap: a port check, then one question to Blender. */
  async refresh(serverVersion = this.last.serverVersion): Promise<LiveStatus> {
    const conn = this.connection;
    if (!conn) return this.set({ state: 'off', message: MESSAGES.off });
    if (!this.launch && !(await addonListening())) {
      return this.set({ state: 'blender-closed', serverVersion, message: MESSAGES['blender-closed'] });
    }
    try {
      const r = await conn.call('execute_blender_code', { code: 'import bpy\nresult = {"version": bpy.app.version_string}' }, { timeoutMs: 15_000 });
      const version = /"version"\s*:\s*"([^"]+)"/.exec(r.text)?.[1] ?? /\b(\d+\.\d+(?:\.\d+)?)\b/.exec(r.text)?.[1];
      if (r.isError || !version) return this.set({ state: 'blender-closed', serverVersion, message: MESSAGES['blender-closed'] });
      if (!versionAtLeast(version, BLENDER_LIVE_MIN)) {
        return this.set({ state: 'error', serverVersion, blenderVersion: version, message: `This is Blender ${version}; Live needs ${BLENDER_LIVE_MIN} or newer. Headless works with any version.` });
      }
      return this.set({ state: 'ready', serverVersion, blenderVersion: version, message: `Connected to Blender ${version} · ready` });
    } catch {
      return this.set({ state: 'blender-closed', serverVersion, message: MESSAGES['blender-closed'] });
    }
  }

  /** Switch Live off. */
  async disconnect(): Promise<LiveStatus> {
    const c = this.conn;
    this.conn = null;
    this.openModel = null;
    if (this.watcher) { clearInterval(this.watcher); this.watcher = null; }
    if (c) await c.close();
    return this.set({ state: 'off', message: MESSAGES.off });
  }
}
