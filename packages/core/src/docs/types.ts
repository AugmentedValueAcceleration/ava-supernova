// Shared contract between the corpus and every surface renderer.
// Markdown front-matter is parsed into DocPage; the body becomes DocBlock[].
// Each surface (web, extension, IDE) implements its own render pass over these types.

export type Audience = 'newcomer' | 'power' | 'both';

/**
 * A surface is both a doc-rendering target and a product. For 'ext' | 'ide' |
 * 'companion' | 'cli' the in-app docs describe that product, so capability
 * filtering applies. 'web' is the public site — a superset that shows every
 * page with per-surface badges, so capability filtering never hides on web.
 */
export type Surface = 'web' | 'ext' | 'ide' | 'companion' | 'cli';

/**
 * What you want to do — the task-first front door. Pages are grouped by task;
 * the section taxonomy below becomes the "go deeper" reference layer.
 * Canonical list + copy live in `data/tasks.ts`.
 */
export type TaskId =
  | 'build'
  | 'write'
  | 'learn'
  | 'create'
  | 'health'
  | 'make-it-yours'
  | 'troubleshoot';

/**
 * A product capability that isn't available on every surface (e.g. the IDE has
 * desktop automation and screenshots; the extension does not). The surface set
 * for each capability is declared once in `data/capabilities.ts`. A page that
 * `requires` a capability auto-hides on surfaces that lack it.
 */
export type Capability =
  | 'desktop_automation'
  | 'screenshot'
  | 'browser'
  | 'document_authoring'
  | 'live_doc_preview';

export type Section =
  | 'start'
  | 'models'
  | 'credits'
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
  /**
   * Outcome group for the task-first front door. Optional during migration —
   * untagged pages still render under their `section` in the reference layer.
   */
  task?: TaskId;
  /**
   * Capabilities this page depends on. The page auto-hides on any surface that
   * lacks them (per `data/capabilities.ts`). 'web' always shows it (badged).
   */
  requires?: Capability[];
  /** Shipping status for Ava's product-knowledge answers. Omitted = shipped (the
   *  default). 'preview' = built but gated / limited rollout; 'planned' = on the
   *  roadmap, not built yet. Minimal + local so answers never claim an unshipped
   *  feature is available. */
  status?: 'shipped' | 'preview' | 'planned';
  /** Body blocks parsed from the markdown file. */
  body: DocBlock[];
  /**
   * Optional "Show me the details" depth — power-user blocks rendered behind an
   * expander beneath `body`, so one page serves newcomers and experts alike.
   */
  deeper?: DocBlock[];
}

export type DocBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: 2 | 3 | 4; text: string; anchor?: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; language: string; text: string }
  | { type: 'callout'; variant: 'note' | 'warning' | 'tip'; text: string }
  | { type: 'link'; text: string; href: string; external?: boolean }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | FactsBlock;

/**
 * A fact-table reference. The renderer looks up the canonical data in `packages/core/docs/data/`
 * and produces a surface-appropriate table/grid/list. Numbers are never in the markdown.
 */
export type FactsBlock =
  | { type: 'facts'; kind: 'tools'; filter?: { category?: string; risk?: string } }
  | { type: 'facts'; kind: 'providers'; filter?: { kind?: 'orchestration' | 'managed' | 'byok' } }
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
  models: 'Models',
  credits: 'Credits',
  concepts: 'Core concepts',
  reference: 'Reference',
  features: 'Features',
  troubleshooting: 'Troubleshooting & support',
};

export const SECTION_ORDER: Section[] = ['start', 'models', 'credits', 'concepts', 'reference', 'features', 'troubleshooting'];
