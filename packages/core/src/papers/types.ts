/**
 * Library → Papers types. These are the Ava-internal canonical shapes
 * for scientific paper metadata, normalised across arXiv / OpenAlex /
 * Crossref. Each upstream client returns a `Paper` regardless of source
 * so callers don't branch on provenance.
 */

/** Discipline buckets surfaced as Featured-tab pivots. */
export type PaperDiscipline =
  | 'ai_cs'
  | 'biology'
  | 'medicine'
  | 'physics'
  | 'chemistry'
  | 'earth_sciences'
  | 'social_sciences'
  | 'economics'
  | 'engineering'
  | 'math'
  | 'other';

export const ALL_DISCIPLINES: PaperDiscipline[] = [
  'ai_cs', 'biology', 'medicine', 'physics', 'chemistry',
  'earth_sciences', 'social_sciences', 'economics', 'engineering',
  'math', 'other',
];

export const DISCIPLINE_LABELS: Record<PaperDiscipline, string> = {
  ai_cs: 'AI & CS',
  biology: 'Biology',
  medicine: 'Medicine',
  physics: 'Physics',
  chemistry: 'Chemistry',
  earth_sciences: 'Earth Sciences',
  social_sciences: 'Social Sciences',
  economics: 'Economics',
  engineering: 'Engineering',
  math: 'Math',
  other: 'Other',
};

export interface PaperAuthor {
  name: string;
  orcid?: string;
  affiliation?: string;
}

/** Where this paper was sourced from at fetch time. */
export type PaperSource = 'arxiv' | 'openalex' | 'crossref';

/**
 * Canonical paper shape used everywhere downstream. All upstream
 * clients normalise to this so the UI and the Tutor's four-layer
 * prompt don't have to know which API supplied the data.
 *
 * At least one of `doi` / `arxiv_id` / `openalex_id` is always set
 * (the upstream clients fail rather than return identifierless rows).
 */
export interface Paper {
  doi?: string;
  arxiv_id?: string;
  openalex_id?: string;
  title: string;
  authors: PaperAuthor[];
  abstract?: string;
  year?: number;
  /** Preferred read link — arXiv PDF, OpenAlex landing page, or DOI URL. */
  primary_url?: string;
  /** Free / open-access full-text URL when known. */
  oa_pdf_url?: string;
  discipline?: PaperDiscipline;
  /** Where this row came from at fetch time. */
  source: PaperSource;
  /** Times-cited count from upstream when available. */
  citation_count?: number;
  /** Preprint server tag like 'cs.AI', 'q-bio.QM'. arXiv only. */
  arxiv_category?: string;
  /** Whether the upstream marks this as withdrawn / retracted. */
  retracted?: boolean;
}

export interface PaperSearchQuery {
  q: string;
  discipline?: PaperDiscipline;
  /** ISO year. Defaults to no constraint. */
  yearMin?: number;
  yearMax?: number;
  /** Sort key. 'relevance' is upstream default; 'date' = newest first. */
  sort?: 'relevance' | 'date' | 'cited';
  /** Page size. Upstream caps apply (OpenAlex 200, arXiv 2000). */
  perPage?: number;
  page?: number;
}

export interface PaperSearchResult {
  papers: Paper[];
  total: number;
  page: number;
  perPage: number;
}

/**
 * Trending signals stored in the `paper_signals` table. The
 * computed_score is a weighted blend tuned in `papers/trending.ts`.
 */
export interface PaperSignal {
  paper_id: string;
  citation_count: number;
  citation_velocity_30d: number;
  hn_score: number;
  reddit_score: number;
  social_mentions_7d: number;
  computed_score: number;
  last_updated: string;
}
