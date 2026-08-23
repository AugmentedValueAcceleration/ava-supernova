import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocumentAuthorTool } from '../src/tools/document-author.js';
import type { ToolExecutionContext } from '../src/tools/types.js';
import { listSections, findSection, formatOutline } from '../src/tools/authoring/sections.js';

const DOC = `# Title

## Alpha
Alpha body.

## Beta
Beta body.

## Gamma
Gamma body.
`;

describe('section addressing', () => {
  it('lists sections with levels', () => {
    const secs = listSections(DOC);
    expect(secs.map(s => s.title)).toEqual(['Title', 'Alpha', 'Beta', 'Gamma']);
    expect(secs[0].level).toBe(1);
    expect(secs[1].level).toBe(2);
  });

  it('ignores headings inside fenced code', () => {
    const md = '# Real\n\n```\n# not a heading\n```\n\n## Also Real\n';
    expect(listSections(md).map(s => s.title)).toEqual(['Real', 'Also Real']);
  });

  it('resolves a section by exact and loose match, flags ambiguity', () => {
    expect((findSection(DOC, 'Beta') as any).title).toBe('Beta');
    expect((findSection(DOC, 'bet') as any).title).toBe('Beta');
    expect(findSection(DOC, 'nope')).toBeNull();
    const dup = '## A\nx\n## A\ny\n';
    expect(findSection(dup, 'A')).toEqual({ ambiguous: true });
  });

  it('renders an indented outline', () => {
    expect(formatOutline(DOC)).toContain('# Title');
    expect(formatOutline(DOC)).toContain('  ## Alpha');
  });
});

describe('document_author tool', () => {
  let dir: string;
  let ctx: ToolExecutionContext;
  const tool = new DocumentAuthorTool();

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ava-author-'));
    ctx = { cwd: dir, sharedState: {} } as unknown as ToolExecutionContext;
  });

  it('creates a .md and reports an outline', async () => {
    const r = await tool.execute({ action: 'create', file_path: 'doc.md', content: DOC }, ctx);
    expect(r.success).toBe(true);
    expect(existsSync(join(dir, 'doc.md'))).toBe(true);
    expect(r.output).toContain('Alpha');
  });

  it('refuses to overwrite an existing file on create', async () => {
    await tool.execute({ action: 'create', file_path: 'doc.md', content: DOC }, ctx);
    const r = await tool.execute({ action: 'create', file_path: 'doc.md', content: 'x' }, ctx);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/already exists/i);
  });

  it('edits one section surgically, leaving the rest intact', async () => {
    await tool.execute({ action: 'create', file_path: 'doc.md', content: DOC }, ctx);
    const r = await tool.execute({ action: 'edit_section', file_path: 'doc.md', section: 'Beta', content: 'Updated beta.' }, ctx);
    expect(r.success).toBe(true);
    const md = await readFile(join(dir, 'doc.md'), 'utf-8');
    expect(md).toContain('Updated beta.');
    expect(md).not.toContain('Beta body.');
    expect(md).toContain('Alpha body.');   // untouched
    expect(md).toContain('Gamma body.');    // untouched
    expect(md).toContain('## Beta');         // heading preserved
  });

  it('errors helpfully when a section is not found', async () => {
    await tool.execute({ action: 'create', file_path: 'doc.md', content: DOC }, ctx);
    const r = await tool.execute({ action: 'edit_section', file_path: 'doc.md', section: 'Nope', content: 'x' }, ctx);
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/no section/i);
  });

  it('inserts a section after an anchor', async () => {
    await tool.execute({ action: 'create', file_path: 'doc.md', content: DOC }, ctx);
    const r = await tool.execute({ action: 'insert_section', file_path: 'doc.md', after: 'Alpha', content: '## Alpha2\nMore.' }, ctx);
    expect(r.success).toBe(true);
    const md = await readFile(join(dir, 'doc.md'), 'utf-8');
    expect(md.indexOf('Alpha2')).toBeGreaterThan(md.indexOf('Alpha body.'));
    expect(md.indexOf('Alpha2')).toBeLessThan(md.indexOf('## Beta'));
  });

  it('appends a section when no anchor is given', async () => {
    await tool.execute({ action: 'create', file_path: 'doc.md', content: DOC }, ctx);
    await tool.execute({ action: 'insert_section', file_path: 'doc.md', content: '## Appendix\nEnd.' }, ctx);
    const md = await readFile(join(dir, 'doc.md'), 'utf-8');
    expect(md.trimEnd().endsWith('End.')).toBe(true);
  });

  it('refuses to build without a format, rather than guessing two', async () => {
    // The bug this holds down: `build` defaulted to 'both' — docx AND pdf — so
    // one request for a document left three files on disk (source + two
    // exports) that nobody asked for. A format is a question about who the
    // copy is for, and the tool cannot know that.
    await tool.execute({ action: 'create', file_path: 'doc.md', content: DOC }, ctx);
    const r = await tool.execute({ action: 'build', file_path: 'doc.md' }, ctx);

    expect(r.success).toBe(false);
    expect(r.output).toMatch(/format/i);
    expect(existsSync(join(dir, 'doc.docx')), 'no docx written').toBe(false);
    expect(existsSync(join(dir, 'doc.pdf')), 'no pdf written').toBe(false);
    // The document itself is untouched — it is the source, not an export.
    expect(existsSync(join(dir, 'doc.md'))).toBe(true);
  });

  it('builds exactly the one format asked for', async () => {
    await tool.execute({ action: 'create', file_path: 'one.md', content: DOC }, ctx);
    const r = await tool.execute({ action: 'build', file_path: 'one.md', format: 'odt' }, ctx);
    expect(r.success).toBe(true);
    expect(existsSync(join(dir, 'one.odt'))).toBe(true);
    expect(existsSync(join(dir, 'one.docx')), 'nothing extra').toBe(false);
    expect(existsSync(join(dir, 'one.pdf')), 'nothing extra').toBe(false);
  });

  it('builds docx and pdf from the markdown source', async () => {
    await tool.execute({ action: 'create', file_path: 'doc.md', content: DOC }, ctx);
    const r = await tool.execute({ action: 'build', file_path: 'doc.md', format: 'both' }, ctx);
    expect(r.success).toBe(true);
    expect(existsSync(join(dir, 'doc.docx'))).toBe(true);
    expect(existsSync(join(dir, 'doc.pdf'))).toBe(true);
    const docx = await readFile(join(dir, 'doc.docx'));
    expect(docx.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});
