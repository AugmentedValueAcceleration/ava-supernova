/**
 * Which project is the Unreal Editor on this computer working in — for an
 * editor that doesn't say (plan 2026-11-18-unreal; 5.8 support, 20 Nov 2026).
 *
 * Unreal 5.9 puts the open project in its initialize answer (unrealEditorInfo
 * in unreal.ts). 5.8 sends nothing: a blank name, a blank version and no
 * project (read from his 5.8 editor, 20 Nov). Without it Ava can't say which
 * project she's in, or notice that it isn't the folder open in her app — the
 * mistake her Unreal section exists to prevent.
 *
 * The server is on this computer, so the answer is here too: the program
 * listening on the server's port is the editor, and its command line names
 * the .uproject (seen live: `UnrealEditor.exe "../../../../../../Users/…/DawnSets/
 * DawnSets.uproject"` — relative to the editor's own folder). The engine
 * version comes from the .uproject's EngineAssociation, else the install folder
 * ("UE_5.8"). Only for a local address. Never throws: undefined means unknown.
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import type { UnrealEditorInfo } from './unreal.js';

const run = (cmd: string, args: string[]) =>
  new Promise<string>((ok) => {
    execFile(cmd, args, { timeout: 5_000, windowsHide: true, maxBuffer: 1 << 20 }, (err, out) => ok(err ? '' : String(out)));
  });

/** The listening program's executable and command line, or undefined. */
async function listener(port: number): Promise<{ exe?: string; cmd: string } | undefined> {
  if (process.platform === 'win32') {
    const ps = `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; `
      + `if ($c) { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"; `
      + `[pscustomobject]@{ exe = $p.ExecutablePath; cmd = $p.CommandLine } | ConvertTo-Json -Compress }`;
    const out = (await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps])).trim();
    if (!out) return undefined;
    try {
      const j = JSON.parse(out) as { exe?: string; cmd?: string };
      return j.cmd ? { exe: j.exe ?? undefined, cmd: j.cmd } : undefined;
    } catch {
      return undefined;
    }
  }
  const pid = (await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])).trim().split(/\s+/)[0];
  if (!pid) return undefined;
  const cmd = (await run('ps', ['-o', 'command=', '-p', pid])).trim();
  return cmd ? { cmd } : undefined;
}

/** The .uproject a command line opens, resolved against the editor's folder. Exported for tests. */
export function uprojectFromCommandLine(cmd: string, exe?: string): string | undefined {
  const m = /"([^"]+\.uproject)"|(\S+\.uproject)/i.exec(cmd);
  const raw = m?.[1] ?? m?.[2];
  if (!raw) return undefined;
  if (isAbsolute(raw)) return raw;
  const exePath = exe ?? /^"([^"]+)"|^(\S+)/.exec(cmd.trim())?.slice(1).find(Boolean);
  const candidates = [exePath ? resolve(dirname(exePath), raw) : undefined, resolve(raw)].filter((p): p is string => !!p);
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

/** "5.8" from the .uproject, else from an install folder like ".../UE_5.8/Engine/...". Exported for tests. */
export function engineVersionOf(uproject: string | undefined, exe?: string): string | undefined {
  if (uproject) {
    try {
      const a = (JSON.parse(readFileSync(uproject, 'utf8')) as { EngineAssociation?: unknown }).EngineAssociation;
      if (typeof a === 'string' && /^\d+\.\d+/.test(a.trim())) return a.trim();
    } catch { /* unreadable: try the install folder */ }
  }
  return /UE_(\d+\.\d+)/i.exec(exe ?? '')?.[1];
}

/**
 * The Unreal Engine versions installed through the Epic Games Launcher ("5.8",
 * "5.9", …), newest first — so setup shows the steps for the versions they
 * have (his call, 20 Nov 2026: 5.8 now; 5.9 works but isn't advertised, so its
 * steps show only to someone who has it). From the Launcher's own list
 * (LauncherInstalled.dat, read on his machine 20 Nov). Source builds aren't
 * in it; a running editor still counts (runningUnrealEditors). Never throws.
 */
export function unrealInstalls(): string[] {
  const files = process.platform === 'win32'
    ? [join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat')]
    : [join(homedir(), 'Library', 'Application Support', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'),
       join(homedir(), '.config', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat')];
  const out = new Set<string>();
  for (const f of files) {
    try {
      const list = (JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, '')) as { InstallationList?: Array<{ AppName?: string }> }).InstallationList ?? [];
      for (const i of list) {
        const v = /^UE_(\d+\.\d+)$/.exec(i.AppName ?? '')?.[1];
        if (v) out.add(v);
      }
    } catch { /* no Launcher list here */ }
  }
  return [...out].sort(compareVersions).reverse();
}

/** "5.10" after "5.9". Exported for tests. */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  return (x[0] - y[0]) || ((x[1] ?? 0) - (y[1] ?? 0));
}

/**
 * Unreal Editors running on this computer, with their version and project —
 * even with their MCP server off, which is exactly when setup needs to say
 * "5.8 is open with DawnSets, but its server is off". Never throws.
 */
export async function runningUnrealEditors(): Promise<Array<{ version?: string; project?: string; projectDir?: string }>> {
  try {
    let found: Array<{ exe?: string; cmd: string }> = [];
    if (process.platform === 'win32') {
      const ps = `Get-CimInstance Win32_Process -Filter "Name='UnrealEditor.exe'" | ForEach-Object { [pscustomobject]@{ exe = $_.ExecutablePath; cmd = $_.CommandLine } } | ConvertTo-Json -Compress`;
      const out = (await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps])).trim();
      if (out) {
        const j = JSON.parse(out) as { exe?: string; cmd?: string } | Array<{ exe?: string; cmd?: string }>;
        found = (Array.isArray(j) ? j : [j]).filter((p) => !!p.cmd).map((p) => ({ exe: p.exe ?? undefined, cmd: p.cmd! }));
      }
    } else {
      const out = await run('ps', ['-A', '-o', 'command=']);
      found = out.split('\n').map((l) => l.trim()).filter((l) => /UnrealEditor(\.app|\s|$)/.test(l) && !/-cmd|CrashReport|ShaderCompile/i.test(l)).map((cmd) => ({ cmd }));
    }
    return found.map((p) => {
      const exe = p.exe ?? /^"([^"]+)"|^(\S+)/.exec(p.cmd)?.slice(1).find(Boolean);
      const uproject = uprojectFromCommandLine(p.cmd, exe);
      return {
        version: engineVersionOf(uproject, exe),
        ...(uproject ? { project: basename(uproject).replace(/\.uproject$/i, ''), projectDir: dirname(uproject) } : {}),
      };
    });
  } catch {
    return [];
  }
}

/** The editor behind a local Unreal address, or undefined when it can't be told. */
export async function unrealEditorAt(url: string | undefined): Promise<UnrealEditorInfo | undefined> {
  try {
    if (!url) return undefined;
    const u = new URL(url);
    if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(u.hostname)) return undefined;
    const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
    const l = await listener(port);
    if (!l) return undefined;
    const uproject = uprojectFromCommandLine(l.cmd, l.exe);
    const exe = l.exe ?? /^"([^"]+)"|^(\S+)/.exec(l.cmd.trim())?.slice(1).find(Boolean);
    const engineVersion = engineVersionOf(uproject, exe);
    if (!uproject && !engineVersion) return undefined;
    return {
      ...(uproject ? { project: basename(uproject).replace(/\.uproject$/i, ''), projectDir: dirname(uproject) } : {}),
      ...(engineVersion ? { engineVersion } : {}),
    };
  } catch {
    return undefined;
  }
}
