import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { getPages } from '../docs/corpus.js';
import { SECTION_LABELS, SECTION_ORDER, type DocPage, type DocBlock, type Section, type Capability } from '../docs/types.js';
import { commonSurfaces } from '../docs/data/capabilities.js';
import { searchDocs, type DocHit } from '../docs/product-knowledge.js';

// Friendly names for the surface-availability note, so Ava can say where a
// capability-gated feature actually works.
const SURFACE_NAME: Record<string, string> = {
  ext: 'the VS Code extension', ide: 'the desktop IDE', companion: 'the companion app',
  cli: 'the CLI', web: 'the website',
};

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
  readonly description = 'Search Ava\'s own documentation (her product knowledge) to answer questions about features, setup, and troubleshooting — returns focused, cited excerpts';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'docs_lookup',
    description:
      'Search Ava\'s own documentation to answer user questions about features, setup, configuration, ' +
      'troubleshooting, models, tools, modes, permissions, memory, keyboard shortcuts, billing, and more. ' +
      'Use this when a user asks "how do I...", "what is...", "how does... work", or needs help with any ' +
      'Ava feature. Returns focused, cited excerpts from the relevant pages — answer grounded in them and ' +
      'name the source page so the user can verify.',
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

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const query = (args.query as string)?.trim().toLowerCase();
    const topic = (args.topic as string)?.trim().toLowerCase();
    const surface = context.surface;
    const pages = getPages();

    // Direct section lookup — return every page in that section.
    if (topic) {
      const inSection = pages.filter(p => p.section === topic);
      if (inSection.length > 0) {
        const heading = `# ${SECTION_LABELS[topic as Section] ?? topic}\n\n`;
        return { success: true, output: heading + inSection.map(p => this.pageToText(p, surface)).join('\n\n---\n\n') };
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

    // Search: grounded, block-level TF-IDF retrieval with citations. Returns the
    // most relevant blocks (not whole pages), grouped by source page and
    // attributed, so Ava can answer grounded and say where it came from.
    const hits = searchDocs(query, 10);
    if (hits.length === 0) {
      return {
        success: true,
        output: `No documentation found matching "${query}". Sections: ${SECTION_ORDER.join(', ')}`,
      };
    }
    // Keep only clearly-relevant hits — drop the tangential tail below 35% of the
    // top score so the grounding stays focused.
    const floor = hits[0].score * 0.35;
    const relevant = hits.filter(h => h.score >= floor);
    return { success: true, output: this.renderHits(relevant, surface) };
  }

  /** A surface-availability footnote for capability-gated features, so Ava can
   *  say where a feature works and whether it's usable on the current surface. */
  private availabilityNote(page: DocPage, surface?: string): string {
    return this.availabilityNoteFor(page.requires, surface);
  }

  /** Availability footnote from a page's required capabilities — so Ava can say
   *  where a feature works and whether it's usable on the current surface. */
  private availabilityNoteFor(requires: Capability[] | undefined, surface?: string): string {
    if (!requires || requires.length === 0) return '';
    const surfaces = commonSurfaces(requires);
    if (surfaces.length === 0) return '';
    const names = surfaces.map(s => SURFACE_NAME[s] ?? s).join(', ');
    let note = `\n\n_Availability: this feature works in ${names}._`;
    if (surface && surface !== 'web' && !surfaces.includes(surface as never)) {
      note += ` _It is not available on your current surface (${SURFACE_NAME[surface] ?? surface})._`;
    }
    return note;
  }

  /** Render retrieved blocks grouped by their source page, each cited so Ava can
   *  attribute the answer. Focused evidence, not whole pages. */
  private renderHits(hits: DocHit[], surface?: string): string {
    const byPage = new Map<string, { title: string; section: Section; requires?: Capability[]; status?: DocHit['status']; blocks: string[] }>();
    for (const h of hits) {
      let g = byPage.get(h.pageId);
      if (!g) { g = { title: h.pageTitle, section: h.section, requires: h.requires, status: h.status, blocks: [] }; byPage.set(h.pageId, g); }
      if (!g.blocks.includes(h.text)) g.blocks.push(h.text);
    }
    const out: string[] = [];
    for (const g of byPage.values()) {
      const cite = `_Source: ${SECTION_LABELS[g.section]} → ${g.title}_`;
      out.push(`## ${g.title}\n\n${g.blocks.join('\n\n')}\n\n${cite}${this.statusNote(g.status)}${this.availabilityNoteFor(g.requires, surface)}`);
      if (out.length >= 5) break; // cap distinct source pages for a focused answer
    }
    return out.join('\n\n---\n\n');
  }

  /** Shipping-status note so Ava never presents an unshipped feature as usable
   *  right now. Shipped (the default) is silent — the prose already implies it. */
  private statusNote(status?: 'shipped' | 'preview' | 'planned'): string {
    if (status === 'preview') return '\n\n_Status: in preview — limited/gated rollout, not yet generally available._';
    if (status === 'planned') return '\n\n_Status: on the roadmap — not shipped yet._';
    return '';
  }

  /** Flatten a DocPage's blocks into plain searchable/printable text. Includes
   *  the optional `deeper` ("Show me the details") layer — that's where the
   *  technical depth now lives, so it must be searchable and returnable too. */
  private pageToText(page: DocPage, surface?: string): string {
    const lines: string[] = [`## ${page.title}`];
    for (const b of page.body) lines.push(this.blockToText(b));
    if (page.deeper && page.deeper.length > 0) {
      lines.push('### Details');
      for (const b of page.deeper) lines.push(this.blockToText(b));
    }
    return lines.filter(Boolean).join('\n\n') + this.availabilityNote(page, surface);
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
}
