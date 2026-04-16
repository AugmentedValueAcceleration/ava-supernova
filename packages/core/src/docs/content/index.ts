// All pages concatenated in canonical section order.
// Import one thing from here; get the whole corpus.

import type { DocPage } from '../types.js';
import { START_PAGES } from './start.js';
import { CONCEPT_PAGES } from './concepts.js';
import { REFERENCE_PAGES } from './reference.js';
import { FEATURE_PAGES } from './features.js';
import { TROUBLESHOOTING_PAGES } from './troubleshooting.js';

export const ALL_PAGES: DocPage[] = [
  ...START_PAGES,
  ...CONCEPT_PAGES,
  ...REFERENCE_PAGES,
  ...FEATURE_PAGES,
  ...TROUBLESHOOTING_PAGES,
];
