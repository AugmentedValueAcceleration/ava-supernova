/**
 * Presentation Tool — Generate slide decks as native .pptx files.
 *
 * Uses pptxgenjs to create real PowerPoint files with Ava's brand styling.
 * Falls back to markdown if pptxgenjs is not installed.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class PresentationCreateTool implements Tool {
  readonly name = 'presentation_create';
  readonly description = 'Create a slide deck presentation. Generates a .pptx PowerPoint file with branded slides.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'presentation_create',
    description: 'Create a slide deck presentation from structured content. Each slide has a title, optional bullets, and optional speaker notes. Output is a .pptx PowerPoint file.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Output file path. Save to documents/ folder for Library access (e.g. "documents/pitch-deck.pptx")',
        },
        title: {
          type: 'string',
          description: 'Presentation title (shown on title slide)',
        },
        subtitle: {
          type: 'string',
          description: 'Subtitle or author line',
        },
        slides: {
          type: 'array',
          description: 'Array of slide objects',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Slide title' },
              bullets: {
                type: 'array',
                items: { type: 'string' },
                description: 'Bullet points for this slide',
              },
              notes: { type: 'string', description: 'Speaker notes (not shown on slide)' },
              layout: {
                type: 'string',
                enum: ['title', 'bullets', 'two-column', 'image', 'quote', 'blank'],
                description: 'Slide layout (default: bullets)',
              },
            },
            required: ['title'],
          },
        },
        template: {
          type: 'string',
          enum: ['pitch-deck', 'project-update', 'sprint-review', 'board-brief', 'custom'],
          description: 'Presentation template (default: custom)',
        },
      },
      required: ['file_path', 'title', 'slides'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string;
    const title = args.title as string;
    const subtitle = args.subtitle as string | undefined;
    const slides = args.slides as Array<{
      title: string;
      bullets?: string[];
      notes?: string;
      layout?: string;
    }>;

    if (!filePath || !title || !slides || slides.length === 0) {
      return { success: false, output: 'file_path, title, and at least one slide are required.' };
    }

    const absolutePath = filePath.startsWith('/') || filePath.includes(':')
      ? filePath
      : join(context.cwd, filePath);

    // Try native .pptx generation
    try {
      const PptxGenJS = (await import('pptxgenjs')).default;
      return await this.generatePptx(PptxGenJS, absolutePath, title, subtitle, slides);
    } catch {
      // pptxgenjs not available — fall back to markdown
      return await this.generateMarkdownFallback(absolutePath, title, subtitle, slides);
    }
  }

  private async generatePptx(
    PptxGenJS: any,
    absolutePath: string,
    title: string,
    subtitle: string | undefined,
    slides: Array<{ title: string; bullets?: string[]; notes?: string; layout?: string }>,
  ): Promise<ToolResult> {
    // Brand colours
    const BG = '0f0f23';
    const TITLE_COLOR = 'a855f7';
    const BODY_COLOR = 'ffffff';
    const ACCENT = '7c3aed';

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'Ava | Supernova';

    // Title slide
    const titleSlide = pptx.addSlide();
    titleSlide.background = { color: BG };
    titleSlide.addText(title, {
      x: 0.5,
      y: 1.5,
      w: '90%',
      h: 1.5,
      fontSize: 36,
      fontFace: 'Arial',
      color: TITLE_COLOR,
      bold: true,
      align: 'center',
    });
    if (subtitle) {
      titleSlide.addText(subtitle, {
        x: 0.5,
        y: 3.2,
        w: '90%',
        h: 0.8,
        fontSize: 18,
        fontFace: 'Arial',
        color: BODY_COLOR,
        align: 'center',
      });
    }
    // Accent bar
    titleSlide.addShape(pptx.ShapeType ? pptx.ShapeType.rect : 'rect', {
      x: 3.5,
      y: 4.2,
      w: 6,
      h: 0.05,
      fill: { color: ACCENT },
    });

    // Content slides
    for (const slide of slides) {
      const s = pptx.addSlide();
      s.background = { color: BG };

      // Slide title
      s.addText(slide.title, {
        x: 0.5,
        y: 0.3,
        w: '90%',
        h: 0.8,
        fontSize: 28,
        fontFace: 'Arial',
        color: TITLE_COLOR,
        bold: true,
      });

      // Accent underline
      s.addShape(pptx.ShapeType ? pptx.ShapeType.rect : 'rect', {
        x: 0.5,
        y: 1.1,
        w: 4,
        h: 0.03,
        fill: { color: ACCENT },
      });

      // Bullet points
      if (slide.bullets && slide.bullets.length > 0) {
        const bulletRows = slide.bullets.map(b => ({
          text: b,
          options: {
            fontSize: 16,
            fontFace: 'Arial',
            color: BODY_COLOR,
            bullet: { code: '2022', color: ACCENT },
            breakLine: true,
            paraSpaceAfter: 8,
          },
        }));

        s.addText(bulletRows, {
          x: 0.7,
          y: 1.4,
          w: '85%',
          h: 4.5,
          valign: 'top',
        });
      }

      // Speaker notes
      if (slide.notes) {
        s.addNotes(slide.notes);
      }
    }

    // Ensure output path ends with .pptx
    let outputPath = absolutePath;
    if (!outputPath.toLowerCase().endsWith('.pptx')) {
      outputPath = outputPath.replace(/\.[^.]+$/, '.pptx');
      if (!outputPath.toLowerCase().endsWith('.pptx')) {
        outputPath += '.pptx';
      }
    }

    try {
      await mkdir(dirname(outputPath), { recursive: true });
      const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
      await writeFile(outputPath, buffer);

      return {
        success: true,
        output: `Presentation created: ${outputPath} (${slides.length} slides, native .pptx)`,
        metadata: {
          path: outputPath,
          slideCount: slides.length,
          format: 'pptx',
        },
      };
    } catch (err) {
      return { success: false, output: `Failed to write presentation: ${err}` };
    }
  }

  private async generateMarkdownFallback(
    absolutePath: string,
    title: string,
    subtitle: string | undefined,
    slides: Array<{ title: string; bullets?: string[]; notes?: string; layout?: string }>,
  ): Promise<ToolResult> {
    // Markdown fallback (Marp / reveal.js compatible)
    const parts: string[] = [];

    parts.push('---');
    parts.push('marp: true');
    parts.push('theme: default');
    parts.push('paginate: true');
    parts.push('---');
    parts.push('');
    parts.push(`# ${title}`);
    if (subtitle) parts.push(`\n*${subtitle}*`);
    parts.push('');

    for (const slide of slides) {
      parts.push('---');
      parts.push('');
      parts.push(`## ${slide.title}`);
      parts.push('');

      if (slide.bullets && slide.bullets.length > 0) {
        for (const bullet of slide.bullets) {
          parts.push(`- ${bullet}`);
        }
        parts.push('');
      }

      if (slide.notes) {
        parts.push('<!--');
        parts.push(`Speaker notes: ${slide.notes}`);
        parts.push('-->');
        parts.push('');
      }
    }

    const content = parts.join('\n');

    // Keep original path for markdown fallback
    let outputPath = absolutePath;
    if (outputPath.toLowerCase().endsWith('.pptx')) {
      outputPath = outputPath.replace(/\.pptx$/i, '.md');
    }

    try {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, content, 'utf-8');

      return {
        success: true,
        output: `Presentation created as markdown (pptxgenjs not available — install with: pnpm add pptxgenjs): ${outputPath} (${slides.length} slides)`,
        metadata: {
          path: outputPath,
          slideCount: slides.length,
          format: 'marp-markdown',
          fallback: true,
        },
      };
    } catch (err) {
      return { success: false, output: `Failed to write presentation: ${err}` };
    }
  }
}
