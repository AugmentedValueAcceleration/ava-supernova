/**
 * Blender MCP setup, done BY Ava on the person's yes — Phase 4 of
 * Decisions/plans/2026-11-16-blender-mcp.md (private). His call, 17 Nov:
 * "show ava as the perfect assistant" — three yeses, she does the rest.
 *
 *   check          what's there and what's missing (safe)
 *   install_uv     uv, by its official route (WinGet on Windows; astral's installer elsewhere)
 *   install_server Blender Lab's official MCP server: the latest STABLE release's .mcpb from
 *                  projects.blender.org, checked, unpacked into ~/.ava/mcp/blender/<version>/
 *   install_addon  the "MCP" add-on from the same release, into a Blender 5.1+ with Blender's
 *                  own command — only while Blender is closed (a running Blender could
 *                  overwrite its preferences)
 *
 * Only official sources; every download is checked (it must be Blender Lab's
 * own bundle / extension) before it's used. Nothing is ever shipped with Ava:
 * the server and add-on are Blender's files (GPL-3.0).
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { unzipSync } from 'fflate';
import type { Tool, ToolExecutionContext, ToolResult, ToolRiskLevel } from '../types.js';
import type { FunctionSchema } from '../../providers/types.js';
import { BlenderLive, blenderMcpRoot, findUv, installedServer, versionAtLeast, BLENDER_LIVE_MIN, blenderLiveWanted } from './live.js';
import { findBlender, readBlenderVersion } from './find-blender.js';

const RELEASES_API = 'https://projects.blender.org/api/v1/repos/lab/blender_mcp/releases?limit=10';
const OFFICIAL_HOST = 'projects.blender.org';

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    execFile(cmd, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      done({ code, out: `${stdout ?? ''}${stderr ?? ''}` });
    });
  });
}

// ── Blender's release page ──────────────────────────────────────────────────

export interface ServerRelease { version: string; mcpb: { url: string; name: string }; addon: { url: string; name: string } }

/** The latest STABLE release of Blender Lab's MCP server, from Blender's own release list. */
export async function latestServerRelease(): Promise<ServerRelease | null> {
  const res = await fetch(RELEASES_API, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) return null;
  const list = await res.json().catch(() => []) as Array<{ tag_name: string; draft: boolean; prerelease: boolean; assets: Array<{ name: string; browser_download_url: string }> }>;
  for (const r of list) {
    if (r.draft || r.prerelease) continue;
    const mcpb = r.assets.find((a) => a.name.endsWith('.mcpb'));
    const addon = r.assets.find((a) => /^mcp-.*\.zip$/.test(a.name));
    if (!mcpb || !addon) continue;
    const official = (u: string) => { try { return new URL(u).hostname === OFFICIAL_HOST; } catch { return false; } };
    if (!official(mcpb.browser_download_url) || !official(addon.browser_download_url)) continue;
    return { version: r.tag_name.replace(/^v/, ''), mcpb: { url: mcpb.browser_download_url, name: mcpb.name }, addon: { url: addon.browser_download_url, name: addon.name } };
  }
  return null;
}

async function download(url: string): Promise<Uint8Array> {
  if (new URL(url).hostname !== OFFICIAL_HOST) throw new Error('Only Blender\'s own release page is used.');
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`Blender's release page answered ${res.status}.`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > 100 * 1024 * 1024) throw new Error('That download is far bigger than Blender\'s server should be, so it wasn\'t used.');
  return bytes;
}

/** Unpack into `dest`, refusing any path that would land outside it. */
export async function unpack(files: Record<string, Uint8Array>, dest: string): Promise<void> {
  const root = resolve(dest);
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    const out = resolve(root, name);
    if (out !== root && !out.startsWith(root + sep)) throw new Error(`The bundle has a file outside its folder (${name}), so it wasn't used.`);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, data);
  }
}

// ── What's on the machine ───────────────────────────────────────────────────

export interface BlenderInstallInfo {
  path: string; version: string; addon: string | null; liveOk: boolean;
  /** The Blender Ava uses (the one chosen in Settings, or else the one she found). */
  inUse: boolean;
  /** Chosen by them in Settings, General, "Blender (3D models)". */
  chosen: boolean;
}

/** Blender's own config folder for a version (where its extensions are). */
function blenderConfigDir(version: string): string | null {
  const v = version.split('.').slice(0, 2).join('.');
  if (process.platform === 'win32') return process.env.APPDATA ? join(process.env.APPDATA, 'Blender Foundation', 'Blender', v) : null;
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Blender', v);
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'blender', v);
}

/** The MCP add-on's version inside a Blender, or null. */
async function addonVersion(version: string): Promise<string | null> {
  const dir = blenderConfigDir(version);
  if (!dir) return null;
  try {
    const toml = await readFile(join(dir, 'extensions', 'user_default', 'mcp', 'blender_manifest.toml'), 'utf-8');
    return /^version\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? '?';
  } catch {
    return null;
  }
}

/** Every Blender on the machine we can find (several versions side by side is normal). */
export async function blenderInstalls(): Promise<BlenderInstallInfo[]> {
  const paths = new Set<string>();
  const found = await findBlender().catch(() => null);
  if (found?.path) paths.add(found.path);
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean) as string[]) {
      const root = join(base, 'Blender Foundation');
      for (const e of await readdir(root, { withFileTypes: true }).catch(() => [])) {
        const exe = join(root, e.name, 'blender.exe');
        if (e.isDirectory() && existsSync(exe)) paths.add(exe);
      }
    }
  } else if (process.platform === 'darwin') {
    for (const e of await readdir('/Applications', { withFileTypes: true }).catch(() => [])) {
      const exe = join('/Applications', e.name, 'Contents', 'MacOS', 'Blender');
      if (/^Blender/i.test(e.name) && existsSync(exe)) paths.add(exe);
    }
  }
  const out: BlenderInstallInfo[] = [];
  for (const path of paths) {
    const version = (await readBlenderVersion(path).catch(() => null)) ?? null;
    if (!version) continue;
    const inUse = !!found?.path && resolve(found.path).toLowerCase() === resolve(path).toLowerCase();
    out.push({ path, version, addon: await addonVersion(version), liveOk: versionAtLeast(version, BLENDER_LIVE_MIN), inUse, chosen: inUse && found?.source === 'settings' });
  }
  // The one they use first (their choice in Settings wins), then newest.
  return out.sort((a, b) => (a.inUse !== b.inUse ? (a.inUse ? -1 : 1) : versionAtLeast(a.version, b.version) ? -1 : 1));
}

async function blenderRunning(): Promise<boolean> {
  if (process.platform === 'win32') {
    const r = await run('tasklist', ['/FI', 'IMAGENAME eq blender.exe', '/NH'], 10_000);
    return /blender\.exe/i.test(r.out);
  }
  const r = await run('pgrep', ['-x', process.platform === 'darwin' ? 'Blender' : 'blender'], 10_000);
  return r.code === 0;
}

// ── The steps ───────────────────────────────────────────────────────────────

async function installUv(): Promise<string> {
  if (await findUv()) return 'uv is already installed.';
  const r = process.platform === 'win32'
    ? await run('winget', ['install', '--id=astral-sh.uv', '-e', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity'], 300_000)
    : await run('sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'], 300_000);
  const uv = await findUv();
  if (uv) return `uv is installed (${uv}).`;
  throw new Error(process.platform === 'win32' && /not recognized|cannot find|ENOENT/i.test(r.out)
    ? 'Windows Package Manager (winget) isn\'t available here. uv can be installed from https://docs.astral.sh/uv/getting-started/installation/ — then try again.'
    : `uv didn't install: ${r.out.trim().split(/\r?\n/).slice(-3).join(' ')}`);
}

async function installServer(): Promise<string> {
  const rel = await latestServerRelease();
  if (!rel) throw new Error('Blender\'s release page couldn\'t be read. Try again in a moment.');
  const have = await installedServer();
  if (have && versionAtLeast(have.version, rel.version)) return `Blender's MCP server ${have.version} is already installed (the latest stable).`;
  const files = unzipSync(await download(rel.mcpb.url));
  const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'] ?? new Uint8Array())) as { name?: string; version?: string; author?: { name?: string }; server?: { type?: string } };
  if (manifest.author?.name !== 'Blender Lab' || manifest.server?.type !== 'uv' || !manifest.version) {
    throw new Error('That download isn\'t Blender Lab\'s MCP server bundle, so it wasn\'t used.');
  }
  const dest = join(blenderMcpRoot(), manifest.version);
  await rm(dest, { recursive: true, force: true });
  await unpack(files, dest);
  if (await blenderLiveWanted()) void BlenderLive.current().disconnect().then(() => BlenderLive.current().connect());
  return `Blender's official MCP server ${manifest.version} is installed in ${dest}.`;
}

async function installAddon(blenderPath?: string): Promise<string> {
  const installs = (await blenderInstalls()).filter((b) => b.liveOk);
  if (!installs.length) throw new Error(`MCP needs Blender ${BLENDER_LIVE_MIN} or newer, and none is installed. It's free from https://www.blender.org/download/ — Headless works with any version meanwhile.`);
  const target = blenderPath ? installs.find((b) => resolve(b.path).toLowerCase() === resolve(blenderPath).toLowerCase()) : installs[0];
  if (!target) throw new Error(`That Blender isn't one I found that can use MCP. These can: ${installs.map((b) => `${b.version} (${b.path})`).join(', ')}.`);
  if (await blenderRunning()) throw new Error('Blender is open. Ask them to close every Blender window first — installing while it runs could be undone when Blender saves its settings — then try again.');
  const rel = await latestServerRelease();
  if (!rel) throw new Error('Blender\'s release page couldn\'t be read. Try again in a moment.');
  const bytes = await download(rel.addon.url);
  const toml = new TextDecoder().decode(unzipSync(bytes)['blender_manifest.toml'] ?? new Uint8Array());
  if (!/^id\s*=\s*"mcp"/m.test(toml) || !/maintainer\s*=\s*"Blender Lab"/.test(toml)) {
    throw new Error('That download isn\'t Blender Lab\'s MCP add-on, so it wasn\'t used.');
  }
  const zip = join(tmpdir(), `ava-${rel.addon.name}`);
  await writeFile(zip, bytes);
  try {
    const r = await run(target.path, ['--command', 'extension', 'install-file', '-r', 'user_default', '-e', zip], 180_000);
    if (!/Installed/i.test(r.out)) throw new Error(`Blender didn't install the add-on: ${r.out.trim().split(/\r?\n/).slice(-3).join(' ')}`);
  } finally {
    await rm(zip, { force: true }).catch(() => {});
  }
  const others = installs.filter((b) => b !== target && !b.addon);
  return `The MCP add-on is installed and switched on in Blender ${target.version}. Open that Blender: the add-on starts its server by itself.` +
    (others.length ? ` Other Blenders that could use it too: ${others.map((b) => b.version).join(', ')} — offer to install it there as well.` : '');
}

async function check(): Promise<string> {
  const [uv, server, rel, installs, running] = await Promise.all([findUv(), installedServer(), latestServerRelease().catch(() => null), blenderInstalls(), blenderRunning()]);
  const lines = [
    `1. uv: ${uv ? `installed (${uv})` : 'NOT installed — install_uv'}`,
    `2. Blender's MCP server: ${server ? `installed, version ${server.version}${rel && !versionAtLeast(server.version, rel.version) ? ` (a newer stable, ${rel.version}, is out — install_server updates it)` : ''}` : `NOT installed — install_server (latest stable: ${rel?.version ?? 'unknown'})`}`,
    `3. The add-on: ${installs.length ? installs.map((b) => `Blender ${b.version}${b.chosen ? ' — the one they chose in Settings' : b.inUse ? ' — the one Ava uses' : ''} (${b.path}): ${
      !b.liveOk ? `too old for MCP (needs ${BLENDER_LIVE_MIN}+)`
        : !b.addon ? 'add-on NOT installed — install_addon with this blender_path'
          : rel && b.addon !== '?' && !versionAtLeast(b.addon, rel.version) ? `add-on ${b.addon} installed, older than the latest stable ${rel.version} — install_addon with this blender_path updates it`
            : `add-on ${b.addon} installed`}`).join('; ') : `no Blender found — MCP needs ${BLENDER_LIVE_MIN}+, free from blender.org`}`,
    `Blender is ${running ? 'open right now' : 'closed'}.`,
    `MCP status: ${BlenderLive.current().lastStatus.message}`,
  ];
  return lines.join('\n');
}

// ── The tools ───────────────────────────────────────────────────────────────

export class DesignLiveSetupCheckTool implements Tool {
  readonly name = 'design_live_setup_check';
  readonly description = 'See what MCP for the Blender room needs: uv, Blender\'s official MCP server, and its add-on.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;
  readonly schema: FunctionSchema = {
    name: 'design_live_setup_check',
    description: 'Check what MCP (Ava working in their open Blender) needs on this computer: uv, Blender\'s official MCP server, the add-on in each Blender, and whether Blender is open. Call this first, then set up what\'s missing with design_live_setup.',
    parameters: { type: 'object', properties: {} },
  };

  async execute(): Promise<ToolResult> {
    try {
      return { success: true, output: await check() };
    } catch (err) {
      return { success: false, output: err instanceof Error ? err.message : String(err) };
    }
  }
}

export class DesignLiveSetupTool implements Tool {
  readonly name = 'design_live_setup';
  readonly description = 'Set up MCP for the Blender room: install uv, Blender\'s official MCP server, or its add-on — each on their yes.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;
  readonly schema: FunctionSchema = {
    name: 'design_live_setup',
    description:
      'Set up MCP (Ava working in their open Blender) for them. First call design_live_setup_check and tell them, in plain words, what\'s missing. ' +
      'Then do the missing steps ONE AT A TIME, in order — install_uv, install_server, install_addon — saying what each is and why before you call it; each asks them first. ' +
      'Everything comes only from official sources (uv\'s own installer; Blender\'s own release page). For install_addon every Blender window must be closed: ask them to close it and wait. ' +
      'When it\'s done, tell them to open Blender (5.1 or newer) and switch the room to MCP.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['install_uv', 'install_server', 'install_addon'], description: 'What to install.' },
        blender_path: { type: 'string', description: 'install_addon only: which Blender (its path, from design_live_setup_check). Default: the one they use (their choice in Settings), else the newest that can use MCP.' },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      switch (args.action) {
        case 'install_uv': return { success: true, output: await installUv() };
        case 'install_server': return { success: true, output: await installServer() };
        case 'install_addon': return { success: true, output: await installAddon(typeof args.blender_path === 'string' ? args.blender_path : undefined) };
        default: return { success: false, output: 'action must be install_uv, install_server or install_addon.' };
      }
    } catch (err) {
      return { success: false, output: err instanceof Error ? err.message : String(err) };
    }
  }
}
