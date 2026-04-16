// Shared contract between the corpus and every surface renderer.
// Markdown front-matter is parsed into DocPage; the body becomes DocBlock[].
// Each surface (web, extension, IDE) implements its own render pass over these types.

export type Audience = 'newcomer' | 'power' | 'both';
export type Surface = 'web' | 'ext' | 'ide';

export type Section =
  | 'start'
  | 'concepts'
  | 'reference'
  | 'features'
  | 'troubleshooting';

export interface DocPage {
  /** Stable id used for anchors, sidebar routing, and i18n keys. Dot-namespaced: 'start.install', 'reference.tools'. */
  id: string;
  /** Human-readable title shown in the sidebar and page heading. */
  title: string;
  /** Which audiences should see this page. ['both'] means always visible. */
  audience: Audience[];
  /** Which surfaces render this page. Omit a surface to hide the page there. */
  surfaces: Surface[];
  /** Sort order within its section (stable integer spacing recommended). */
  order: number;
  /** Top-level section the page belongs to. */
  section: Section;
  /** Body blocks parsed from the markdown file. */
  body: DocBlock[];
}

export type DocBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: 2 | 3 | 4; text: string; anchor?: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; language: string; text: string }
  | { type: 'callout'; variant: 'note' | 'warning' | 'tip'; text: string }
  | { type: 'link'; text: string; href: string; external?: boolean }
  | FactsBlock;

/**
 * A fact-table reference. The renderer looks up the canonical data in `packages/core/docs/data/`
 * and produces a surface-appropriate table/grid/list. Numbers are never in the markdown.
 */
export type FactsBlock =
  | { type: 'facts'; kind: 'tools'; filter?: { category?: string; risk?: string } }
  | { type: 'facts'; kind: 'providers'; filter?: { kind?: 'managed' | 'byok' } }
  | { type: 'facts'; kind: 'modes' }
  | { type: 'facts'; kind: 'personas'; filter?: { mode?: string } }
  | { type: 'facts'; kind: 'permissions' }
  | { type: 'facts'; kind: 'shortcuts'; filter?: { surface?: 'extension' | 'ide' | 'cli' } };

export interface SidebarNode {
  id: string;
  title: string;
  section: Section;
  pages: Array<{ id: string; title: string; audience: Audience[]; anchor: string }>;
}

export const SECTION_LABELS: Record<Section, string> = {
  start: 'Start here',
  concepts: 'Core concepts',
  reference: 'Reference',
  features: 'Features',
  troubleshooting: 'Troubleshooting & support',
};

export const SECTION_ORDER: Section[] = ['start', 'concepts', 'reference', 'features', 'troubleshooting'];
