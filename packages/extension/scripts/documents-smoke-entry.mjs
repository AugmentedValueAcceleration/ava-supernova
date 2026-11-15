// Run by check-documents.mjs AFTER bundling with the extension's own settings,
// from a folder with no node_modules anywhere above it — the way a marketplace
// install runs. Makes and reads every document type through the real tools.

import { mkdtempSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocumentAuthorTool } from '../../core/dist/tools/document-author.js';
import { DocumentManageTool } from '../../core/dist/tools/document-manage.js';

const cwd = mkdtempSync(join(tmpdir(), 'ava-doc-smoke-work-'));
const ctx = { cwd, sharedState: {} };
const author = new DocumentAuthorTool();
const manage = new DocumentManageTool();
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const size = (f) => (existsSync(f) ? statSync(f).size : 0);

async function main() {
  const md = '---\ntitle: Smoke test\n---\n\n# Smoke test\n\nSome **bold** text.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
  let r = await author.execute({ action: 'create', file_path: 'smoke.md', content: md }, ctx);
  check('markdown created', r.success, r.success ? '' : r.output);

  for (const format of ['docx', 'pdf', 'odt']) {
    r = await author.execute({ action: 'build', file_path: 'smoke.md', format }, ctx);
    const out = join(cwd, 'documents', `smoke.${format}`);
    check(`build ${format}`, r.success && size(out) > 500, r.success ? `${size(out)} bytes` : r.output);
  }

  r = await manage.execute({ action: 'create', file_path: 'sheet.xlsx', content: { sheets: [{ name: 'Costs', headers: ['Item', 'Cost'], rows: [['Rent', 900], ['Food', 250]] }] } }, ctx);
  check('spreadsheet xlsx', r.success && size(join(cwd, 'documents', 'sheet.xlsx')) > 500, r.output);

  r = await author.execute({ action: 'read', file_path: 'smoke.pdf' }, ctx);
  check('read pdf', r.success && r.output.includes('Smoke test'), r.success ? '' : r.output);
  r = await author.execute({ action: 'read', file_path: 'smoke.docx' }, ctx);
  check('read docx', r.success && r.output.includes('bold'), r.success ? '' : r.output);
  r = await manage.execute({ action: 'read', file_path: 'sheet.xlsx' }, ctx);
  check('read xlsx', r.success && r.output.includes('Rent'), r.success ? '' : r.output);

  const failed = results.filter((x) => !x).length;
  console.log(failed ? `\n${failed} document check(s) FAILED` : '\nAll document checks passed.');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.log('FAIL crashed —', e?.stack || e); process.exit(1); });

