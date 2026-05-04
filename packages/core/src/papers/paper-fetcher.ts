import type { Paper } from './types.js';
import { fetchPaperByArxivId } from './arxiv-client.js';
import { fetchPaperByOpenAlexId } from './openalex-client.js';
import { fetchPaperByDoi } from './crossref-client.js';

/**
 * Unified paper fetcher. Resolves a free-form identifier (arXiv ID,
 * DOI, OpenAlex ID, or arXiv abstract URL) to a normalised `Paper`,
 * trying each source in priority order. Returns null when no upstream
 * can produce a row — the caller surfaces that as "not found".
 *
 * Priority for resolution:
 *   1. arXiv if the identifier is an arxiv_id or an arxiv URL — fastest,
 *      always has a deterministic full-text PDF URL.
 *   2. OpenAlex for everything else — broadest cross-discipline coverage.
 *   3. Crossref as the final fallback for DOIs that OpenAlex hasn't
 *      indexed (rare, but happens for very recent journal DOIs).
 */

export interface FetchPaperInput {
  /**
   * Free-form identifier. Examples:
   *   - '2310.06825'           (arXiv ID, no version)
   *   - '2310.06825v2'         (arXiv ID with version — version stripped)
   *   - 'https://arxiv.org/abs/2310.06825'
   *   - '10.1038/nature12373'  (DOI)
   *   - 'doi:10.1038/nature12373'
   *   - 'https://doi.org/10.1038/nature12373'
   *   - 'W2741809807'          (OpenAlex ID)
   *   - 'https://openalex.org/W2741809807'
   */
  identifier: string;
}

interface ParsedIdentifier {
  arxiv_id?: string;
  doi?: string;
  openalex_id?: string;
}

/**
 * Recognise an arxiv ID. Two formats:
 *   - new-style: 4-digit YYMM + dot + 4-5 digit sequence (+ optional vN)
 *   - old-style: subject prefix + slash + 7 digits (e.g. 'hep-th/0203074')
 */
function looksLikeArxivId(s: string): boolean {
  return /^\d{4}\.\d{4,5}(v\d+)?$/.test(s)
    || /^[a-z-]+\/\d{7}(v\d+)?$/i.test(s);
}

function stripArxivVersion(s: string): string {
  return s.replace(/v\d+$/, '');
}

function looksLikeDoi(s: string): boolean {
  return /^10\.\d{4,9}\/\S+$/.test(s);
}

function looksLikeOpenAlexId(s: string): boolean {
  return /^W\d+$/.test(s);
}

export function parseIdentifier(input: string): ParsedIdentifier {
  const raw = input.trim();

  // arXiv URL
  const arxivUrlMatch = raw.match(/arxiv\.org\/(?:abs|pdf)\/([\d.]+(?:v\d+)?|[a-z-]+\/\d{7}(?:v\d+)?)/i);
  if (arxivUrlMatch) return { arxiv_id: stripArxivVersion(arxivUrlMatch[1]) };

  // doi.org URL
  const doiUrlMatch = raw.match(/doi\.org\/(.+)$/i);
  if (doiUrlMatch) return { doi: doiUrlMatch[1] };

  // openalex.org URL
  const openalexUrlMatch = raw.match(/openalex\.org\/(W\d+)/i);
  if (openalexUrlMatch) return { openalex_id: openalexUrlMatch[1] };

  // Bare prefix forms
  const doiPrefixMatch = raw.match(/^doi:(.+)$/i);
  if (doiPrefixMatch) return { doi: doiPrefixMatch[1] };

  // Bare identifier forms
  if (looksLikeArxivId(raw)) return { arxiv_id: stripArxivVersion(raw) };
  if (looksLikeOpenAlexId(raw)) return { openalex_id: raw };
  if (looksLikeDoi(raw)) return { doi: raw };

  // Last-resort: if the string contains any DOI-shaped substring, lift it
  const doiInside = raw.match(/(10\.\d{4,9}\/\S+)/);
  if (doiInside) return { doi: doiInside[1] };

  return {};
}

export async function fetchPaper(input: FetchPaperInput, signal?: AbortSignal): Promise<Paper | null> {
  const ids = parseIdentifier(input.identifier);
  if (!ids.arxiv_id && !ids.doi && !ids.openalex_id) return null;

  // Priority 1: arXiv
  if (ids.arxiv_id) {
    const arxivPaper = await fetchPaperByArxivId(ids.arxiv_id, signal);
    if (arxivPaper) return arxivPaper;
  }

  // Priority 2: OpenAlex (handles DOI, OpenAlex ID, and arXiv-via-DOI form)
  const openalexPaper = await fetchPaperByOpenAlexId(ids, signal);
  if (openalexPaper) return openalexPaper;

  // Priority 3: Crossref fallback for DOIs OpenAlex didn't index yet
  if (ids.doi) {
    const crossrefPaper = await fetchPaperByDoi(ids.doi, signal);
    if (crossrefPaper) return crossrefPaper;
  }

  return null;
}
