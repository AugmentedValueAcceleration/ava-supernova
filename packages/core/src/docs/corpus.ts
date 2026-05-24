// Corpus loader. Pages are authored directly as TypeScript DocPage objects under `content/`
// so there is no runtime parser to build or maintain and every block is type-checked at write time.
// Each surface imports `getPages()` and runs it through the filters before rendering.

import type { DocPage } from './types.js';
import { ALL_PAGES } from './content/index.js';
import { localizePages } from './i18n.js';

/** The full corpus, optionally translated. `locale` 'en' (or omitted, or an
 *  unknown locale) returns English; any other locale returns the corpus with
 *  translated text and per-block English fallback. */
export function getPages(locale?: string): DocPage[] {
  return localizePages(ALL_PAGES, locale);
}

export function getPage(id: string, locale?: string): DocPage | undefined {
  const page = ALL_PAGES.find(p => p.id === id);
  if (!page) return undefined;
  return localizePages([page], locale)[0];
}
