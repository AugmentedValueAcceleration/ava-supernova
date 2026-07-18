#!/usr/bin/env node
/**
 * i18n seeder — propagate NEW keys from the en baseline into every other
 * locale file, carrying the English value as a placeholder.
 *
 * Why this exists: `i18n:check` demands exact key parity (a key in en but
 * missing from any locale fails CI), and `i18n:translate` only translates
 * keys that ALREADY EXIST in a locale file with the English value (it does
 * in-place line replacement — it cannot insert). So the lifecycle for a new
 * batch of strings is:
 *
 *   1. add keys to en.ts (source of truth)
 *   2. `pnpm i18n:seed`        ← this script: copy them into all locales (English)
 *   3. `pnpm i18n:translate`   ← Qwen turns the seeded English into each language
 *   4. `pnpm i18n:check`       ← parity + no-English-leak verification
 *
 * Covers the same three surfaces as the check/translate scripts:
 *   core (packages/core/src/i18n/locales/*.ts),
 *   webview (packages/extension/webview-ui/src/locales/*.ts),
 *   nls (packages/extension/package.nls*.json).
 *
 * Idempotent: keys already present in a locale are left untouched. New keys
 * are appended just before the closing brace, preserving every other line.
 *
 * Flags:
 *   --surface=core|webview|nls   restrict to one surface
 *   --dry-run                    report what would be added, write nothing
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const DRY_RUN = !!args['dry-run'];
const SURFACE_FILTER = typeof args.surface === 'string' ? args.surface : null;

// ── Surface definitions (mirror of i18n-check / i18n-translate) ──────────────

const SURFACES = [
  {
    name: 'core',
    dir: path.join(repoRoot, 'packages/core/src/i18n/locales'),
    kind: 'ts',
    enFile: 'en.ts',
    listLocaleFiles() {
      return fs.readdirSync(this.dir).filter(f => f.endsWith('.ts') && f !== 'keep-english.ts' && f !== 'en.ts');
    },
  },
  {
    name: 'webview',
    dir: path.join(repoRoot, 'packages/extension/webview-ui/src/locales'),
    kind: 'ts',
    enFile: 'en.ts',
    listLocaleFiles() {
      return fs.readdirSync(this.dir).filter(f => f.endsWith('.ts') && f !== 'keep-english.ts' && f !== 'en.ts');
    },
  },
  {
    // Companion — registered 2026-07-18 alongside i18n-check. Its locales were
    // in full parity already (maintained by hand), but without the surface
    // registered here a NEW en key could never be seeded into them.
    name: 'companion',
    dir: path.join(repoRoot, 'packages/mobile/src/locales'),
    kind: 'ts',
    enFile: 'en.ts',
    listLocaleFiles() {
      return fs.readdirSync(this.dir).filter(f => f.endsWith('.ts') && f !== 'keep-english.ts' && f !== 'en.ts');
    },
  },
  {
    name: 'nls',
    dir: path.join(repoRoot, 'packages/extension'),
    kind: 'nls',
    enFile: 'package.nls.json',
    listLocaleFiles() {
      return fs.readdirSync(this.dir).filter(f => /^package\.nls\.[a-z-]+\.json$/i.test(f));
    },
  },
];

// ── Parsing ──────────────────────────────────────────────────────────────────

// Captures key + raw value (any of ' " ` quote styles), preserving order.
const tsPat = /^(\s*)(['"])([^'"]+)\2\s*:\s*(['"`])((?:\\[\s\S]|(?!\4)[\s\S])*)\4(,?)/gm;

/** Ordered list of { key, raw } for a TS locale file. */
function parseTsOrdered(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const out = [];
  for (const m of text.matchAll(tsPat)) out.push({ key: m[3], raw: m[5] });
  return out;
}

function tsKeySet(filePath) {
  return new Set(parseTsOrdered(filePath).map(e => e.key));
}

/** Escape a decoded string for a single-quoted TS literal. */
function escapeTs(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

/** Decode the raw captured value (handles \n, é, etc.) back to a string. */
function decodeRaw(raw) {
  try {
    // eslint-disable-next-line no-new-func
    return new Function('return "' + raw.replace(/"/g, '\\"') + '"')();
  } catch {
    return raw;
  }
}

// ── Per-surface processing ────────────────────────────────────────────────────

function processTsSurface(surface) {
  const enPath = path.join(surface.dir, surface.enFile);
  const enEntries = parseTsOrdered(enPath); // ordered { key, raw }
  let added = 0;

  for (const f of surface.listLocaleFiles()) {
    const filePath = path.join(surface.dir, f);
    const have = tsKeySet(filePath);
    const missing = enEntries.filter(e => !have.has(e.key));
    if (missing.length === 0) continue;

    const block = missing
      .map(e => `  '${e.key}': '${escapeTs(decodeRaw(e.raw))}',`)
      .join('\n');

    if (DRY_RUN) {
      console.log(`  [${surface.name}/${f}] +${missing.length} keys (dry-run)`);
      added += missing.length;
      continue;
    }

    const text = fs.readFileSync(filePath, 'utf8');
    // Insert just before the final closing brace of the object literal.
    const idx = text.lastIndexOf('};');
    if (idx === -1) {
      console.error(`  [${surface.name}/${f}] SKIPPED — no closing '};' found`);
      continue;
    }
    // Ensure the preceding content ends with a newline before our block.
    const before = text.slice(0, idx).replace(/\s*$/, '\n');
    const next = `${before}${block}\n${text.slice(idx)}`;
    fs.writeFileSync(filePath, next, 'utf8');
    console.log(`  [${surface.name}/${f}] +${missing.length} keys`);
    added += missing.length;
  }
  return added;
}

function processNlsSurface(surface) {
  const enPath = path.join(surface.dir, surface.enFile);
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  let added = 0;

  for (const f of surface.listLocaleFiles()) {
    const filePath = path.join(surface.dir, f);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const missing = Object.keys(en).filter(k => !(k in data));
    if (missing.length === 0) continue;

    if (DRY_RUN) {
      console.log(`  [${surface.name}/${f}] +${missing.length} keys (dry-run)`);
      added += missing.length;
      continue;
    }
    for (const k of missing) data[k] = en[k];
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`  [${surface.name}/${f}] +${missing.length} keys`);
    added += missing.length;
  }
  return added;
}

// ── Main ──────────────────────────────────────────────────────────────────────

let total = 0;
for (const surface of SURFACES) {
  if (SURFACE_FILTER && surface.name !== SURFACE_FILTER) continue;
  console.log(`\n=== Surface: ${surface.name} ===`);
  const n = surface.kind === 'nls' ? processNlsSurface(surface) : processTsSurface(surface);
  if (n === 0) console.log('  all locales already in parity.');
  total += n;
}

console.log(`\n${DRY_RUN ? '[dry-run] ' : ''}Done. Seeded ${total} key-slots across locales.`);
console.log(`Next: \`pnpm i18n:translate\` then \`pnpm i18n:check\`.`);
