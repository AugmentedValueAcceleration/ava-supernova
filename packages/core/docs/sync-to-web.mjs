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
// NOTE: i18n.ts + i18n/ MUST be here — the web docs page imports DOC_TRANSLATIONS from them.
// Omitting them while main() wipes WEB_ROOT first would delete the localized docs on every sync.
const COPY = ['types.ts', 'filter.ts', 'adapter.ts', 'corpus.ts', 'index.ts', 'i18n.ts', 'data', 'content', 'i18n'];

const GENERATED_HEADER =
  '// -----------------------------------------------------------------------------\n' +
  '// GENERATED FILE — do not edit directly.\n' +
  '// Source of truth: packages/core/src/docs/\n' +
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

  // Wipe only the entries this script OWNS, so a file removed from core does
  // not linger — but anything the web keeps here of its own survives.
  //
  // This used to rmSync the whole directory, which silently deleted
  // product-knowledge.ts: the TF-IDF search the companion chat route imports
  // to ground Ava's product answers. It lives here because it searches this
  // corpus, but it is web-only and has no counterpart in core, so every run of
  // the documented `pnpm docs:sync` broke the web build. It was found by the
  // build failing, not by the sync saying anything.
  for (const entry of COPY) {
    const target = join(WEB_ROOT, entry);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  }
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
