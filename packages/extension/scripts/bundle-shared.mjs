// What the extension bundle leaves out, and the files bundled libraries need
// beside them. Shared by esbuild.config.mjs and check-documents.mjs, so the
// check always tests exactly what ships.
//
// The document libraries (docx, exceljs, pdfkit, unpdf, mammoth, jszip)
// used to be EXTERNAL here while the VSIX shipped no node_modules — so on every
// marketplace install, Word, Excel and PDF files could not be made or read
// (found 14 Nov 2026; the dev host hid it, because the workspace has them).
// They are bundled now. Only things that genuinely cannot be bundled stay out.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const EXTERNAL = ['vscode', 'playwright', 'playwright-core', 'chromium-bidi', 'screenshot-desktop'];

/** pdfkit reads its built-in fonts (and colour profile) from `__dirname/data`.
 *  Bundled, `__dirname` is the bundle's folder, so the files go there. */
export function copyPdfkitData(outDir) {
  const coreRequire = createRequire(path.resolve('..', 'core', 'package.json'));
  const pdfkitEntry = coreRequire.resolve('pdfkit'); // .../pdfkit/js/pdfkit.js
  const src = path.join(path.dirname(pdfkitEntry), 'data');
  const dest = path.join(outDir, 'data');
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dest, f));
}
