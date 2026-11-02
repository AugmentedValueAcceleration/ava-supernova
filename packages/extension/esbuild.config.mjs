import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, execSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production') || process.env.NODE_ENV === 'production';

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode', 'playwright', 'playwright-core', 'chromium-bidi', 'docx', 'exceljs', 'pdfkit', 'pdf-parse', 'mammoth', 'jszip', 'screenshot-desktop'],
  format: 'cjs',
  platform: 'node',
  sourcemap: !isProduction,
  minify: isProduction,
});

/**
 * The Design Studio's logo vectoriser (core/vendor/vectorizer) runs on the
 * user's machine as WebAssembly. Its loader is loaded at runtime, not bundled,
 * and the VSIX ships only dist/ with no node_modules — so it goes into
 * dist/vectorizer/ as a self-contained copy: the loader with its runtime
 * (@napi-rs/wasm-runtime) bundled in, beside the .wasm it reads via __dirname.
 * core's image-local looks there first when it is running inside a bundle.
 */
async function buildVectorizer() {
  const require = createRequire(import.meta.url);
  const vendor = path.join(path.dirname(require.resolve('@ava/core')), '..', 'vendor', 'vectorizer'); // from core/dist/
  const out = path.join('dist', 'vectorizer');
  fs.mkdirSync(out, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(vendor, 'vectorizer.wasi.cjs')],
    bundle: true, format: 'cjs', platform: 'node', minify: isProduction,
    outfile: path.join(out, 'vectorizer.cjs'), logLevel: 'warning',
  });
  // The worker serves only the async API, which core never calls (it is broken
  // in this build) — copied for completeness, not bundled.
  for (const f of ['vectorizer.wasm32-wasi.wasm', 'wasi-worker.mjs', 'LICENSE']) fs.copyFileSync(path.join(vendor, f), path.join(out, f));
}

/**
 * The OS keychain the extension shares with the IDE (src/secrets/shared-keychain.ts)
 * is reached through @napi-rs/keyring, a native module. The VSIX is one
 * package for every platform and ships no node_modules, so the native build
 * for EACH platform goes into dist/native/ and the right one is picked at
 * runtime. pnpm installs only this machine's build, so the others are fetched
 * with `npm pack` (which checks the registry's integrity hash) at the pinned
 * version, once — they are cached under node_modules/.cache after that.
 */
const KEYRING_VERSION = '2.1.2';
const KEYRING_TARGETS = ['win32-x64-msvc', 'win32-arm64-msvc', 'darwin-x64', 'darwin-arm64', 'linux-x64-gnu', 'linux-arm64-gnu', 'linux-x64-musl'];

function copyKeyringNative() {
  const cache = path.resolve('node_modules', '.cache', 'ava-keyring', KEYRING_VERSION);
  const out = path.join('dist', 'native');
  fs.mkdirSync(cache, { recursive: true });
  fs.mkdirSync(out, { recursive: true });
  for (const target of KEYRING_TARGETS) {
    const file = `keyring.${target}.node`;
    const cached = path.join(cache, file);
    if (!fs.existsSync(cached)) {
      const tgz = `napi-rs-keyring-${target}-${KEYRING_VERSION}.tgz`;
      // One string through the shell (npm is npm.cmd on Windows); every part is a constant above.
      execSync(`npm pack @napi-rs/keyring-${target}@${KEYRING_VERSION} --silent`, { cwd: cache, stdio: 'pipe' });
      // Relative paths and cwd: a drive letter reads as a remote host to some tars.
      execFileSync('tar', ['-xzf', tgz, `package/${file}`, 'package/LICENSE.third-party.md'], { cwd: cache, stdio: 'pipe' });
      fs.renameSync(path.join(cache, 'package', file), cached);
      fs.renameSync(path.join(cache, 'package', 'LICENSE.third-party.md'), path.join(cache, 'LICENSE.third-party.md'));
      fs.rmSync(path.join(cache, 'package'), { recursive: true, force: true });
      fs.rmSync(path.join(cache, tgz), { force: true });
    }
    // Skip a file already in place: a running VS Code holds the loaded .node
    // open, and copying over it fails with EBUSY mid-build.
    const dest = path.join(out, file);
    if (fs.existsSync(dest) && fs.readFileSync(dest).equals(fs.readFileSync(cached))) continue;
    fs.copyFileSync(cached, dest);
  }
  fs.copyFileSync(path.join(cache, 'LICENSE.third-party.md'), path.join(out, 'LICENSE.third-party.md'));
}

if (isWatch) {
  copyKeyringNative();
  await buildVectorizer();
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await ctx.rebuild();
  await ctx.dispose();

  // screenshot-desktop removed from extension bundle — native .bat/.exe files
  // were triggering Microsoft's malware scanner. Desktop automation lives in
  // the IDE only, not in the extension.

  await buildVectorizer();
  copyKeyringNative();
  console.log('Extension built successfully.');
}
