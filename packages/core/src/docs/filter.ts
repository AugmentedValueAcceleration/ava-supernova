// Audience + surface filtering. Used by every surface renderer before displaying pages.

import type { DocPage, Audience, Surface, SidebarNode } from './types.js';
import { SECTION_LABELS, SECTION_ORDER } from './types.js';

/**
 * Keep only pages that should render on this surface.
 * A page with surfaces: ['web', 'ide'] is hidden from the extension.
 */
export function filterBySurface(pages: DocPage[], surface: Surface): DocPage[] {
  return pages.filter(p => p.surfaces.includes(surface));
}

/**
 * Keep only pages matching the current audience mode.
 *   'everything' → show all pages
 *   'newcomer'   → hide pages tagged power-only (but keep 'both' and 'newcomer')
 *
 * Power-only pages are the Reference section by default. A page tagged
 * ['newcomer', 'power'] or ['both'] shows in both modes.
 */
export function filterByAudience(
  pages: DocPage[],
  mode: 'newcomer' | 'everything',
): DocPage[] {
  if (mode === 'everything') return pages;
  return pages.filter(p => !isPowerOnly(p.audience));
}

function isPowerOnly(audience: Audience[]): boolean {
  if (audience.length === 0) return false;
  return audience.every(a => a === 'power');
}

/**
 * Build the sidebar tree: sections in the canonical order, pages within each section sorted by `order`.
 */
export function buildSidebar(pages: DocPage[]): SidebarNode[] {
  return SECTION_ORDER
    .map<SidebarNode>(section => ({
      id: section,
      title: SECTION_LABELS[section],
      section,
      pages: pages
        .filter(p => p.section === section)
        .sort((a, b) => a.order - b.order)
        .map(p => ({ id: p.id, title: p.title, audience: p.audience, anchor: anchorFor(p.id) })),
    }))
    .filter(node => node.pages.length > 0);
}

/** Convert a page id into a URL anchor fragment. */
export function anchorFor(pageId: string): string {
  return pageId.replace(/\./g, '-');
}
