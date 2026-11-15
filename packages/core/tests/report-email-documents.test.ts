import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReportGenerateTool } from '../src/tools/report-generate.js';
import { EmailDraftTool } from '../src/tools/email-draft.js';
import { readDocxText, readPdfText } from '../src/tools/authoring/read-office.js';

// 15 Nov 2026: these two tools built Word files with their own code. Now they
// write through the one engine — same fonts, house style and tables — and a
// bare name lands in documents/.
describe('report_generate and email_draft on the one engine', () => {
  const setup = () => { const cwd = mkdtempSync(join(tmpdir(), 'ava-re-')); return { cwd, ctx: { cwd, sharedState: {} } as never }; };

  it('writes a report as Word, PDF or Markdown by the name, in documents/', async () => {
    const { cwd, ctx } = setup();
    const tool = new ReportGenerateTool();
    const custom = [{ heading: 'Highlights', content: 'Movement is **playable**. Ваш план on track.' }];
    for (const name of ['weekly.docx', 'weekly.pdf', 'weekly.md']) {
      const r = await tool.execute({ report_type: 'weekly-status', file_path: name, title: 'Weekly status', custom_sections: custom }, ctx);
      expect(r.success, r.output).toBe(true);
      expect(existsSync(join(cwd, 'documents', name)), name).toBe(true);
    }
    expect((await readDocxText(join(cwd, 'documents', 'weekly.docx'))).text).toContain('Movement is playable');
    expect((await readPdfText(readFileSync(join(cwd, 'documents', 'weekly.pdf')))).text).toContain('Weekly status');
    expect(readFileSync(join(cwd, 'documents', 'weekly.md'), 'utf8')).toContain('## Highlights');
  });

  it('returns an email as text, and saves it as a document when asked', async () => {
    const { cwd, ctx } = setup();
    const tool = new EmailDraftTool();
    let r = await tool.execute({ to: 'Sam', subject: 'The pitch', body: 'Thanks for the call.', sender_name: 'Stew' }, ctx);
    expect(r.success).toBe(true);
    expect(r.output).toContain('Subject: The pitch');
    r = await tool.execute({ to: 'Sam', subject: 'The pitch', body: 'Thanks for the call.', save_to: 'pitch-email.pdf' }, ctx);
    expect(r.success, r.output).toBe(true);
    expect((await readPdfText(readFileSync(join(cwd, 'documents', 'pitch-email.pdf')))).text).toContain('Thanks for the call.');
  });

  it('refuses a path outside the project', async () => {
    const { ctx } = setup();
    const r = await new ReportGenerateTool().execute({ report_type: 'custom', file_path: '../../outside.docx' }, ctx);
    expect(r.success).toBe(false);
  });
});
