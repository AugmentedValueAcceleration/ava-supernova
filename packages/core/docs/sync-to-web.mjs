#!/usr/bin/env node
// Sync the canonical docs corpus from packages/core/docs/ into the web submodule.
// Run: pnpm docs:sync (from repo root) or node packages/core/docs/sync-to-web.mjs
//
// The web submodule deploys independently (its own repo, Vercel from its own remote),
// so it cannot workspace-link to @ava/core at Vercel build time. This script fixes that
// by copying the corpus into the submodule's source tree. Extension and IDE do NOT need
// syncing — they import @ava/core directly via the workspace.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SRC_ROOT = join(__dirname, '..', 'src', 'docs');
const WEB_ROOT = join(__dirname, '..', '..', 'web', 'src', 'lib', 'docs');

// Files/folders to copy. Everything else in the docs/ dir (outline, sync script itself) stays put.
const COPY = ['types.ts', 'filter.ts', 'adapter.ts', 'corpus.ts', 'index.ts', 'data', 'content'];

const GENERATED_HEADER =
  '// -----------------------------------------------------------------------------\n' +
  '// GENERATED FILE — do not edit directly.\n' +
  '// Source of truth: packages/core/docs/\n' +
  '// Run  pnpm docs:sync  from the repo root to regenerate.\n' +
  '// -----------------------------------------------------------------------------\n\n';

// Strip `.js` extensions from relative imports. Core uses nodenext module resolution which
// requires them; Next.js webpack does not support them for .ts files. The web-side TS compiler
// uses bundler resolution so omitted extensions work fine there.
function rewriteImports(code) {
  return code
    .replace(/from '(\.\.?\/[^']+)\.js'/g, (_, p) => `from '${p}'`)
    .replace(/from "(\.\.?\/[^"]+)\.js"/g, (_, p) => `from "${p}"`);
}

function walk(src, dst) {
  const s = statSync(src);
  if (s.isDirectory()) {
    mkdirSync(dst, { recursive: true });
    for (const entry of readdirSync(src)) {
      walk(join(src, entry), join(dst, entry));
    }
    return;
  }
  if (!src.endsWith('.ts')) return;
  const body = readFileSync(src, 'utf8');
  writeFileSync(dst, GENERATED_HEADER + rewriteImports(body), 'utf8');
}

function main() {
  if (!existsSync(join(__dirname, '..', '..', 'web'))) {
    console.error('Web submodule not found at packages/web. Initialise the submodule first.');
    process.exit(1);
  }

  // Wipe and recreate the target so removed files do not linger.
  if (existsSync(WEB_ROOT)) rmSync(WEB_ROOT, { recursive: true, force: true });
  mkdirSync(WEB_ROOT, { recursive: true });

  for (const entry of COPY) {
    const src = join(SRC_ROOT, entry);
    const dst = join(WEB_ROOT, entry);
    if (!existsSync(src)) {
      console.error(`Missing source: ${relative(SRC_ROOT, src)}`);
      process.exit(1);
    }
    walk(src, dst);
  }

  console.log(`Synced ${COPY.length} entries to ${relative(process.cwd(), WEB_ROOT)}`);
}

main();
