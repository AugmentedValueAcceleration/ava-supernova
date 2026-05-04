import type { Paper, PaperAuthor } from './types.js';
import { inferDisciplineFromText } from './discipline.js';
import { logger } from '../core/logger.js';

/**
 * Crossref DOI metadata client. Free, no auth, polite-pool email
 * recommended (same shape as OpenAlex). Used as a fallback when a
 * DOI lookup misses on OpenAlex — Crossref is the upstream source
 * for most journal DOIs and occasionally has metadata before
 * OpenAlex catches up.
 */

const CROSSREF_API_BASE = 'https://api.crossref.org';

function politeMailto(): string {
  return (typeof process !== 'undefined' && process.env?.CROSSREF_MAILTO) || '';
}

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
  ORCID?: string;
  affiliation?: Array<{ name?: string }>;
}

interface CrossrefDate {
  'date-parts'?: number[][];
}

interface CrossrefWork {
  DOI?: string;
  title?: string[];
  abstract?: string;
  author?: CrossrefAuthor[];
  issued?: CrossrefDate;
  published?: CrossrefDate;
  'is-referenced-by-count'?: number;
  URL?: string;
  link?: Array<{ URL?: string; 'content-type'?: string }>;
}

interface CrossrefResponse {
  status?: string;
  message?: CrossrefWork;
}

/**
 * Crossref returns abstracts wrapped in JATS XML tags. Strip them
 * down to plain prose. Best-effort — if the cleanup fails the raw
 * abstract still flows through, just with the tag noise visible.
 */
function cleanCrossrefAbstract(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw
    .replace(/<jats:[^>]+>/g, '')
    .replace(/<\/jats:[^>]+>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function authorName(a: CrossrefAuthor): string | null {
  if (a.name) return a.name;
  if (a.given && a.family) return `${a.given} ${a.family}`;
  if (a.family) return a.family;
  if (a.given) return a.given;
  return null;
}

function workToPaper(work: CrossrefWork): Paper | null {
  const title = work.title?.[0]?.trim();
  if (!title || !work.DOI) return null;

  const authors: PaperAuthor[] = (work.author ?? [])
    .map(a => {
      const name = authorName(a);
      if (!name) return null;
      return {
        name,
        orcid: a.ORCID?.replace(/^https?:\/\/orcid\.org\//, ''),
        affiliation: a.affiliation?.[0]?.name,
      } as PaperAuthor;
    })
    .filter((a): a is PaperAuthor => a !== null);

  const year = work.issued?.['date-parts']?.[0]?.[0]
    ?? work.published?.['date-parts']?.[0]?.[0];

  const pdfLink = work.link?.find(l => l['content-type'] === 'application/pdf')?.URL;
  const abstract = cleanCrossrefAbstract(work.abstract);

  return {
    doi: work.DOI,
    title,
    authors,
    abstract,
    year,
    primary_url: work.URL ?? `https://doi.org/${work.DOI}`,
    oa_pdf_url: pdfLink,
    discipline: inferDisciplineFromText(title, abstract),
    source: 'crossref',
    citation_count: work['is-referenced-by-count'],
  };
}

export async function fetchPaperByDoi(doi: string, signal?: AbortSignal): Promise<Paper | null> {
  const params = new URLSearchParams();
  const mailto = politeMailto();
  if (mailto) params.set('mailto', mailto);
  const qs = params.toString();
  const url = `${CROSSREF_API_BASE}/works/${encodeURIComponent(doi)}${qs ? `?${qs}` : ''}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      logger.warn(`[crossref] fetch failed ${res.status} for ${doi}`);
      return null;
    }
    const data = await res.json() as CrossrefResponse;
    if (data.status !== 'ok' || !data.message) return null;
    return workToPaper(data.message);
  } catch (err) {
    logger.warn(`[crossref] fetch error for ${doi}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
