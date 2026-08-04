#!/usr/bin/env node
/**
 * docs:sync — copy the canonical documentation corpus from core into the web
 * app's local mirror.
 *
 * The extension and IDE import @ava/core/docs directly. The website deploys
 * standalone (separate repo, its own build) and cannot import the workspace
 * package, so it keeps a generated mirror under src/lib/docs/. This script is
 * the missing piece that keeps that mirror in lock-step with core — run it
 * whenever the docs in packages/core/src/docs change.
 *
 * Transform applied: core uses ESM `.js` import specifiers (NodeNext); the web
 * uses bundler resolution (extensionless), so relative `.js` specifiers are
 * stripped. A "generated, do not edit" banner is prepended to every file.
 *
 *   pnpm docs:sync
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = path.join(repoRoot, 'packages/core/src/docs');
// Standalone-deploy surfaces that can't import the workspace package each keep a
// generated mirror under src/lib/docs/. Add a target here to keep it in step.
const DSTS = [
  path.join(repoRoot, 'packages/web/src/lib/docs'),
  path.join(repoRoot, 'packages/web/src/companion/lib/docs'),
];

const BANNER = [
  '// -----------------------------------------------------------------------------',
  '// GENERATED FILE — do not edit directly.',
  '// Source of truth: packages/core/src/docs/',
  '// Run  pnpm docs:sync  from the repo root to regenerate.',
  '// -----------------------------------------------------------------------------',
  '', '',
].join('\n');

/** Strip `.js` from relative import/export specifiers for bundler resolution. */
function transform(code) {
  return code.replace(/(from\s+['"])(\.\.?\/[^'"]*)\.js(['"])/g, '$1$2$3');
}

/** Recursively list .ts files under a dir, relative to it. */
function listTs(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listTs(full, base));
    else if (e.name.endsWith('.ts')) out.push(path.relative(base, full));
  }
  return out;
}

const files = listTs(SRC);

// Remove mirror files that no longer exist in core (e.g. retired ava-docs.ts).
function prune(dir, base = dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { prune(full, base); continue; }
    if (!e.name.endsWith('.ts')) continue;
    const rel = path.relative(base, full);
    if (!fs.existsSync(path.join(SRC, rel))) { fs.rmSync(full); console.log('  pruned stale', rel); }
  }
}

for (const DST of DSTS) {
  let written = 0;
  for (const rel of files) {
    const code = fs.readFileSync(path.join(SRC, rel), 'utf8');
    const out = BANNER + transform(code);
    const dstPath = path.join(DST, rel);
    fs.mkdirSync(path.dirname(dstPath), { recursive: true });
    fs.writeFileSync(dstPath, out, 'utf8');
    written++;
  }
  prune(DST);
  console.log(`docs:sync — wrote ${written} files → ${path.relative(repoRoot, DST)}`);
}
