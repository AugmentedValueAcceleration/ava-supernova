#!/usr/bin/env npx tsx
/**
 * i18n Coverage Verification Script
 *
 * Checks that all locale files have the same keys as English (source of truth)
 * across three i18n surfaces:
 *   1. Core locales      — packages/core/src/i18n/locales/*.ts
 *   2. Webview locales   — packages/extension/webview-ui/src/locales/*.ts
 *   3. package.nls files — packages/extension/package.nls*.json
 *
 * Usage: npx tsx scripts/verify-i18n.ts
 * Exit code 0 = all good, 1 = issues found.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = typeof import.meta.dirname === 'string'
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let hasErrors = false;

function error(msg: string): void {
  console.error(`  ❌ ${msg}`);
  hasErrors = true;
}

function ok(msg: string): void {
  console.log(`  ✅ ${msg}`);
}

// ── Helper: extract keys from a Record<string, string> export ─────────────

function getExportedKeys(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const keys: string[] = [];
  // Match 'key.name': or "key.name":
  const regex = /['"]([a-zA-Z0-9_.]+)['"]\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    // Skip lines that are comments
    const lineStart = content.lastIndexOf('\n', match.index) + 1;
    const linePrefix = content.slice(lineStart, match.index).trim();
    if (linePrefix.startsWith('//') || linePrefix.startsWith('*')) continue;
    keys.push(match[1]);
  }
  return keys;
}

// ── Helper: compare locale keys against English ───────────────────────────

function compareKeys(
  surface: string,
  enKeys: string[],
  localeKeys: string[],
  localeName: string,
): void {
  const enSet = new Set(enKeys);
  const localeSet = new Set(localeKeys);

  const missing = enKeys.filter(k => !localeSet.has(k));
  const extra = localeKeys.filter(k => !enSet.has(k));

  if (missing.length > 0) {
    error(`[${surface}] ${localeName}: ${missing.length} missing key(s): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`);
  }
  if (extra.length > 0) {
    error(`[${surface}] ${localeName}: ${extra.length} extra key(s): ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? '...' : ''}`);
  }
  if (missing.length === 0 && extra.length === 0) {
    ok(`[${surface}] ${localeName}: ${localeKeys.length} keys — matches English`);
  }
}

// ── 1. Core locales ───────────────────────────────────────────────────────

console.log('\n📦 Core locales (packages/core/src/i18n/locales/):\n');

const coreLocaleDir = join(ROOT, 'packages/core/src/i18n/locales');
const coreFiles = readdirSync(coreLocaleDir).filter(f => f.endsWith('.ts'));
const coreEnKeys = getExportedKeys(join(coreLocaleDir, 'en.ts'));
console.log(`  Reference: en.ts has ${coreEnKeys.length} keys\n`);

for (const file of coreFiles) {
  if (file === 'en.ts') continue;
  const locale = basename(file, '.ts');
  const keys = getExportedKeys(join(coreLocaleDir, file));
  compareKeys('core', coreEnKeys, keys, locale);
}

// ── 2. Webview locales ────────────────────────────────────────────────────

console.log('\n🖥️  Webview locales (packages/extension/webview-ui/src/locales/):\n');

const webviewLocaleDir = join(ROOT, 'packages/extension/webview-ui/src/locales');
const webviewFiles = readdirSync(webviewLocaleDir).filter(f => f.endsWith('.ts'));
const webviewEnKeys = getExportedKeys(join(webviewLocaleDir, 'en.ts'));
console.log(`  Reference: en.ts has ${webviewEnKeys.length} keys\n`);

for (const file of webviewFiles) {
  if (file === 'en.ts') continue;
  const locale = basename(file, '.ts');
  const keys = getExportedKeys(join(webviewLocaleDir, file));
  compareKeys('webview', webviewEnKeys, keys, locale);
}

// ── 3. package.nls files ──────────────────────────────────────────────────

console.log('\n📋 package.nls files (packages/extension/):\n');

const nlsDir = join(ROOT, 'packages/extension');
const nlsBase = JSON.parse(readFileSync(join(nlsDir, 'package.nls.json'), 'utf-8'));
const nlsBaseKeys = Object.keys(nlsBase);
console.log(`  Reference: package.nls.json has ${nlsBaseKeys.length} keys\n`);

const nlsFiles = readdirSync(nlsDir).filter(f => f.startsWith('package.nls.') && f.endsWith('.json') && f !== 'package.nls.json');

for (const file of nlsFiles) {
  const locale = file.replace('package.nls.', '').replace('.json', '');
  const nlsContent = JSON.parse(readFileSync(join(nlsDir, file), 'utf-8'));
  const nlsKeys = Object.keys(nlsContent);
  compareKeys('nls', nlsBaseKeys, nlsKeys, locale);

  // Check for empty values
  const emptyKeys = nlsKeys.filter(k => typeof nlsContent[k] === 'string' && nlsContent[k].trim() === '');
  if (emptyKeys.length > 0) {
    error(`[nls] ${locale}: ${emptyKeys.length} empty value(s): ${emptyKeys.slice(0, 5).join(', ')}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(60));
if (hasErrors) {
  console.error('\n⚠️  Issues found. See above for details.\n');
  process.exit(1);
} else {
  console.log('\n✅ All i18n surfaces have full key coverage.\n');
  process.exit(0);
}
