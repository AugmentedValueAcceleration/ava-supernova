/**
 * Presentation Tool — Generate slide decks from structured content.
 *
 * Creates markdown-based presentations that can be converted to PPTX.
 * Uses a structured slide format that's easy for the agent to generate.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class PresentationCreateTool implements Tool {
  readonly name = 'presentation_create';
  readonly description = 'Create a slide deck presentation. Generates a structured markdown file with slides.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'presentation_create',
    description: 'Create a slide deck presentation from structured content. Each slide has a title, optional bullets, and optional speaker notes. Output is a markdown file with slide separators.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Output file path (e.g. "docs/pitch-deck.md")',
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

    // Build markdown presentation (Marp / reveal.js compatible)
    const parts: string[] = [];

    // Title slide
    parts.push('---');
    parts.push('marp: true');
    parts.push('theme: default');
    parts.push('paginate: true');
    parts.push('---');
    parts.push('');
    parts.push(`# ${title}`);
    if (subtitle) parts.push(`\n*${subtitle}*`);
    parts.push('');

    // Content slides
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

    try {
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf-8');

      return {
        success: true,
        output: `Presentation created: ${absolutePath} (${slides.length} slides)`,
        metadata: {
          path: absolutePath,
          slideCount: slides.length,
          format: 'marp-markdown',
        },
      };
    } catch (err) {
      return { success: false, output: `Failed to write presentation: ${err}` };
    }
  }
}
