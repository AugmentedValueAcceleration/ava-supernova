// Corpus loader. Pages are authored directly as TypeScript DocPage objects under `content/`
// so there is no runtime parser to build or maintain and every block is type-checked at write time.
// Each surface imports `getPages()` and runs it through the filters before rendering.

import type { DocPage } from './types.js';
import { ALL_PAGES } from './content/index.js';

export function getPages(): DocPage[] {
  return ALL_PAGES;
}

export function getPage(id: string): DocPage | undefined {
  return ALL_PAGES.find(p => p.id === id);
}
