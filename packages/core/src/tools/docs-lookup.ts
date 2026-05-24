import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { getPages } from '../docs/corpus.js';
import { SECTION_LABELS, SECTION_ORDER, type DocPage, type DocBlock, type Section } from '../docs/types.js';

/**
 * Searches Ava's own documentation. Reads the SAME canonical corpus the web,
 * extension, and IDE render (packages/core/src/docs/content) so the tool can
 * never drift from what users actually see — there is one source of truth.
 *
 * The previous implementation searched a parallel hand-maintained text file
 * (ava-docs.ts) that had gone stale (old tool counts, retired model names).
 * That file is gone; this tool flattens the structured DocPages to searchable
 * text at call time.
 */
export class DocsLookupTool implements Tool {
  readonly name = 'docs_lookup';
  readonly description = 'Search Ava\'s documentation to help users with features, setup, and troubleshooting';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'docs_lookup',
    description:
      'Search Ava\'s own documentation to answer user questions about features, setup, configuration, ' +
      'troubleshooting, models, tools, modes, permissions, memory, keyboard shortcuts, billing, and more. ' +
      'Use this when a user asks "how do I...", "what is...", "how does... work", or needs help with any ' +
      'Ava feature. Returns the relevant documentation section(s).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'What to search for. Can be a topic name (e.g. "models", "memory", "permissions") ' +
            'or a natural question (e.g. "how do I add an API key", "what models are available").',
        },
        topic: {
          type: 'string',
          enum: [...SECTION_ORDER],
          description:
            'Optional: return every page in a documentation section. One of: ' +
            SECTION_ORDER.join(', ') + '. If provided, the section\'s full content is returned.',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const query = (args.query as string)?.trim().toLowerCase();
    const topic = (args.topic as string)?.trim().toLowerCase();
    const pages = getPages();

    // Direct section lookup — return every page in that section.
    if (topic) {
      const inSection = pages.filter(p => p.section === topic);
      if (inSection.length > 0) {
        const heading = `# ${SECTION_LABELS[topic as Section] ?? topic}\n\n`;
        return { success: true, output: heading + inSection.map(p => this.pageToText(p)).join('\n\n---\n\n') };
      }
      return {
        success: false,
        output: `Section "${topic}" not found. Available sections: ${SECTION_ORDER.join(', ')}`,
      };
    }

    // No query and no topic — list the sections and their pages.
    if (!query) {
      const list = SECTION_ORDER.map(s => {
        const titles = pages.filter(p => p.section === s).map(p => p.title);
        return `- **${s}** (${SECTION_LABELS[s]}) — ${titles.join(', ')}`;
      }).join('\n');
      return {
        success: true,
        output: `# Available Documentation\n\n${list}\n\nUse \`topic\` for a whole section, or \`query\` to search across all docs.`,
      };
    }

    // Search: score each page by relevance.
    const scored = pages
      .map(page => ({ page, score: this.scorePage(page, query) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return {
        success: true,
        output: `No documentation found matching "${query}". Sections: ${SECTION_ORDER.join(', ')}`,
      };
    }

    const top = scored.slice(0, 3);
    // A clearly dominant match is returned on its own; otherwise the top few.
    if (top.length > 1 && top[0].score > top[1].score * 2) {
      return { success: true, output: this.pageToText(top[0].page) };
    }
    return { success: true, output: top.map(m => this.pageToText(m.page)).join('\n\n---\n\n') };
  }

  /** Flatten a DocPage's blocks into plain searchable/printable text. */
  private pageToText(page: DocPage): string {
    const lines: string[] = [`## ${page.title}`];
    for (const b of page.body) lines.push(this.blockToText(b));
    return lines.filter(Boolean).join('\n\n');
  }

  private blockToText(b: DocBlock): string {
    switch (b.type) {
      case 'paragraph': return b.text;
      case 'heading': return `${'#'.repeat(b.level)} ${b.text}`;
      case 'list': return b.items.map((i, n) => (b.ordered ? `${n + 1}. ${i}` : `- ${i}`)).join('\n');
      case 'code': return '```' + (b.language ?? '') + '\n' + b.text + '\n```';
      case 'callout': return `> ${b.variant.toUpperCase()}: ${b.text}`;
      case 'link': return `${b.text}: ${b.href}`;
      case 'table': return [b.headers.join(' | '), ...b.rows.map(r => r.join(' | '))].join('\n');
      case 'facts': return `(live ${b.kind} table — rendered in-app from current data)`;
      default: return '';
    }
  }

  /** Relevance score for a page against the query. Higher = better. */
  private scorePage(page: DocPage, query: string): number {
    let score = 0;
    const words = query.split(/\s+/).filter(w => w.length > 1);
    const title = page.title.toLowerCase();
    const id = page.id.toLowerCase();
    const body = this.pageToText(page).toLowerCase();

    if (id === query || page.section === query) score += 100;
    if (title === query) score += 60;
    if (title.includes(query)) score += 30;
    for (const w of words) {
      if (id.includes(w)) score += 10;
      if (title.includes(w)) score += 8;
      if (w.length > 2 && body.includes(w)) score += 2;
    }
    return score;
  }
}
