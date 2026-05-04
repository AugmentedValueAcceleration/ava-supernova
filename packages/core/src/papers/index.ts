export type {
  Paper,
  PaperAuthor,
  PaperSource,
  PaperDiscipline,
  PaperSearchQuery,
  PaperSearchResult,
  PaperSignal,
} from './types.js';
export { ALL_DISCIPLINES, DISCIPLINE_LABELS } from './types.js';

export {
  arxivCategoryToDiscipline,
  openalexFieldToDiscipline,
  inferDisciplineFromText,
} from './discipline.js';

export {
  fetchPaperByArxivId,
  searchArxiv,
  arxivPdfUrl,
} from './arxiv-client.js';
export type { ArxivSearchOptions } from './arxiv-client.js';

export {
  searchOpenAlex,
  fetchPaperByOpenAlexId,
} from './openalex-client.js';

export { fetchPaperByDoi } from './crossref-client.js';

export { fetchPaper, parseIdentifier } from './paper-fetcher.js';
export type { FetchPaperInput } from './paper-fetcher.js';
