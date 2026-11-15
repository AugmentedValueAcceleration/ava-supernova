import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { splitByScript, cjkFaceFor, isMostlyRtl } from '../src/tools/authoring/pdf-fonts.js';
import { DocumentAuthorTool } from '../src/tools/document-author.js';
import { readPdfText } from '../src/tools/authoring/read-office.js';

// 15 Nov 2026: PDFs were garbled in 11 of Ava's 20 languages. Noto fonts,
// chosen per script, write every one of them.
describe('choosing a font by script', () => {
  it('splits text into runs of one script, keeping spaces and punctuation with their run', () => {
    expect(splitByScript('Plan: 你本周的计划, done')).toEqual([
      { script: 'latin', text: 'Plan: ' }, { script: 'cjk', text: '你本周的计划, ' }, { script: 'latin', text: 'done' },
    ]);
    expect(splitByScript('Привет мир').map((r) => r.script)).toEqual(['latin']); // Cyrillic is in Noto Sans
    expect(splitByScript('१२ इस सप्ताह').map((r) => r.script)).toEqual(['devanagari']);
  });

  it('picks Chinese, Japanese or Korean letterforms from the text', () => {
    expect(cjkFaceFor('今週のあなたの計画')).toBe('jp');
    expect(cjkFaceFor('이번 주 계획')).toBe('kr');
    expect(cjkFaceFor('你本周的计划')).toBe('sc');
    expect(cjkFaceFor('你本週的計劃', 'zh-TW')).toBe('tc');
  });

  it('knows an Arabic paragraph reads from the right', () => {
    expect(isMostlyRtl('خطتك لهذا الأسبوع')).toBe(true);
    expect(isMostlyRtl('Your plan, خطتك')).toBe(false);
  });
});

const cache = join(__dirname, '..', '.fonts-cache', 'NotoSans-Regular.ttf');
describe.skipIf(!existsSync(cache))('a PDF in every script (needs `node scripts/fetch-fonts.mjs`)', () => {
  it('writes and reads back Latin accents, Cyrillic, Arabic, Hindi, Thai, Chinese, Japanese and Korean', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ava-fonts-'));
    const ctx = { cwd, sharedState: {} } as never;
    const tool = new DocumentAuthorTool();
    const lines = [
      'Polish: Zażółć gęślą jaźń', 'Turkish: ğüşıöç', 'Vietnamese: Kế hoạch của bạn', 'Russian: Ваш план на неделю', 'Ukrainian: ї є ґ',
      'Hindi: इस सप्ताह', 'Chinese: 你本周的计划', 'Japanese: 今週の計画', 'Korean: 이번 주 계획', 'Thai: แผนของคุณ',
    ];
    await tool.execute({ action: 'create', file_path: 'langs.md', content: `# Languages\n\n${lines.join('\n\n')}\n\n| Day | День |\n|---|---|\n| Monday | Понедельник |\n` }, ctx);
    const r = await tool.execute({ action: 'build', file_path: 'langs.md', format: 'pdf' }, ctx);
    expect(r.success, r.output).toBe(true);
    const { text } = await readPdfText(readFileSync(join(cwd, 'documents', 'langs.pdf')));
    for (const l of ['Zażółć gęślą jaźń', 'ğüşıöç', 'Kế hoạch của bạn', 'Ваш план на неделю', 'ї є ґ', '你本周的计划', '今週の計画', '이번 주 계획', 'Понедельник']) {
      expect(text, l).toContain(l);
    }
  });
});
