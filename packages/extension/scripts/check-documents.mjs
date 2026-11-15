// Can the SHIPPED extension make and read Word, Excel and PDF files?
//
// Bundles documents-smoke-entry.mjs with the same externals as the real
// build (scripts/bundle-shared.mjs), copies the same side files, and runs it
// from a temp folder with no node_modules above it — so a library that is
// external, missing or reading files it cannot find fails HERE, not on a
// user's machine. Added 14 Nov 2026 after the libraries were found missing
// from every marketplace install.
//
//   node scripts/check-documents.mjs

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';
import { EXTERNAL, copyPdfkitData } from './bundle-shared.mjs';

const dir = mkdtempSync(join(tmpdir(), 'ava-doc-smoke-'));
try {
  await esbuild.build({
    entryPoints: ['scripts/documents-smoke-entry.mjs'],
    bundle: true, format: 'cjs', platform: 'node', minify: true,
    external: EXTERNAL, outfile: join(dir, 'smoke.cjs'), logLevel: 'warning',
  });
  copyPdfkitData(dir);
  execFileSync(process.execPath, [join(dir, 'smoke.cjs')], { cwd: dir, stdio: 'inherit' });
} catch {
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
