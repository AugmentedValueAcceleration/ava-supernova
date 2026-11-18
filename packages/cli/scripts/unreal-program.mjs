// Ava in Unreal Editor's Assistant panel — packing the program (plan
// 2026-11-18-unreal, Phase 2 step 2). Called by the extension's build
// (esbuild.config.mjs) and the IDE's (scripts/bundle-sidecar.mjs), each with
// its own esbuild, so the CLI package needs no build tools of its own.
//
// What ships: <outDir>/ava-unreal.mjs (the program and @ava/core in one file,
// built like the IDE's sidecar) and <outDir>/native/keyring.<target>.node (the
// OS keychain, for his keys — the same pinned build the extension ships). The
// app copies these, its PDF data and fonts, and a Node runtime renamed Ava.exe
// into ~/.ava/bin when he sets it up (core mcp/unreal-install.ts).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The keychain's native build: the version and fetch the extension uses. */
const KEYRING_VERSION = '2.1.2';
/** Ava.exe is Windows (the panel shows the program's file name). */
const KEYRING_TARGETS = ['win32-x64-msvc', 'win32-arm64-msvc'];

export async function bundleUnrealProgram(build, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  await build({
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    // The keychain is loaded from native/ at run time (cli/src/shared.ts).
    external: ['node:*', '@napi-rs/keyring'],
    minify: true,
    // `require` for the CommonJS libraries inside, and a real __dirname for
    // the ones that read files beside themselves (pdfkit's data/) — as the
    // IDE's sidecar (ide/scripts/sidecar-shared.mjs).
    banner: {
      js: 'import{createRequire}from"node:module";import{fileURLToPath as __avaFileURLToPath}from"node:url";import{dirname as __avaDirname}from"node:path";const require=createRequire(import.meta.url);const __filename=__avaFileURLToPath(import.meta.url);const __dirname=__avaDirname(__filename);',
    },
    entryPoints: [path.join(cliRoot, 'src', 'acp', 'main.ts')],
    outfile: path.join(outDir, 'ava-unreal.mjs'),
    logLevel: 'warning',
  });
  copyKeyringNatives(path.join(outDir, 'native'));
}

/** Fetched once with `npm pack` (registry integrity hash), cached under node_modules/.cache. */
function copyKeyringNatives(out) {
  const cache = path.join(cliRoot, 'node_modules', '.cache', 'ava-keyring', KEYRING_VERSION);
  fs.mkdirSync(cache, { recursive: true });
  fs.mkdirSync(out, { recursive: true });
  for (const target of KEYRING_TARGETS) {
    const file = `keyring.${target}.node`;
    const cached = path.join(cache, file);
    if (!fs.existsSync(cached)) {
      const tgz = `napi-rs-keyring-${target}-${KEYRING_VERSION}.tgz`;
      execSync(`npm pack @napi-rs/keyring-${target}@${KEYRING_VERSION} --silent`, { cwd: cache, stdio: 'pipe' });
      execFileSync('tar', ['-xzf', tgz, `package/${file}`, 'package/LICENSE.third-party.md'], { cwd: cache, stdio: 'pipe' });
      fs.renameSync(path.join(cache, 'package', file), cached);
      fs.renameSync(path.join(cache, 'package', 'LICENSE.third-party.md'), path.join(cache, 'LICENSE.third-party.md'));
      fs.rmSync(path.join(cache, 'package'), { recursive: true, force: true });
      fs.rmSync(path.join(cache, tgz), { force: true });
    }
    const dest = path.join(out, file);
    if (fs.existsSync(dest) && fs.readFileSync(dest).equals(fs.readFileSync(cached))) continue;
    fs.copyFileSync(cached, dest);
  }
  fs.copyFileSync(path.join(cache, 'LICENSE.third-party.md'), path.join(out, 'LICENSE.third-party.md'));
}
