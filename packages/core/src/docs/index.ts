// Public entry point for the docs corpus. Surface renderers import from here.

export type { Audience, Surface, Section, DocPage, DocBlock, FactsBlock, SidebarNode } from './types.js';
export { SECTION_LABELS, SECTION_ORDER } from './types.js';

export type { RendererAdapter, FactsData } from './adapter.js';
export { renderPage, renderBlock } from './adapter.js';

export { filterBySurface, filterByAudience, buildSidebar, anchorFor } from './filter.js';
export { getPages, getPage } from './corpus.js';

export * from './data/tools.js';
export * from './data/providers.js';
export * from './data/modes.js';
export * from './data/personas.js';
export * from './data/permissions.js';
export * from './data/shortcuts.js';
