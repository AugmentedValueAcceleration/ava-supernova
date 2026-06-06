import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocumentAuthorTool } from '../src/tools/document-author.js';
import type { ToolExecutionContext } from '../src/tools/types.js';
import { getTemplate, listTemplates, fillTemplate } from '../src/tools/authoring/templates/index.js';

describe('template model + registry', () => {
  it('fills tokens and brackets unknowns (never TBD)', async () => {
    const tpl = await getTemplate('business/report');
    expect(tpl).toBeTruthy();
    const filled = fillTemplate(tpl!, { author: 'Sam' }, '2026-06-06');
    expect(filled).not.toContain('{{');
    expect(filled).toContain('Sam');
    expect(filled).toContain('2026-06-06');
    expect(filled).not.toContain('TBD');
  });

  it('resolves templates by full id, short id, and title', async () => {
    expect((await getTemplate('business/proposal'))?.id).toBe('business/proposal');
    expect((await getTemplate('proposal'))?.id).toBe('business/proposal');
    expect((await getTemplate('Academic essay'))?.id).toBe('academic/essay');
  });

  it('lists templates across domains', async () => {
    const all = await listTemplates();
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(new Set(all.map(t => t.domain))).toEqual(new Set(['business', 'editorial', 'academic', 'career']));
  });
});

describe('document_author templates', () => {
  let dir: string;
  let avaHome: string;
  let ctx: ToolExecutionContext;
  let prevHome: string | undefined;
  const tool = new DocumentAuthorTool();

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ava-tpl-'));
    avaHome = await mkdtemp(join(tmpdir(), 'ava-home-'));
    prevHome = process.env.AVA_HOME;
    process.env.AVA_HOME = avaHome;
    ctx = { cwd: dir, sharedState: {} } as unknown as ToolExecutionContext;
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.AVA_HOME;
    else process.env.AVA_HOME = prevHome;
  });

  it('from_template produces a finished draft with no leftover tokens', async () => {
    const r = await tool.execute({ action: 'from_template', template: 'proposal', file_path: 'p.md', data: { client: 'Acme', author: 'Sam', company: 'Foo', title: 'Acme Engagement' } }, ctx);
    expect(r.success).toBe(true);
    const md = await readFile(join(dir, 'p.md'), 'utf-8');
    expect(md).not.toContain('{{');
    expect(md).toContain('Acme');
    expect(md).toContain('title: Acme Engagement');
  });

  it('list_templates returns a catalogue', async () => {
    const r = await tool.execute({ action: 'list_templates' }, ctx);
    expect(r.success).toBe(true);
    expect(r.output).toContain('business/proposal');
    expect(r.output).toContain('BUSINESS');
  });

  it('save_template then from_template uses the saved template', async () => {
    const save = await tool.execute({
      action: 'save_template', name: 'custom/mine', title: 'Mine',
      content: '---\ntitle: {{title}}\nstyle: report\n---\n\n# Hello {{who}}\n',
    }, ctx);
    expect(save.success).toBe(true);

    const use = await tool.execute({ action: 'from_template', template: 'custom/mine', file_path: 'out.md', data: { title: 'T', who: 'World' } }, ctx);
    expect(use.success).toBe(true);
    const md = await readFile(join(dir, 'out.md'), 'utf-8');
    expect(md).toContain('Hello World');
    expect(md).toContain('title: T');
  });

  it('set_house_style injects brand into new documents', async () => {
    const set = await tool.execute({ action: 'set_house_style', brand: { headingColor: '#0F766E', font: 'Georgia' } }, ctx);
    expect(set.success).toBe(true);

    await tool.execute({ action: 'create', file_path: 'd.md', content: '---\ntitle: Doc\n---\n\n# H\n' }, ctx);
    const md = await readFile(join(dir, 'd.md'), 'utf-8');
    expect(md).toContain('brand:');
    expect(md).toContain('0F766E');
    expect(md).toContain('Georgia');
  });
});
