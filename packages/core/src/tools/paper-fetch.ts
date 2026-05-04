import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { fetchPaper } from '../papers/paper-fetcher.js';
import { arxivPdfUrl } from '../papers/arxiv-client.js';
import { logger } from '../core/logger.js';

/**
 * paper_fetch_full_text — read-only paper fetcher used by the Tutor
 * (and any other persona/mode) when the abstract isn't enough to give
 * a real explanation.
 *
 * For arXiv preprints we fetch the rendered HTML version when available
 * (`https://arxiv.org/html/{id}`) and structure-extract section
 * headings + paragraph text. arXiv's HTML coverage is ~70% of recent
 * preprints; falls back to abstract-only for older ones or papers
 * without HTML rendering.
 *
 * For non-arXiv papers we return abstract + open-access PDF URL when
 * known. Full PDF parsing isn't done in 1.0 — adding pdf-parse to the
 * core dependency tree would blow up the bundle and PDFs vary too
 * much for reliable text extraction without per-publisher logic. The
 * Tutor can still cite sections from the abstract and run a web_search
 * on specific claims for verification.
 *
 * Read-only, safe risk level, no confirmation required. Network-only
 * tool — never touches the filesystem or runs commands.
 */

const ARXIV_HTML_BASE = 'https://arxiv.org/html';
const MAX_HTML_BYTES = 2 * 1024 * 1024;       // 2MB cap on the HTML fetch
const MAX_OUTPUT_CHARS = 25_000;              // ~6k tokens — fits comfortably in any context
const SECTION_PARA_LIMIT = 4;                  // First N paragraphs per section to extract

interface ExtractedSection {
  heading: string;
  paragraphs: string[];
}

/**
 * Strip HTML tags + collapse whitespace. Targeted at arXiv's clean
 * LaTeX-to-HTML output, not arbitrary web pages — so we don't need
 * a full DOM parser to get usable text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull section headings and the first few paragraphs under each from
 * arXiv's HTML output. arXiv's structure is consistent: `<h2>` /
 * `<h3>` for section titles, `<p>` for body. We grab everything
 * between successive headings, dropping math-block markers and
 * citations the abstract layer can't show anyway.
 */
function extractArxivSections(html: string): ExtractedSection[] {
  const sections: ExtractedSection[] = [];
  // Slice on h2/h3 boundaries — keeps the heading attached to its body.
  const headingRe = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const matches = [...html.matchAll(headingRe)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const heading = stripHtml(m[2]).trim();
    if (!heading || heading.length > 200) continue;
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : html.length;
    const body = html.slice(start, end);
    const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(p => stripHtml(p[1]))
      .filter(t => t.length > 40)
      .slice(0, SECTION_PARA_LIMIT);
    if (paras.length > 0) {
      sections.push({ heading, paragraphs: paras });
    }
  }
  return sections;
}

async function fetchArxivHtml(arxivId: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`${ARXIV_HTML_BASE}/${arxivId}`, { signal });
    if (!res.ok) return null;
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return text.length > MAX_HTML_BYTES ? text.slice(0, MAX_HTML_BYTES) : text;
    }
    let total = 0;
    const chunks: Uint8Array[] = [];
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    const decoder = new TextDecoder();
    return chunks.map(c => decoder.decode(c)).join('');
  } catch (err) {
    logger.debug(`[paper_fetch] arxiv html fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function formatPaperBlock(args: {
  title: string;
  authors: string[];
  year?: number;
  abstract?: string;
  primary_url?: string;
  oa_pdf_url?: string;
  retracted?: boolean;
  citation_count?: number;
  discipline?: string;
  sections?: ExtractedSection[];
  fullTextNote?: string;
}): string {
  const lines: string[] = [];
  lines.push(`# ${args.title}`);
  if (args.authors.length > 0) {
    const authorLine = args.authors.length > 6
      ? `${args.authors.slice(0, 6).join(', ')}, et al.`
      : args.authors.join(', ');
    lines.push(`**Authors:** ${authorLine}`);
  }
  if (args.year) lines.push(`**Year:** ${args.year}`);
  if (args.discipline) lines.push(`**Discipline:** ${args.discipline}`);
  if (args.citation_count != null) lines.push(`**Citations:** ${args.citation_count}`);
  if (args.retracted) lines.push(`**⚠ RETRACTED.** This paper has been withdrawn — discuss findings with that flag visible to the learner.`);
  if (args.primary_url) lines.push(`**Primary URL:** ${args.primary_url}`);
  if (args.oa_pdf_url && args.oa_pdf_url !== args.primary_url) lines.push(`**Open-access PDF:** ${args.oa_pdf_url}`);
  lines.push('');
  if (args.abstract) {
    lines.push('## Abstract');
    lines.push(args.abstract);
    lines.push('');
  }
  if (args.sections && args.sections.length > 0) {
    lines.push('## Body (extracted sections)');
    for (const s of args.sections) {
      lines.push(`### ${s.heading}`);
      for (const p of s.paragraphs) lines.push(p);
      lines.push('');
    }
  }
  if (args.fullTextNote) {
    lines.push(`_${args.fullTextNote}_`);
  }
  let out = lines.join('\n');
  if (out.length > MAX_OUTPUT_CHARS) {
    out = out.slice(0, MAX_OUTPUT_CHARS) + '\n\n[…truncated; fetch the PDF directly for the full body.]';
  }
  return out;
}

export class PaperFetchFullTextTool implements Tool {
  readonly name = 'paper_fetch_full_text';
  readonly description = 'Fetch the title, authors, abstract, and (when available) section-extracted body of a scientific paper from arXiv, OpenAlex, or Crossref. Use when explaining a paper to a learner needs more depth than the abstract.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'paper_fetch_full_text',
    description:
      'Fetch a scientific paper by identifier and return structured content for explanation. ' +
      'Accepts arXiv IDs (e.g. "2310.06825"), DOIs ("10.1038/nature12373" or "doi:10.1038/nature12373"), ' +
      'OpenAlex IDs ("W2741809807"), or any of the corresponding URLs. Returns title, authors, year, ' +
      'abstract, citation count, discipline, and — for arXiv preprints with HTML rendering available — ' +
      'extracted section headings with the first paragraphs under each. ' +
      'Read-only, no confirmation needed. Use this in Teach mode after the user picks a paper to "Read with Ava", ' +
      'or in any mode when the user pastes a paper identifier and asks for an explanation. ' +
      'If the paper is retracted upstream marks it — surface that to the learner before discussing findings.',
    parameters: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'arXiv ID, DOI, OpenAlex ID, or any corresponding URL (arxiv.org/abs/..., doi.org/..., openalex.org/...).',
        },
      },
      required: ['identifier'],
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const identifier = (args.identifier as string)?.trim();
    if (!identifier) {
      return { success: false, output: 'identifier is required (arXiv ID, DOI, OpenAlex ID, or URL).' };
    }

    const signal = AbortSignal.timeout(12_000);
    const paper = await fetchPaper({ identifier }, signal);
    if (!paper) {
      return {
        success: false,
        output: `No paper found for identifier "${identifier}". Verify the ID/DOI/URL is correct and the paper is publicly indexed.`,
      };
    }

    let sections: ExtractedSection[] | undefined;
    let fullTextNote: string | undefined;
    if (paper.arxiv_id) {
      const html = await fetchArxivHtml(paper.arxiv_id, signal);
      if (html) {
        sections = extractArxivSections(html);
        if (sections.length === 0) {
          fullTextNote = `arXiv HTML was available but no extractable sections were found. PDF: ${arxivPdfUrl(paper.arxiv_id)}`;
        }
      } else {
        fullTextNote = `arXiv has no rendered HTML for this paper — explanation will work from the abstract. Full PDF: ${arxivPdfUrl(paper.arxiv_id)}`;
      }
    } else if (!paper.abstract) {
      fullTextNote = `Full text not directly available; recommend the learner open the primary URL for the full paper.`;
    } else {
      fullTextNote = `Full text not fetched (paper not on arXiv). Working from abstract. Primary URL: ${paper.primary_url ?? 'unknown'}`;
    }

    const output = formatPaperBlock({
      title: paper.title,
      authors: paper.authors.map(a => a.name),
      year: paper.year,
      abstract: paper.abstract,
      primary_url: paper.primary_url,
      oa_pdf_url: paper.oa_pdf_url,
      retracted: paper.retracted,
      citation_count: paper.citation_count,
      discipline: paper.discipline,
      sections,
      fullTextNote,
    });

    return {
      success: true,
      output,
      metadata: {
        arxiv_id: paper.arxiv_id,
        doi: paper.doi,
        openalex_id: paper.openalex_id,
        year: paper.year,
        retracted: paper.retracted ?? false,
        sections_count: sections?.length ?? 0,
      },
    };
  }
}
