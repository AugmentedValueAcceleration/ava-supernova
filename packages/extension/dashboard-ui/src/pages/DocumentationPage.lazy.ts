import { lazy } from 'react';

/**
 * The ONE lazy binding for the documentation page. Both call sites must use it.
 *
 * Documentation is the heaviest page in the app, not for its own code but for
 * what it reaches: it is the only consumer of @ava/core/docs, and that graph
 * carries docs/i18n/translations.js — the whole corpus in twenty languages,
 * 1,661KB, measured 7 Oct 2026 at 24% of the entire dashboard bundle.
 *
 * ── Why this file exists rather than a lazy() at each call site ──
 *
 * A module reachable BOTH statically and dynamically stays in the entry chunk;
 * the dynamic import simply stops being a split point. App.tsx was given a
 * lazy() first and the bundle moved by 62KB instead of 1,661KB, with no chunk
 * emitted at all, because HelpPage still did `import { DocumentationPage }` for
 * its docs tab. One static importer anywhere undoes the split everywhere.
 *
 * Importing the binding from here makes that mistake hard to repeat: there is
 * no named export of the page component to reach for by habit.
 */
export const DocumentationPageLazy = lazy(() =>
  import('./DocumentationPage').then((m) => ({ default: m.DocumentationPage })),
);
