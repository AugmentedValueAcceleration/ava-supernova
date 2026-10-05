/**
 * Emit core's UI strings as JSON into dist/locales/, one file per language.
 *
 * ── Why this exists ──
 *
 * The dashboard webview used to statically import all twenty of core's locale
 * files. That is 5.79MB of a 9.97MB bundle — 58% of it — and every user paid for
 * nineteen languages they do not read, parsed before anything painted. It was
 * the single largest cause of the dashboard taking seconds to open.
 *
 * The obvious fix, loading them on demand in the webview, cannot work: a nonce
 * CSP blocks dynamic imports and Vite's relative specifier resolves against the
 * wrong base. That is exactly the wall the chat webview hit, where it failed
 * silently and left nineteen languages showing English.
 *
 * So the host serves them instead. But the host cannot require them at runtime
 * either, because .vscodeignore ships only dist/ — there is no node_modules in
 * an installed extension. Hence this: at build time the strings are written as
 * plain JSON into dist/locales/, which DOES ship, and the host reads the single
 * file it needs with fs.
 *
 * Side effect worth having: a translation is now a data file rather than a
 * TypeScript module compiled into a bundle, so correcting one no longer means
 * rebuilding core, republishing it, and rebuilding the extension.
 *
 * Run as part of `pnpm build`, before the extension bundle.
 */

import { readdir, mkdir, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = path.resolve(__dirname, '..');
const CORE_LOCALES = path.resolve(EXT_ROOT, '../core/dist/i18n/locales');
const OUT_DIR = path.resolve(EXT_ROOT, 'dist/locales');

const require = createRequire(import.meta.url);

async function main() {
  let files;
  try {
    files = (await readdir(CORE_LOCALES)).filter((f) => f.endsWith('.js'));
  } catch (err) {
    // Core not built yet. Fail loudly: a silent skip here means the dashboard
    // ships with no translations at all and nothing says so until a user in
    // another language opens it.
    console.error(`[emit-locales] Cannot read ${CORE_LOCALES} — is core built?`);
    throw err;
  }

  if (files.length === 0) throw new Error(`[emit-locales] No locale files in ${CORE_LOCALES}`);

  await mkdir(OUT_DIR, { recursive: true });

  let total = 0;
  const written = [];

  for (const file of files) {
    const locale = path.basename(file, '.js');
    const mod = require(path.join(CORE_LOCALES, file));

    // Core exports them as `<locale>Strings`, with zh-CN becoming zhCNStrings.
    // Find it by shape rather than by reconstructing the name, so a naming
    // change here is a loud failure instead of a missing language.
    const exportName = Object.keys(mod).find((k) => k.endsWith('Strings'));
    if (!exportName) throw new Error(`[emit-locales] ${file} exports no *Strings member`);

    const strings = mod[exportName];
    const count = Object.keys(strings).length;
    if (count === 0) throw new Error(`[emit-locales] ${file} exported an empty object`);

    const out = path.join(OUT_DIR, `${locale}.json`);
    const json = JSON.stringify(strings);
    await writeFile(out, json, 'utf8');

    total += Buffer.byteLength(json);
    written.push({ locale, count, bytes: Buffer.byteLength(json) });
  }

  // Report it, because "the dashboard is slow" was invisible for months and the
  // number that mattered was never on screen during a build.
  const biggest = written.sort((a, b) => b.bytes - a.bytes)[0];
  console.log(
    `[emit-locales] ${written.length} locales -> dist/locales/ ` +
    `(${(total / 1048576).toFixed(2)}MB total, largest ${biggest.locale} at ` +
    `${(biggest.bytes / 1024).toFixed(0)}KB, ${biggest.count} keys). ` +
    `The dashboard now loads ONE of these instead of all of them.`,
  );

  // Sanity: English must exist, because it is every other locale's fallback.
  const en = path.join(OUT_DIR, 'en.json');
  const enRaw = await readFile(en, 'utf8').catch(() => null);
  if (!enRaw) throw new Error('[emit-locales] en.json missing — it is the fallback for every other language');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
