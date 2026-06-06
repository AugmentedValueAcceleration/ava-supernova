import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { validatePath } from './security.js';
import { FileEditTool } from './file-edit.js';
import { parseMarkdown } from './authoring/md-parse.js';
import { renderDocument, type RenderTarget } from './authoring/index.js';
import { findSection, sectionText, headingLineText, formatOutline } from './authoring/sections.js';
import { getTemplate, listTemplates, fillTemplate, saveUserTemplate, saveHouseStyle, loadHouseStyle } from './authoring/templates/index.js';
import type { DocTemplate, TemplateDomain } from './authoring/templates/index.js';
import type { BrandTokens } from './authoring/doc-model.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Optional-peer loaders — graceful when the package isn't installed. */
async function loadDocx(): Promise<any> { return import('docx'); }
async function loadPdf(): Promise<any> {
  // @ts-ignore — pdfkit is an optional peer dependency (types may be absent)
  return import('pdfkit');
}

/**
 * Author prose documents with Markdown as the canonical, editable source.
 *
 * The `.md` is the document; `.docx`/`.pdf` are exports produced by `build`.
 * Editing is non-destructive and surgical — `edit_section` replaces exactly one
 * section by delegating to `file_edit` (same diff, audit, and rollback as any
 * code edit), so the rest of the document is never touched. This replaces the
 * old destructive `.docx` recreate-from-text path.
 */
export class DocumentAuthorTool implements Tool {
  readonly name = 'document_author';
  readonly description = 'Author and edit prose documents (Markdown source → branded Word/PDF). Non-destructive, section-surgical.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'document_author',
    description:
      'Author rich prose documents (reports, proposals, letters, articles…). Markdown is the editable source of truth; ' +
      'Word/PDF are exports built on demand. Workflow: create a .md, build it to .docx/.pdf, then refine it section by ' +
      'section with edit_section — edits are surgical and never destroy the rest of the document. ' +
      'Markdown supports YAML front-matter (title, author, date, style, toc, brand), :::callout / :::pagebreak directives, ' +
      'footnotes ([^1]), tables, images, and nested lists. Start from a worked-exemplar template with from_template ' +
      '(list them with list_templates). Save a great document as a reusable template with save_template, and pin a brand ' +
      'with set_house_style so every new document inherits it. Use document_manage for spreadsheets/CSV.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'from_template', 'list_templates', 'build', 'read', 'outline', 'edit_section', 'insert_section', 'save_template', 'set_house_style'],
          description: 'create · from_template · list_templates · build (docx/pdf) · read · outline · edit_section (surgical) · insert_section · save_template · set_house_style',
        },
        file_path: { type: 'string', description: 'Path to the document. For create/from_template/edit/outline use the .md source.' },
        content: { type: 'string', description: 'Markdown content. create: the whole document. edit_section: the new body of the section. insert_section: the new section. save_template: the template body.' },
        section: { type: 'string', description: 'edit_section: the heading text of the section to replace (e.g. "Pricing").' },
        after: { type: 'string', description: 'insert_section: heading text to insert after. Omit to append at the end.' },
        format: { type: 'string', enum: ['docx', 'pdf', 'both', 'md'], description: 'build: output format(s). Default both.' },
        out_path: { type: 'string', description: 'build: explicit output path (otherwise derived from the .md path).' },
        title: { type: 'string', description: 'create/save_template: document or template title.' },
        style: { type: 'string', description: 'Style profile — proposal | report | invoice | letter | meeting_notes | brief | article | press_release | essay | resume | cover_letter …' },
        template: { type: 'string', description: 'from_template: template id (e.g. "business/proposal" or "proposal").' },
        data: { type: 'object', description: 'from_template: values for the template\'s {{tokens}} (e.g. { client: "Acme", author: "Sam" }).' },
        name: { type: 'string', description: 'save_template: id/name for the template (e.g. "business/my-proposal").' },
        domain: { type: 'string', description: 'save_template: business | editorial | academic | career | custom.' },
        description: { type: 'string', description: 'save_template: one-line description of the template.' },
        tone: { type: 'string', description: 'save_template: tone/voice guide for the template.' },
        brand: { type: 'object', description: 'set_house_style: brand overrides — { font?, headingColor?, bodyColor?, subtitleColor? } (hex without #).' },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    switch (args.action) {
      case 'create': return this.create(args, context);
      case 'from_template': return this.fromTemplate(args, context);
      case 'list_templates': return this.listTemplates(args);
      case 'build': return this.build(args, context);
      case 'read': return this.read(args, context);
      case 'outline': return this.outline(args, context);
      case 'edit_section': return this.editSection(args, context);
      case 'insert_section': return this.insertSection(args, context);
      case 'save_template': return this.saveTemplate(args, context);
      case 'set_house_style': return this.setHouseStyle(args);
      default: return { success: false, output: `Unknown action: ${String(args.action)}` };
    }
  }

  // ── create ─────────────────────────────────────────────────────────────────

  private async create(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string | undefined;
    if (!filePath) return { success: false, output: 'Missing required field: file_path' };
    let abs: string;
    try { abs = validatePath(filePath, context.cwd); } catch (e) { return { success: false, output: (e as Error).message }; }
    if (existsSync(abs)) return { success: false, output: `File already exists: ${filePath}. Use edit_section/insert_section to change it, or build to export it.` };

    let content = (args.content as string | undefined) ?? '';
    content = this.ensureFrontMatter(content, args.title as string | undefined, args.style as string | undefined);
    content = this.injectBrand(content, await loadHouseStyle());

    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf-8');
    this.trackRead(context, abs);

    const outline = formatOutline(content);
    return {
      success: true,
      output: `Created ${abs}\n\nOutline:\n${outline}\n\nNext: refine with edit_section, then build to docx/pdf.`,
      metadata: { path: abs, fileMutation: this.mutation(abs, '', content, context.cwd) },
    };
  }

  // ── from_template ────────────────────────────────────────────────────────────

  private async fromTemplate(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string | undefined;
    const templateId = args.template as string | undefined;
    if (!filePath || !templateId) return { success: false, output: 'from_template requires file_path and template.' };

    const tpl = await getTemplate(templateId);
    if (!tpl) {
      const all = await listTemplates();
      return { success: false, output: `No template "${templateId}". Available:\n${all.map(t => `- ${t.id}`).join('\n')}` };
    }

    let abs: string;
    try { abs = validatePath(filePath, context.cwd); } catch (e) { return { success: false, output: (e as Error).message }; }
    if (existsSync(abs)) return { success: false, output: `File already exists: ${filePath}.` };

    const data = (args.data as Record<string, string> | undefined) ?? {};
    let content = fillTemplate(tpl, data, this.today());
    content = this.injectBrand(content, await loadHouseStyle());

    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf-8');
    this.trackRead(context, abs);

    const hints = [tpl.toneGuide && `Tone: ${tpl.toneGuide}`, tpl.lengthHint && `Length: ${tpl.lengthHint}`].filter(Boolean).join('\n');
    return {
      success: true,
      output: `Created ${abs} from ${tpl.id}\n\nOutline:\n${formatOutline(content)}\n\n${hints}\n\nFill the bracketed spots, refine with edit_section, then build.`,
      metadata: { path: abs, template: tpl.id, fileMutation: this.mutation(abs, '', content, context.cwd) },
    };
  }

  // ── list_templates ───────────────────────────────────────────────────────────

  private async listTemplates(args: Record<string, unknown>): Promise<ToolResult> {
    const domain = args.domain as string | undefined;
    const all = await listTemplates(domain);
    if (all.length === 0) return { success: true, output: domain ? `No templates in domain "${domain}".` : 'No templates.' };
    const byDomain = new Map<string, DocTemplate[]>();
    for (const t of all) { const list = byDomain.get(t.domain) ?? []; list.push(t); byDomain.set(t.domain, list); }
    const out: string[] = [];
    for (const [dom, list] of byDomain) {
      out.push(`\n${dom.toUpperCase()}`);
      for (const t of list) out.push(`  ${t.id} — ${t.description}${t.source === 'user' ? ' (yours)' : ''}`);
    }
    return { success: true, output: `Templates:${out.join('\n')}\n\nUse from_template with the id (e.g. "${all[0].id}").` };
  }

  // ── save_template ────────────────────────────────────────────────────────────

  private async saveTemplate(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const title = (args.title as string | undefined) ?? (args.name as string | undefined);
    if (!title) return { success: false, output: 'save_template requires a title (or name).' };

    let body = args.content as string | undefined;
    if (!body && args.file_path) {
      try {
        const abs = validatePath(args.file_path as string, context.cwd);
        if (!existsSync(abs)) return { success: false, output: `File not found: ${String(args.file_path)}` };
        body = await readFile(abs, 'utf-8');
      } catch (e) { return { success: false, output: (e as Error).message }; }
    }
    if (!body) return { success: false, output: 'save_template needs content or a file_path to capture as the template body.' };

    const domain = (this.normalizeDomain(args.domain as string | undefined));
    const name = (args.name as string | undefined) ?? title;
    const id = name.includes('/') ? name : `${domain}/${this.slug(name)}`;

    const tpl: DocTemplate = {
      id,
      domain,
      title,
      description: (args.description as string | undefined) ?? title,
      styleProfile: (args.style as string | undefined) ?? 'report',
      toneGuide: (args.tone as string | undefined) ?? '',
      body,
      source: 'user',
    };
    const path = await saveUserTemplate(tpl);
    return { success: true, output: `Saved template "${id}" → ${path}\n\nUse it with from_template "${id}".` };
  }

  // ── set_house_style ──────────────────────────────────────────────────────────

  private async setHouseStyle(args: Record<string, unknown>): Promise<ToolResult> {
    const raw = args.brand as Record<string, string> | undefined;
    if (!raw || typeof raw !== 'object') return { success: false, output: 'set_house_style requires brand: { font?, headingColor?, bodyColor?, subtitleColor? }.' };
    const brand: BrandTokens = {};
    if (raw.font) brand.font = raw.font;
    if (raw.headingColor) brand.headingColor = raw.headingColor.replace(/^#/, '');
    if (raw.bodyColor) brand.bodyColor = raw.bodyColor.replace(/^#/, '');
    if (raw.subtitleColor) brand.subtitleColor = raw.subtitleColor.replace(/^#/, '');
    if (Object.keys(brand).length === 0) return { success: false, output: 'No recognised brand fields. Use font / headingColor / bodyColor / subtitleColor.' };
    const path = await saveHouseStyle(brand);
    return { success: true, output: `House style saved → ${path}\nEvery new document will inherit it. Build an existing one to apply it.` };
  }

  // ── build ──────────────────────────────────────────────────────────────────

  private async build(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string | undefined;
    if (!filePath) return { success: false, output: 'Missing required field: file_path' };
    let abs: string;
    try { abs = validatePath(filePath, context.cwd); } catch (e) { return { success: false, output: (e as Error).message }; }
    if (!existsSync(abs)) return { success: false, output: `File not found: ${filePath}` };

    const source = await readFile(abs, 'utf-8');
    const model = parseMarkdown(source);
    const baseDir = dirname(abs);
    const format = (args.format as string | undefined) ?? 'both';
    const targets: RenderTarget[] = format === 'both' ? ['docx', 'pdf'] : [format as RenderTarget];

    const written: string[] = [];
    const failed: string[] = [];
    for (const target of targets) {
      const outPath = this.deriveOut(abs, target, args.out_path as string | undefined, targets.length > 1);
      try {
        const result = await renderDocument(model, target, {
          baseDir,
          loadDocx, loadPdf,
        });
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, result as Buffer | string);
        written.push(outPath);
      } catch (e) {
        failed.push(`${target}: ${(e as Error).message}`);
      }
    }

    if (written.length === 0) {
      return { success: false, output: `Build failed.\n${failed.join('\n')}` };
    }
    const note = failed.length ? `\n\nSkipped:\n${failed.join('\n')}` : '';
    return { success: true, output: `Built ${written.map(w => `→ ${w}`).join('\n')}${note}`, metadata: { written } };
  }

  // ── read ───────────────────────────────────────────────────────────────────

  private async read(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string | undefined;
    if (!filePath) return { success: false, output: 'Missing required field: file_path' };
    let abs: string;
    try { abs = validatePath(filePath, context.cwd); } catch (e) { return { success: false, output: (e as Error).message }; }
    if (!existsSync(abs)) return { success: false, output: `File not found: ${filePath}` };
    this.trackRead(context, abs);

    const ext = extname(abs).toLowerCase();
    if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
      const raw = await readFile(abs, 'utf-8');
      return { success: true, output: `${abs}\n\n${raw.slice(0, 6000)}${raw.length > 6000 ? '\n… truncated' : ''}` };
    }
    if (ext === '.docx') {
      try {
        // @ts-ignore — mammoth is an optional peer dependency
        const mammoth = await import('mammoth');
        const r = await (mammoth as any).extractRawText({ path: abs });
        return { success: true, output: `${abs}\n\n${r.value.slice(0, 6000)}${r.value.length > 6000 ? '\n… truncated' : ''}` };
      } catch { return { success: true, output: `${abs} (install mammoth to extract Word text: npm install mammoth)` }; }
    }
    if (ext === '.pdf') {
      try {
        // @ts-ignore — pdf-parse is an optional peer dependency
        const mod = await import('pdf-parse');
        const pdfParse = (mod as any).default || mod;
        const data = await pdfParse(await readFile(abs));
        return { success: true, output: `${abs} (${data.numpages} pages)\n\n${data.text.slice(0, 6000)}${data.text.length > 6000 ? '\n… truncated' : ''}` };
      } catch { return { success: true, output: `${abs} (install pdf-parse to extract PDF text: npm install pdf-parse)` }; }
    }
    const raw = await readFile(abs, 'utf-8');
    return { success: true, output: `${abs}\n\n${raw.slice(0, 6000)}` };
  }

  // ── outline ────────────────────────────────────────────────────────────────

  private async outline(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string | undefined;
    if (!filePath) return { success: false, output: 'Missing required field: file_path' };
    let abs: string;
    try { abs = validatePath(filePath, context.cwd); } catch (e) { return { success: false, output: (e as Error).message }; }
    if (!existsSync(abs)) return { success: false, output: `File not found: ${filePath}` };
    const md = await readFile(abs, 'utf-8');
    return { success: true, output: `Outline of ${abs}:\n\n${formatOutline(md)}` };
  }

  // ── edit_section (delegates to file_edit) ────────────────────────────────────

  private async editSection(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string | undefined;
    const section = args.section as string | undefined;
    const content = args.content as string | undefined;
    if (!filePath || !section) return { success: false, output: 'edit_section requires file_path and section.' };
    if (content == null) return { success: false, output: 'edit_section requires content (the new body for the section).' };

    let abs: string;
    try { abs = validatePath(filePath, context.cwd); } catch (e) { return { success: false, output: (e as Error).message }; }
    if (!existsSync(abs)) return { success: false, output: `File not found: ${filePath}` };

    const md = await readFile(abs, 'utf-8');
    const found = findSection(md, section);
    if (!found) return { success: false, output: `No section matching "${section}". Outline:\n${formatOutline(md)}` };
    if ('ambiguous' in found) return { success: false, output: `"${section}" matches more than one heading. Be more specific.\n${formatOutline(md)}` };

    const oldString = sectionText(md, found);
    const heading = headingLineText(md, found);
    const newString = `${heading}\n\n${content.trim()}\n`;

    // Surgical replace via file_edit → identical diff/audit/rollback semantics.
    return new FileEditTool().execute({ file_path: abs, old_string: oldString, new_string: newString }, context);
  }

  // ── insert_section ───────────────────────────────────────────────────────────

  private async insertSection(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string | undefined;
    const content = args.content as string | undefined;
    if (!filePath || !content) return { success: false, output: 'insert_section requires file_path and content (the new section).' };

    let abs: string;
    try { abs = validatePath(filePath, context.cwd); } catch (e) { return { success: false, output: (e as Error).message }; }
    if (!existsSync(abs)) return { success: false, output: `File not found: ${filePath}` };

    const md = await readFile(abs, 'utf-8');
    const after = args.after as string | undefined;

    if (after) {
      const found = findSection(md, after);
      if (!found) return { success: false, output: `No section matching "${after}". Outline:\n${formatOutline(md)}` };
      if ('ambiguous' in found) return { success: false, output: `"${after}" matches more than one heading. Be more specific.` };
      const oldString = sectionText(md, found);
      const newString = `${oldString.replace(/\s+$/, '')}\n\n${content.trim()}\n`;
      return new FileEditTool().execute({ file_path: abs, old_string: oldString, new_string: newString }, context);
    }

    // No anchor → append at end.
    const updated = `${md.replace(/\s+$/, '')}\n\n${content.trim()}\n`;
    await writeFile(abs, updated, 'utf-8');
    this.trackRead(context, abs);
    return { success: true, output: `Appended a section to ${abs}.`, metadata: { path: abs, fileMutation: this.mutation(abs, md, updated, context.cwd) } };
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  private ensureFrontMatter(content: string, title?: string, style?: string): string {
    if (content.trimStart().startsWith('---')) return content; // already has front-matter
    if (!title && !style) return content;
    const lines = ['---'];
    if (title) lines.push(`title: ${title}`);
    if (style) lines.push(`style: ${style}`);
    lines.push('---', '');
    return lines.join('\n') + (content ? '\n' + content : '');
  }

  /** Inject the saved house-style brand into a document's front-matter, unless
   *  it already declares its own brand. No front-matter → left untouched. */
  private injectBrand(content: string, brand?: BrandTokens): string {
    if (!brand || Object.keys(brand).length === 0) return content;
    const fm = /^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*\r?\n?)/.exec(content);
    if (!fm) return content;
    if (/^\s*brand:/m.test(fm[2])) return content;
    const pairs: string[] = [];
    if (brand.font) pairs.push(`font: ${brand.font}`);
    if (brand.headingColor) pairs.push(`headingColor: "${brand.headingColor}"`);
    if (brand.bodyColor) pairs.push(`bodyColor: "${brand.bodyColor}"`);
    if (brand.subtitleColor) pairs.push(`subtitleColor: "${brand.subtitleColor}"`);
    if (!pairs.length) return content;
    const line = `brand: { ${pairs.join(', ')} }`;
    return fm[1] + fm[2] + '\n' + line + fm[3] + content.slice(fm[0].length);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private slug(s: string): string {
    return s.trim().toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '') || 'template';
  }

  private normalizeDomain(d?: string): TemplateDomain {
    const v = (d ?? '').toLowerCase();
    return (['business', 'editorial', 'academic', 'career', 'custom'].includes(v) ? v : 'custom') as TemplateDomain;
  }

  private deriveOut(mdPath: string, target: RenderTarget, explicit: string | undefined, multi: boolean): string {
    if (explicit && !multi) return explicit;
    const ext = target === 'md' ? '.md' : `.${target}`;
    return mdPath.replace(/\.md$/i, '') + (target === 'md' ? '.normalized.md' : ext);
  }

  private trackRead(context: ToolExecutionContext, abs: string): void {
    try {
      const ss = context.sharedState as { readFiles?: Set<string> } | undefined;
      if (ss) { if (!ss.readFiles) ss.readFiles = new Set<string>(); ss.readFiles.add(abs); }
    } catch { /* non-fatal */ }
  }

  private mutation(path: string, before: string, after: string, cwd: string) {
    let gitSha: string | undefined;
    try {
      gitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || undefined;
    } catch { /* not a git repo */ }
    return {
      path, gitSha,
      bytesBefore: Buffer.byteLength(before, 'utf-8'),
      bytesAfter: Buffer.byteLength(after, 'utf-8'),
      sha256Before: createHash('sha256').update(before, 'utf-8').digest('hex'),
      sha256After: createHash('sha256').update(after, 'utf-8').digest('hex'),
    };
  }
}
