// Fetch the PDF fonts into packages/core/.fonts-cache (not in git), checking
// every file against its pinned size and SHA-256 (src/tools/authoring/
// font-manifest.ts). The extension and IDE builds call ensureFonts() and copy
// the bundled ones beside their bundles. A wrong file fails the build.
//
//   node scripts/fetch-fonts.mjs          bundled fonts
//   node scripts/fetch-fonts.mjs --all    bundled + the optional bold CJK pack

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const coreDir = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FONTS_CACHE = join(coreDir, '.fonts-cache');

const sha = (b) => createHash('sha256').update(b).digest('hex');

export async function ensureFonts({ all = false } = {}) {
  const { FONT_FILES } = await import(pathToFileURL(join(coreDir, 'dist', 'tools', 'authoring', 'font-manifest.js')).href);
  mkdirSync(FONTS_CACHE, { recursive: true });
  const wanted = FONT_FILES.filter((f) => all || f.bundled);
  for (const f of wanted) {
    const dest = join(FONTS_CACHE, f.file);
    if (existsSync(dest) && sha(readFileSync(dest)) === f.sha256) continue;
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`[fonts] ${f.file}: download failed (${res.status})`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length !== f.size || sha(bytes) !== f.sha256) throw new Error(`[fonts] ${f.file}: does not match its pinned checksum — refusing it`);
    writeFileSync(`${dest}.part`, bytes);
    renameSync(`${dest}.part`, dest);
    console.log(`[fonts] fetched ${f.file} (${(bytes.length / 1e6).toFixed(1)} MB)`);
  }
  return wanted.filter((f) => f.bundled).map((f) => ({ file: f.file, path: join(FONTS_CACHE, f.file) }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  ensureFonts({ all: process.argv.includes('--all') })
    .then((list) => console.log(`[fonts] ${list.length} bundled fonts ready in ${FONTS_CACHE}`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
