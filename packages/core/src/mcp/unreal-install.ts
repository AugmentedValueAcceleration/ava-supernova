/**
 * Putting Ava where Unreal's Assistant panel can start her (plan
 * 2026-11-18-unreal, Phase 2 step 2): ~/.ava/bin/Ava.exe and its program.
 *
 *   ~/.ava/bin/Ava.exe                      Node's own runtime, renamed — the
 *                                           panel shows the program's file name
 *                                           (his decision 5: "Ava.exe"). Renaming
 *                                           keeps Node's signature (checked on his
 *                                           machine 18 Nov: Valid, OpenJS Foundation).
 *   ~/.ava/bin/ava-unreal/ava-unreal.mjs    Ava (packages/cli/src/acp), one file
 *   ~/.ava/bin/ava-unreal/native/           the keychain build for this machine
 *   ~/.ava/bin/ava-unreal/data, fonts/      for PDFs (pdfkit, AVA_FONTS_DIR)
 *
 * In ~/.ava so it follows him between apps: set up from the extension or the
 * IDE, it's the same Ava.exe. Each app says where its copy of the program is
 * (setUnrealProgramSource); the IDE gives its own Node, the extension
 * downloads Node's official zip from nodejs.org (his decision 6), checked
 * against the SHA-256 below before anything is used.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { AVA_HOME } from '../core/constants.js';

const run = promisify(execFile);

/** The Node the IDE ships (ide/scripts/bundle-sidecar.mjs) and the extension downloads. */
export const UNREAL_NODE_VERSION = '24.22.1';

/** nodejs.org/dist/v24.22.1/SHASUMS256.txt, 18 Nov 2026. */
const NODE_ZIPS: Record<string, { file: string; sha256: string }> = {
  x64: { file: `node-v${UNREAL_NODE_VERSION}-win-x64`, sha256: 'd2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5' },
  arm64: { file: `node-v${UNREAL_NODE_VERSION}-win-arm64`, sha256: 'a0c807319fede24c4a0d8f84564c82a619bd313b16b10c007c383c2609e99171' },
};

export interface UnrealProgramSource {
  /** The app's folder holding ava-unreal.mjs and native/. */
  programDir: string;
  /** pdfkit's data folder and the PDF fonts, as the app ships them. */
  dataDir?: string;
  fontsDir?: string;
  /** A Node runtime (UNREAL_NODE_VERSION) to copy as Ava.exe — the IDE's own; the extension downloads one. */
  node: () => Promise<string>;
  /** Setting up downloads Node (the extension): the page says so first. */
  downloadsNode?: boolean;
}

let source: UnrealProgramSource | null = null;

/** Each app, at start: where its copy of the program is. */
export function setUnrealProgramSource(s: UnrealProgramSource): void {
  source = s;
}

export const unrealBinDir = (home = AVA_HOME) => join(home, 'bin');

export function unrealProgramPaths(home = AVA_HOME): { command: string; program: string; dir: string } {
  const bin = unrealBinDir(home);
  const dir = join(bin, 'ava-unreal');
  return { command: join(bin, 'Ava.exe'), program: join(dir, 'ava-unreal.mjs'), dir };
}

export interface UnrealProgramState {
  /** Ava in Unreal's panel runs on Windows for now (Ava.exe). */
  supported: boolean;
  /** This app can set it up (it has the program to copy). */
  canInstall: boolean;
  installed: boolean;
  /** Installed, and the same as this app's copy. */
  current: boolean;
  /** Setting it up (or updating) will download Node from nodejs.org (36 MB). */
  downloadsNode: boolean;
  /** What to paste into Unreal: Custom Agent Command, and its one argument. */
  command: string;
  args: string[];
}

const sha = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex');

interface Stamp { program: string; node: string }

async function readStamp(dir: string): Promise<Stamp | null> {
  try { return JSON.parse(await readFile(join(dir, 'version.json'), 'utf8')) as Stamp; } catch { return null; }
}

export async function unrealProgramState(home = AVA_HOME): Promise<UnrealProgramState> {
  const p = unrealProgramPaths(home);
  const installed = existsSync(p.command) && existsSync(p.program);
  let current = false;
  if (installed && source) {
    const stamp = await readStamp(p.dir);
    const mine = await sha(join(source.programDir, 'ava-unreal.mjs')).catch(() => '');
    current = !!stamp && stamp.program === mine && stamp.node === UNREAL_NODE_VERSION;
  }
  return {
    supported: process.platform === 'win32',
    canInstall: !!source && existsSync(join(source.programDir, 'ava-unreal.mjs')),
    downloadsNode: !!source?.downloadsNode && (!existsSync(p.command) || await nodeVersionOf(p.command) !== UNREAL_NODE_VERSION),
    installed,
    current,
    command: p.command,
    args: [p.program],
  };
}

async function nodeVersionOf(exe: string): Promise<string | null> {
  try { return (await run(exe, ['--version'], { timeout: 15_000 })).stdout.trim().replace(/^v/, ''); } catch { return null; }
}

async function copyDir(from: string, to: string, only?: (name: string) => boolean): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const name of await readdir(from)) {
    if (only && !only(name)) continue;
    const a = join(from, name);
    const b = join(to, name);
    const s = await stat(a);
    if (s.isDirectory()) { await copyDir(a, b); continue; }
    const there = await stat(b).catch(() => null);
    if (there && there.size === s.size) continue; // fonts don't change in place; the program is checked by hash
    await copyFile(a, b);
  }
}

/**
 * Put Ava.exe and her program in ~/.ava/bin (or bring them up to date).
 * Throws with words for him: Unreal holding Ava.exe open, a failed download.
 */
export async function installUnrealProgram(home = AVA_HOME): Promise<UnrealProgramState> {
  if (process.platform !== 'win32') throw new Error('Ava in Unreal\'s panel runs on Windows for now.');
  if (!source) throw new Error('This app can\'t set up Ava for Unreal.');
  const src = source;
  const p = unrealProgramPaths(home);
  await mkdir(p.dir, { recursive: true });

  // Ava.exe — Node, unchanged but for its name.
  if (await nodeVersionOf(p.command) !== UNREAL_NODE_VERSION) {
    const node = await src.node();
    const v = await nodeVersionOf(node);
    if (v !== UNREAL_NODE_VERSION) throw new Error(`The Node runtime found is ${v ?? 'unreadable'}, not ${UNREAL_NODE_VERSION}.`);
    const temp = `${p.command}.new`;
    await copyFile(node, temp);
    // A download's temp folder (downloadNodeRuntime) goes once it's copied.
    // (<temp>/ava-node-<time>/<zip folder>/node.exe)
    if (/[\\/]ava-node-\d+[\\/]/.test(node)) await rm(dirname(dirname(node)), { recursive: true, force: true }).catch(() => {});
    try {
      await rename(temp, p.command);
    } catch (e) {
      await rm(temp, { force: true });
      if ((e as NodeJS.ErrnoException).code === 'EBUSY' || (e as NodeJS.ErrnoException).code === 'EPERM') {
        throw new Error('Unreal is using Ava right now. Close Ava\'s chats in the Assistant panel (or Unreal), then try again.', { cause: e });
      }
      throw e;
    }
  }

  // Her program, this machine's keychain build, and the PDF files.
  await copyFile(join(src.programDir, 'ava-unreal.mjs'), p.program);
  const target = `win32-${process.arch}-msvc`;
  await copyDir(join(src.programDir, 'native'), join(p.dir, 'native'), (n) => n === `keyring.${target}.node` || n.startsWith('LICENSE'));
  if (src.dataDir && existsSync(src.dataDir)) await copyDir(src.dataDir, join(p.dir, 'data'));
  if (src.fontsDir && existsSync(src.fontsDir)) await copyDir(src.fontsDir, join(p.dir, 'fonts'));
  await writeFile(join(p.dir, 'version.json'), JSON.stringify({ program: await sha(p.program), node: UNREAL_NODE_VERSION } satisfies Stamp));
  return unrealProgramState(home);
}

/**
 * Node's official Windows zip from nodejs.org, checked against the pinned
 * SHA-256, unpacked with Windows' own tar (it reads zip). Returns node.exe's
 * path in a temp folder. For the extension, which ships no Node of its own.
 */
export async function downloadNodeRuntime(): Promise<string> {
  const z = NODE_ZIPS[process.arch];
  if (process.platform !== 'win32' || !z) throw new Error('Ava in Unreal\'s panel runs on Windows (x64 or Arm) for now.');
  const url = `https://nodejs.org/dist/v${UNREAL_NODE_VERSION}/${z.file}.zip`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't download Node from nodejs.org (${res.status}).`);
  const body = Buffer.from(await res.arrayBuffer());
  const got = createHash('sha256').update(body).digest('hex');
  if (got !== z.sha256) throw new Error('The Node download didn\'t match its published checksum, so it wasn\'t used.');
  const work = join(tmpdir(), `ava-node-${Date.now()}`);
  await mkdir(work, { recursive: true });
  const zip = join(work, `${z.file}.zip`);
  await writeFile(zip, body);
  // Windows' own tar (System32, bsdtar) reads zip; a `tar` found first on PATH
  // may be Git's GNU tar, which doesn't (seen 18 Nov). Relative paths and cwd:
  // a drive letter reads as a remote host to some tars.
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  try {
    await run(tar, ['-xf', `${z.file}.zip`, `${z.file}/node.exe`], { cwd: work, timeout: 120_000 });
  } catch {
    await rm(work, { recursive: true, force: true }).catch(() => {});
    throw new Error('Node downloaded, but Windows couldn\'t unpack it.');
  }
  await rm(zip, { force: true }).catch(() => {});
  return join(work, z.file, 'node.exe');
}
