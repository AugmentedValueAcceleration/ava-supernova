import type { Paper, PaperAuthor } from './types.js';
import { arxivCategoryToDiscipline } from './discipline.js';
import { logger } from '../core/logger.js';

/**
 * arXiv API client. Free, no auth, returns Atom XML.
 *
 * Two operations:
 *   - `fetchPaperByArxivId(id)` — single paper detail
 *   - `searchArxiv(query, opts)` — search by title / abstract / category
 *
 * The full PDF body is at `https://arxiv.org/pdf/{id}.pdf` — no API
 * call needed; the URL is deterministic. Used by the
 * `paper_fetch_full_text` tool when the Tutor needs the body.
 *
 * Courtesy: arXiv asks for ≥3s between bulk requests. For interactive
 * use (single paper fetches) that's not needed; this client doesn't
 * impose a delay because callers don't loop on it. Cron jobs that
 * crawl many papers should add their own throttling.
 */

const ARXIV_API_BASE = 'http://export.arxiv.org/api/query';

interface ArxivAtomEntry {
  id: string;        // 'http://arxiv.org/abs/2310.12345v1'
  title: string;
  summary: string;
  authors: string[];
  published: string; // ISO date
  primaryCategory: string;
  pdfUrl?: string;
}

/**
 * Lift an arXiv ID out of the entry's `<id>` URL. The URL is always
 * `http://arxiv.org/abs/<id>v<version>`; we strip the version because
 * downstream callers want the canonical version-less ID for matching.
 */
function arxivIdFromEntryId(entryId: string): string {
  const m = entryId.match(/abs\/([^v]+)(?:v\d+)?$/);
  return m ? m[1] : entryId;
}

/**
 * Tiny Atom XML parser scoped to arXiv's response shape. arXiv guarantees
 * a stable Atom feed so we don't need a full XML parser; targeted regex
 * extraction is reliable here and avoids pulling in xml2js / fast-xml-parser
 * just for two operations.
 */
function parseArxivAtom(xml: string): ArxivAtomEntry[] {
  const entries: ArxivAtomEntry[] = [];
  const entryBlocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  for (const block of entryBlocks) {
    const id = (block.match(/<id>([^<]+)<\/id>/)?.[1] ?? '').trim();
    const title = (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').replace(/\s+/g, ' ').trim();
    const summary = (block.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? '').replace(/\s+/g, ' ').trim();
    const published = (block.match(/<published>([^<]+)<\/published>/)?.[1] ?? '').trim();
    const primaryCategory = (block.match(/<arxiv:primary_category[^/]*term="([^"]+)"/)?.[1]
      ?? block.match(/<category[^/]*term="([^"]+)"/)?.[1]
      ?? '').trim();
    const authors = [...block.matchAll(/<author>\s*<name>([^<]+)<\/name>/g)].map(m => m[1].trim());
    const pdfMatch = block.match(/<link[^>]*type="application\/pdf"[^>]*href="([^"]+)"/);
    entries.push({
      id,
      title,
      summary,
      authors,
      published,
      primaryCategory,
      pdfUrl: pdfMatch?.[1],
    });
  }
  return entries;
}

function entryToPaper(entry: ArxivAtomEntry): Paper {
  const arxiv_id = arxivIdFromEntryId(entry.id);
  const authors: PaperAuthor[] = entry.authors.map(name => ({ name }));
  const year = entry.published ? new Date(entry.published).getFullYear() : undefined;
  return {
    arxiv_id,
    title: entry.title,
    authors,
    abstract: entry.summary,
    year,
    primary_url: `https://arxiv.org/abs/${arxiv_id}`,
    oa_pdf_url: entry.pdfUrl ?? `https://arxiv.org/pdf/${arxiv_id}.pdf`,
    arxiv_category: entry.primaryCategory || undefined,
    discipline: entry.primaryCategory ? arxivCategoryToDiscipline(entry.primaryCategory) : undefined,
    source: 'arxiv',
  };
}

export async function fetchPaperByArxivId(arxivId: string, signal?: AbortSignal): Promise<Paper | null> {
  const url = `${ARXIV_API_BASE}?id_list=${encodeURIComponent(arxivId)}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      logger.warn(`[arxiv] fetch failed ${res.status} for ${arxivId}`);
      return null;
    }
    const xml = await res.text();
    const entries = parseArxivAtom(xml);
    if (entries.length === 0) return null;
    return entryToPaper(entries[0]);
  } catch (err) {
    logger.warn(`[arxiv] fetch error for ${arxivId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export interface ArxivSearchOptions {
  /** Free-text query searching title + abstract. */
  q: string;
  /** arXiv category filter (e.g. 'cs.AI', 'q-bio'). Optional. */
  category?: string;
  /** Sort order. arXiv's only useful ones are these two. */
  sortBy?: 'relevance' | 'submittedDate';
  perPage?: number;
  page?: number;
}

export async function searchArxiv(opts: ArxivSearchOptions, signal?: AbortSignal): Promise<Paper[]> {
  const perPage = Math.min(opts.perPage ?? 20, 50);
  const page = Math.max(opts.page ?? 0, 0);
  const start = page * perPage;

  const queryParts = [`all:${opts.q}`];
  if (opts.category) queryParts.push(`cat:${opts.category}`);
  const search_query = queryParts.join('+AND+');

  const sortBy = opts.sortBy ?? 'relevance';
  const sortOrder = 'descending';

  const url = `${ARXIV_API_BASE}?search_query=${encodeURIComponent(search_query)}&start=${start}&max_results=${perPage}&sortBy=${sortBy}&sortOrder=${sortOrder}`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      logger.warn(`[arxiv] search failed ${res.status} for query "${opts.q}"`);
      return [];
    }
    const xml = await res.text();
    return parseArxivAtom(xml).map(entryToPaper);
  } catch (err) {
    logger.warn(`[arxiv] search error for "${opts.q}": ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Deterministic full-text PDF URL. No API call needed — arXiv guarantees
 * `https://arxiv.org/pdf/{id}.pdf` resolves for any extant arxiv_id.
 * The `paper_fetch_full_text` tool downloads from this URL and runs the
 * bytes through a PDF-to-text extractor.
 */
export function arxivPdfUrl(arxivId: string): string {
  return `https://arxiv.org/pdf/${arxivId}.pdf`;
}
