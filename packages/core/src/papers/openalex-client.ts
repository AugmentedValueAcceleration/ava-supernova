import type { Paper, PaperAuthor, PaperSearchQuery, PaperSearchResult } from './types.js';
import { openalexFieldToDiscipline } from './discipline.js';
import { logger } from '../core/logger.js';

/**
 * OpenAlex API client. Free, no auth required, but adding a contact
 * email lifts you into the "polite pool" with much higher rate limits
 * (100k req/min vs 100k req/day anonymous). Server-side env var only —
 * never ship the email in client bundles.
 *
 * OpenAlex covers ~250M works across every discipline (replaced
 * Microsoft Academic Graph after MS killed it). Single source for
 * cross-field search, citations, author networks, journal metadata.
 *
 * For arXiv-native AI/ML papers, OpenAlex eventually indexes them
 * (24-48h lag) so most queries surface them too. The `arxiv-client`
 * is the parallel path for absolute freshness on AI/ML when needed
 * — kept separate, used for fetch-by-arxiv-id and direct preprint
 * search where 24h matters.
 */

const OPENALEX_API_BASE = 'https://api.openalex.org';

/**
 * Polite-pool email. Set via env var on the server. Empty string ok —
 * the API still works, just with the lower anonymous rate limit.
 */
function politeMailto(): string {
  return (typeof process !== 'undefined' && process.env?.OPENALEX_MAILTO) || '';
}

interface OpenAlexAuthorship {
  author?: { display_name?: string; orcid?: string };
  raw_affiliation_strings?: string[];
}

interface OpenAlexConcept {
  display_name?: string;
  level?: number;
  score?: number;
}

interface OpenAlexLocation {
  pdf_url?: string;
  landing_page_url?: string;
  is_oa?: boolean;
}

interface OpenAlexWork {
  id?: string;
  doi?: string;
  ids?: { openalex?: string; doi?: string; mag?: string };
  title?: string;
  abstract_inverted_index?: Record<string, number[]>;
  publication_year?: number;
  cited_by_count?: number;
  authorships?: OpenAlexAuthorship[];
  concepts?: OpenAlexConcept[];
  primary_location?: OpenAlexLocation;
  best_oa_location?: OpenAlexLocation;
  is_retracted?: boolean;
  // arXiv ID often appears in the IDs map under `mag` or in DOI form
}

interface OpenAlexResponse {
  results?: OpenAlexWork[];
  meta?: { count?: number; page?: number; per_page?: number };
}

/**
 * OpenAlex returns abstracts as inverted indices ({"word": [positions]})
 * to avoid licensing-restricted full text. Reconstruct the prose form
 * by walking positions and slotting words back into a string.
 */
function reconstructAbstract(inverted: Record<string, number[]> | undefined): string | undefined {
  if (!inverted) return undefined;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  // Some positions may be undefined if upstream data is sparse — skip them.
  return words.filter(Boolean).join(' ');
}

/**
 * Strip the URL prefix from an OpenAlex ID. The API returns
 * `https://openalex.org/W2741809807` but downstream callers want just
 * the canonical `W2741809807` form.
 */
function bareOpenAlexId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return id.replace(/^https?:\/\/openalex\.org\//, '');
}

/**
 * Strip the URL prefix from a DOI. OpenAlex returns
 * `https://doi.org/10.xxxx/yyyy` but we store the bare DOI.
 */
function bareDoi(doi: string | undefined): string | undefined {
  if (!doi) return undefined;
  return doi.replace(/^https?:\/\/doi\.org\//, '');
}

/**
 * Best-effort arXiv ID extraction from an OpenAlex work. arXiv preprints
 * have DOIs of the form `10.48550/arXiv.YYMM.NNNNN` which encode the ID.
 */
function extractArxivId(work: OpenAlexWork): string | undefined {
  const doi = bareDoi(work.doi ?? work.ids?.doi);
  if (!doi) return undefined;
  const m = doi.match(/^10\.48550\/arXiv\.(.+)$/i);
  return m?.[1];
}

function workToPaper(work: OpenAlexWork): Paper | null {
  const title = work.title?.trim();
  if (!title) return null;

  const openalex_id = bareOpenAlexId(work.id);
  const doi = bareDoi(work.doi ?? work.ids?.doi);
  const arxiv_id = extractArxivId(work);

  if (!openalex_id && !doi && !arxiv_id) return null;

  const authors: PaperAuthor[] = (work.authorships ?? [])
    .filter(a => a.author?.display_name)
    .map(a => ({
      name: a.author!.display_name!,
      orcid: a.author!.orcid,
      affiliation: a.raw_affiliation_strings?.[0],
    }));

  // OpenAlex concepts are scored; pick the top level-0 concept as the
  // discipline signal. Falls back to keyword inference downstream if
  // none present.
  const topConcept = (work.concepts ?? [])
    .filter(c => c.level === 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

  const oa_pdf_url = work.best_oa_location?.pdf_url
    ?? work.primary_location?.pdf_url
    ?? undefined;

  const primary_url = work.primary_location?.landing_page_url
    ?? (doi ? `https://doi.org/${doi}` : undefined)
    ?? (arxiv_id ? `https://arxiv.org/abs/${arxiv_id}` : undefined);

  return {
    doi,
    arxiv_id,
    openalex_id,
    title,
    authors,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    year: work.publication_year,
    primary_url,
    oa_pdf_url,
    discipline: openalexFieldToDiscipline(topConcept?.display_name),
    source: 'openalex',
    citation_count: work.cited_by_count,
    retracted: work.is_retracted,
  };
}

function buildSearchUrl(q: PaperSearchQuery): string {
  const params = new URLSearchParams();
  params.set('search', q.q);
  const filters: string[] = [];
  if (q.yearMin) filters.push(`from_publication_date:${q.yearMin}-01-01`);
  if (q.yearMax) filters.push(`to_publication_date:${q.yearMax}-12-31`);
  if (filters.length > 0) params.set('filter', filters.join(','));
  if (q.sort === 'date') params.set('sort', 'publication_date:desc');
  else if (q.sort === 'cited') params.set('sort', 'cited_by_count:desc');
  // 'relevance' is default — no sort param
  params.set('per_page', String(Math.min(q.perPage ?? 25, 100)));
  params.set('page', String(Math.max(q.page ?? 1, 1)));
  const mailto = politeMailto();
  if (mailto) params.set('mailto', mailto);
  return `${OPENALEX_API_BASE}/works?${params.toString()}`;
}

export async function searchOpenAlex(query: PaperSearchQuery, signal?: AbortSignal): Promise<PaperSearchResult> {
  const url = buildSearchUrl(query);
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      logger.warn(`[openalex] search failed ${res.status} for "${query.q}"`);
      return { papers: [], total: 0, page: query.page ?? 1, perPage: query.perPage ?? 25 };
    }
    const data = await res.json() as OpenAlexResponse;
    const papers: Paper[] = [];
    for (const work of data.results ?? []) {
      const paper = workToPaper(work);
      if (paper) papers.push(paper);
    }
    return {
      papers,
      total: data.meta?.count ?? papers.length,
      page: data.meta?.page ?? query.page ?? 1,
      perPage: data.meta?.per_page ?? query.perPage ?? 25,
    };
  } catch (err) {
    logger.warn(`[openalex] search error for "${query.q}": ${err instanceof Error ? err.message : String(err)}`);
    return { papers: [], total: 0, page: query.page ?? 1, perPage: query.perPage ?? 25 };
  }
}

/**
 * Fetch a single OpenAlex work by ID, DOI, or arXiv ID. Resolves any
 * of the three identifier types via OpenAlex's flexible /works/{id}
 * endpoint which accepts `W123`, `doi:10.x/y`, or `mag:NNN` forms.
 */
export async function fetchPaperByOpenAlexId(
  identifier: { openalex_id?: string; doi?: string; arxiv_id?: string },
  signal?: AbortSignal,
): Promise<Paper | null> {
  let path: string;
  if (identifier.openalex_id) {
    path = `/works/${identifier.openalex_id}`;
  } else if (identifier.doi) {
    path = `/works/doi:${identifier.doi}`;
  } else if (identifier.arxiv_id) {
    // OpenAlex indexes arXiv preprints under their DOI form
    path = `/works/doi:10.48550/arXiv.${identifier.arxiv_id}`;
  } else {
    return null;
  }
  const params = new URLSearchParams();
  const mailto = politeMailto();
  if (mailto) params.set('mailto', mailto);
  const url = `${OPENALEX_API_BASE}${path}${params.toString() ? `?${params.toString()}` : ''}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      logger.warn(`[openalex] fetch failed ${res.status} for ${JSON.stringify(identifier)}`);
      return null;
    }
    const work = await res.json() as OpenAlexWork;
    return workToPaper(work);
  } catch (err) {
    logger.warn(`[openalex] fetch error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
