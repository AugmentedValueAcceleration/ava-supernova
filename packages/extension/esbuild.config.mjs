import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
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

if (isWatch) {
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
  console.log('Extension built successfully.');
}
