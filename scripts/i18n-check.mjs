#!/usr/bin/env node
/**
 * i18n parity + quality check — runs in CI and locally.
 *
 * Covers three surfaces:
 *   1. packages/core/src/i18n/locales/*.ts          (CLI + IDE)
 *   2. packages/extension/webview-ui/src/locales/*.ts  (chat webview)
 *   3. packages/extension/package.nls*.json         (VSCode manifest)
 *
 * Fails (exit 1) on:
 *   - Missing keys in any non-en locale vs en baseline
 *   - Extra keys in any non-en locale not present in en
 *   - Non-en value identical to en value, key NOT in KEEP_ENGLISH
 *   - Placeholder mismatch: en uses {x} but locale value drops or changes it
 *
 * Warns (non-fatal) on: suspect-short values, empty strings.
 *
 * Run: `pnpm i18n:check`
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

// ── Surface definitions ─────────────────────────────────────────────────────

/**
 * @typedef {{
 *   name: string,
 *   dir: string,
 *   kind: 'ts' | 'nls',
 *   enFile: string,
 *   localeFiles: () => string[],
 *   localeCodeFromFile: (f: string) => string,
 *   keepEnglishFile?: string,
 * }} Surface
 */

/** @type {Surface[]} */
const SURFACES = [
  {
    name: 'core',
    dir: path.join(repoRoot, 'packages/core/src/i18n/locales'),
    kind: 'ts',
    enFile: 'en.ts',
    localeCodeFromFile: (f) => f.replace(/\.ts$/, ''),
    localeFiles() {
      return fs.readdirSync(this.dir).filter(f => f.endsWith('.ts'));
    },
    keepEnglishFile: path.join(repoRoot, 'packages/core/src/i18n/keep-english.ts'),
  },
  {
    name: 'webview',
    dir: path.join(repoRoot, 'packages/extension/webview-ui/src/locales'),
    kind: 'ts',
    enFile: 'en.ts',
    localeCodeFromFile: (f) => f.replace(/\.ts$/, ''),
    localeFiles() {
      return fs.readdirSync(this.dir).filter(f => f.endsWith('.ts') && f !== 'keep-english.ts');
    },
    keepEnglishFile: path.join(repoRoot, 'packages/extension/webview-ui/src/locales/keep-english.ts'),
  },
  {
    name: 'package.nls',
    dir: path.join(repoRoot, 'packages/extension'),
    kind: 'nls',
    enFile: 'package.nls.json',
    localeCodeFromFile: (f) => {
      const m = f.match(/^package\.nls(?:\.([a-z-]+))?\.json$/i);
      return m && m[1] ? m[1].toLowerCase() : 'en';
    },
    localeFiles() {
      return fs.readdirSync(this.dir).filter(f => /^package\.nls(\.[a-z-]+)?\.json$/i.test(f));
    },
    keepEnglishFile: path.join(repoRoot, 'packages/extension/package.nls.keep.ts'),
  },
];

// ── Parsers ─────────────────────────────────────────────────────────────────

const tsPat = /^\s*['"]([^'"]+)['"]\s*:\s*(['"`])((?:\\[\s\S]|(?!\2)[\s\S])*)\2/gm;

function parseTs(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  /** @type {Record<string,string>} */
  const map = {};
  for (const m of text.matchAll(tsPat)) {
    // Decode JS escape sequences in the captured string value
    try {
      // eslint-disable-next-line no-new-func
      map[m[1]] = new Function('return "' + m[3].replace(/"/g, '\\"') + '"')();
    } catch {
      map[m[1]] = m[3];
    }
  }
  return map;
}

function parseJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseKeepEnglish(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return new Set();
  const text = fs.readFileSync(filePath, 'utf8');
  const keys = new Set();
  // extract every quoted string inside the Set array literal
  const setMatch = text.match(/new Set<\s*StringKey\s*>\(\s*\[([\s\S]*?)\]/);
  if (!setMatch) return keys;
  for (const m of setMatch[1].matchAll(/['"]([^'"]+)['"]/g)) {
    keys.add(m[1]);
  }
  return keys;
}

// ── Checks ──────────────────────────────────────────────────────────────────

const placeholderPat = /\{(\w+)\}/g;
function placeholders(s) {
  if (typeof s !== 'string') return new Set();
  const set = new Set();
  for (const m of s.matchAll(placeholderPat)) set.add(m[1]);
  return set;
}

/**
 * @param {Surface} surface
 * @returns {{ errors: string[], warnings: string[] }}
 */
function auditSurface(surface) {
  const errors = [];
  const warnings = [];

  const enPath = path.join(surface.dir, surface.enFile);
  if (!fs.existsSync(enPath)) {
    errors.push(`[${surface.name}] en file missing: ${enPath}`);
    return { errors, warnings };
  }

  const parse = surface.kind === 'ts' ? parseTs : parseJson;
  const en = parse(enPath);
  const enKeys = new Set(Object.keys(en));
  const keepEnglish = parseKeepEnglish(surface.keepEnglishFile);

  for (const f of surface.localeFiles()) {
    if (f === surface.enFile) continue;
    const locale = surface.localeCodeFromFile(f);
    const filePath = path.join(surface.dir, f);
    const other = parse(filePath);
    const otherKeys = new Set(Object.keys(other));

    // Missing keys
    const missing = [...enKeys].filter(k => !otherKeys.has(k));
    for (const k of missing) {
      errors.push(`[${surface.name}/${locale}] MISSING: ${k}`);
    }

    // Extra keys
    const extra = [...otherKeys].filter(k => !enKeys.has(k));
    for (const k of extra) {
      errors.push(`[${surface.name}/${locale}] EXTRA (not in en): ${k}`);
    }

    for (const k of otherKeys) {
      if (!enKeys.has(k)) continue;
      const enVal = en[k];
      const otherVal = other[k];

      // Empty value
      if (typeof otherVal === 'string' && otherVal.trim() === '') {
        errors.push(`[${surface.name}/${locale}] EMPTY value for key: ${k}`);
        continue;
      }

      // English leak
      if (otherVal === enVal && !keepEnglish.has(k)) {
        errors.push(`[${surface.name}/${locale}] UNTRANSLATED: ${k} = ${String(enVal).slice(0, 80)}`);
      }

      // Placeholder parity
      const enPh = placeholders(enVal);
      const otherPh = placeholders(otherVal);
      for (const p of enPh) {
        if (!otherPh.has(p)) {
          errors.push(`[${surface.name}/${locale}] MISSING PLACEHOLDER {${p}} in key: ${k}`);
        }
      }
      for (const p of otherPh) {
        if (!enPh.has(p)) {
          warnings.push(`[${surface.name}/${locale}] EXTRA PLACEHOLDER {${p}} in key: ${k}`);
        }
      }
    }
  }

  return { errors, warnings };
}

// ── Main ────────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const summaryOnly = args.has('--summary');

let totalErrors = 0;
let totalWarnings = 0;
const perSurface = [];

for (const surface of SURFACES) {
  const { errors, warnings } = auditSurface(surface);
  totalErrors += errors.length;
  totalWarnings += warnings.length;
  perSurface.push({ surface, errors, warnings });
}

if (!summaryOnly) {
  for (const { surface, errors, warnings } of perSurface) {
    if (errors.length === 0 && warnings.length === 0) continue;
    console.log(`\n=== ${surface.name} ===`);
    for (const e of errors) console.log(`  ✗ ${e}`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }
}

console.log('\n=== i18n check summary ===');
for (const { surface, errors, warnings } of perSurface) {
  console.log(`  ${surface.name.padEnd(12)} errors=${errors.length.toString().padEnd(5)} warnings=${warnings.length}`);
}
console.log(`  ${'TOTAL'.padEnd(12)} errors=${totalErrors.toString().padEnd(5)} warnings=${totalWarnings}`);

if (totalErrors > 0) {
  console.log('\n❌ i18n check failed. Fix errors above or add keys to KEEP_ENGLISH if intentional.');
  process.exit(1);
}
console.log('\n✅ i18n check passed.');
process.exit(0);
