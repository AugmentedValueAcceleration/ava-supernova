/**
 * Ava.exe for Unreal's Assistant panel (plan 2026-11-18-unreal, Phase 2 step 2):
 * set up into a temp Ava home from a pretend app folder. Ava.exe is copied
 * from the Node running these tests — skipped when that isn't the pinned
 * version, as the installer refuses any other.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  setUnrealProgramSource, unrealProgramState, installUnrealProgram, UNREAL_NODE_VERSION,
} from '../src/mcp/unreal-install.js';

const windowsWithPinnedNode = process.platform === 'win32' && process.version === `v${UNREAL_NODE_VERSION}`;
let dir: string;
let home: string;
let app: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ava-unreal-install-'));
  home = join(dir, 'home', '.ava');
  app = join(dir, 'app');
  mkdirSync(join(app, 'unreal', 'native'), { recursive: true });
  mkdirSync(join(app, 'data'), { recursive: true });
  writeFileSync(join(app, 'unreal', 'ava-unreal.mjs'), 'console.log("ava one")');
  writeFileSync(join(app, 'unreal', 'native', `keyring.win32-${process.arch}-msvc.node`), 'this machine');
  writeFileSync(join(app, 'unreal', 'native', 'keyring.win32-other-msvc.node'), 'another machine');
  writeFileSync(join(app, 'unreal', 'native', 'LICENSE.third-party.md'), 'licences');
  writeFileSync(join(app, 'data', 'sRGB.icc'), 'pdf data');
  setUnrealProgramSource({ programDir: join(app, 'unreal'), dataDir: join(app, 'data'), node: async () => process.execPath });
});

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows may hold Ava.exe a moment */ }
});

describe('Ava.exe for the panel', () => {
  it('before setup: not installed, and says what Unreal will be given', async () => {
    const s = await unrealProgramState(home);
    expect(s.installed).toBe(false);
    expect(s.canInstall).toBe(true);
    expect(s.command).toBe(join(home, 'bin', 'Ava.exe'));
    expect(s.args).toEqual([join(home, 'bin', 'ava-unreal', 'ava-unreal.mjs')]);
  });

  it.runIf(windowsWithPinnedNode)('sets up Ava.exe, her program, and only this machine\'s keychain build', async () => {
    const s = await installUnrealProgram(home);
    expect(s.installed && s.current).toBe(true);
    expect(existsSync(join(home, 'bin', 'Ava.exe'))).toBe(true);
    expect(readdirSync(join(home, 'bin', 'ava-unreal', 'native')).sort()).toEqual(['LICENSE.third-party.md', `keyring.win32-${process.arch}-msvc.node`]);
    expect(existsSync(join(home, 'bin', 'ava-unreal', 'data', 'sRGB.icc'))).toBe(true);
  }, 60_000);

  it.runIf(windowsWithPinnedNode)('a newer program in the app shows as an update, and setting up again brings it current', async () => {
    await installUnrealProgram(home);
    writeFileSync(join(app, 'unreal', 'ava-unreal.mjs'), 'console.log("ava two")');
    expect((await unrealProgramState(home)).current).toBe(false);
    expect((await installUnrealProgram(home)).current).toBe(true);
  }, 60_000);

  it.runIf(windowsWithPinnedNode)('refuses a Node that isn\'t the pinned version', async () => {
    setUnrealProgramSource({ programDir: join(app, 'unreal'), node: async () => join(app, 'data', 'sRGB.icc') });
    await expect(installUnrealProgram(home)).rejects.toThrow(/not 24/);
  }, 60_000);
});
